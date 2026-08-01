import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import { CardBody } from "../CardBody";
import { spinAngle, spinScale, spinShowsOther } from "../flip";
import { easeOutQuad } from "../anim/easing";
import { TEX_H, TEX_W } from "../engine/constants";
import { scaleForState, shadowSilhouette } from "./plane";
import { burnFrame, BURN_DUR } from "../effects/burn";
import { ParticleField, type ParticleParams } from "../engine/censorParticles";
import { DANCE_DEFAULT, DUST_FLICKER, dustParams } from "../censorConfig";
import type { Burnable, Concealable, Draggable, Flippable, Peekable, TableElement, Valued } from "../engine/element";
import type { FaceStyle } from "../engine/cardTextures";
import type { CardBackId } from "../cardBack";
import type { CardTextureCache } from "./CardTextureCache";
import { cardTags, withTags } from "../board/elementTags";

// Карта UI-kit — объект с пропсами (масштабируемый, расширяемый) И «высотой над столом».
//
// План (state) задаёт, в каком слое лежит карта и как высоко парит:
//   idle     — лежит на столе (низкая тень);
//   floating — парит (тень дальше/крупнее, слегка больше, покачивается в воздухе — bob);
//   drag     — в руке игрока (наивысшая, тень растёт сильнее всего);
//   fan      — в вееере (задел на будущее).
// Смена плана меняет целевой масштаб (пружина CardBody), поэтому размер/тень/позиция едут
// ПЛАВНО. Тень карта НЕ рисует сама: в sync() она считает СИЛУЭТ тени (shadowRect) — его
// движок собирает в общую маску уровня и заливает одной непрозрачной заливкой (см.
// ShadowLayer). Так пересекающиеся тени сливаются в одну и не темнят. Смещение/размер силуэта
// растут с «высотой» (elev): свет сверху справа → тень уходит вниз-влево, сильнее вниз.

export type CardState = "idle" | "floating" | "held" | "drag" | "fan";
export type RestState = "idle" | "floating" | "held";

/** Силуэт тени карты (центр, полуразмеры, поворот) — движок сливает их в маску уровня. */
export interface ShadowShape {
  x: number;
  y: number;
  hw: number;
  hh: number;
  rot: number;
  round?: boolean; // тень-ЭЛЛИПС (круглая фишка, овальная подставка фигуры), а не карточный прямоугольник
}

export interface CardOptions {
  id?: string; // КЛЮЧ идентичности (опаковый): по нему адресуем/анимируем. Значение — отдельно ↓
  card?: string; // ЗНАЧЕНИЕ (ранг+масть). undefined → дефолт "A♠"; "" → значение придержано (маска)
  faceUp?: boolean;
  flippable?: boolean;
  draggable?: boolean; // можно ли тащить; false — драг блокируется «стоп»-анимацией
  back?: CardBackId;
  faceStyle?: FaceStyle;
  fourColor?: boolean;
  torn?: boolean;
  size?: number;
  hidden?: boolean; // НАЧАЛЬНАЯ скрытость (режим секретности); дальше переключается setConcealed()
  censored?: boolean; // НАЧАЛЬНАЯ цензура (пыль ПОВЕРХ лица); дальше переключается setCensored()
  custom?: string; // id кастом-лица из реестра CUSTOM_FACES (напр. "joker"); "" — обычное число
  rest?: RestState; // план ПОКОЯ: idle (на столе) / floating (левитация, «в руке») / held (в руке держат)
  tags?: string[]; // ИГРОВЫЕ теги поверх авто (card/suit/rank/color): role:trump, team:blue — SELECTION-DESIGN §2
}

interface FlipAnim {
  t: number;
  dur: number;
  fromFaceUp: boolean;
}

const BOB_SPEED = 2.2;
const DUST_FADE_DUR = 0.4; // fade вкл/выкл пыли — как у block (Card.ts blockNudge)

export class Card implements TableElement, Draggable, Flippable, Burnable, Concealable, Peekable, Valued {
  readonly root = new Container();
  readonly body = new CardBody();
  shadowRect: ShadowShape | null = null; // силуэт тени, обновляется в sync(); движок его собирает
  bobPhase = 0; // сдвиг фазы парения, чтобы карты не качались в унисон
  peekBob = false; // висит в «подглядеть» — тот же bob, что у floating, чтобы не читалось как зависание
  /** OS/юзер reduce-motion (см. useReducedMotion): движок ставит на спавне и при смене (issue #7).
   *  Замораживает bob и живую пыль в статичный кадр — не трогает флип/драг/полёты (не в скоупе). */
  reduceMotion = false;
  /** «Без вспышек» (issue #9, фото-чувствительность): гасит дрожь «сжечь», оставляя плавный расход. */
  flashOff = false;
  /** Лёгкий профиль качества (issue #8, reduced): замораживает idle-дыхание и живую пыль как
   *  reduce-motion — движок ставит на спавне/смене при просадке FPS. Тени гасит сам движок (пасс). */
  lowFx = false;

  readonly id: string; // ключ
  private _card: string; // значение (придержано = ""), проставляется setValue (раскрытие)
  faceUp: boolean;
  readonly flippable: boolean;
  readonly draggable: boolean;
  readonly back: CardBackId;
  readonly faceStyle: FaceStyle;
  readonly fourColor: boolean;
  readonly torn: boolean;
  readonly size: number;
  private _concealed: boolean; // режим секретности (изначально opts.hidden), переключается извне
  private _censored: boolean; // цензура-фильтр (изначально opts.censored), переключается извне
  readonly custom: string; // id кастом-лица (реестр CUSTOM_FACES); "" — обычная числовая карта
  private readonly extraTags: ReadonlySet<string>; // игровые теги поверх авто (см. tags getter)

  state: CardState = "idle";
  readonly rest: RestState;
  private age = 0;
  private readonly baseSprite = new Sprite();
  private flip: FlipAnim | null = null;
  private block: { t: number; dur: number } | null = null; // «стоп»-покачивание при блоке драга
  private dying: { t: number; dur: number } | null = null; // «сжечь»: замирание → расход снизу вверх
  private burnMask: Graphics | null = null; // маска фронта горения (создаётся на фазе расхода)
  private dust: ParticleField | null = null; // живая «пыль»-цензура скрытой карты (TG-спойлер)
  private dustT = 0; // локальное время пыли (крутит только пока она видна)
  private dustAlpha = 0; // сглаженная альфа пыли — плавный fade вместо мгновенного visible-тумблера
  private fadeSprite: Sprite | null = null; // старая текстура лица, кросс-фейдится поверх новой при смене masked
  private fadeT = 0;
  dead = false; // догорела — движок убирает её из песочницы

  constructor(
    opts: CardOptions,
    private readonly tex: CardTextureCache,
    private readonly baseScale: number,
  ) {
    this.id = opts.id ?? "";
    this._card = opts.card ?? "A♠";
    this.faceUp = opts.faceUp ?? true;
    this.flippable = opts.flippable ?? true;
    this.draggable = opts.draggable ?? true;
    this.back = opts.back ?? "ruby";
    this.faceStyle = opts.faceStyle ?? "pips";
    this.fourColor = opts.fourColor ?? false;
    this.torn = opts.torn ?? false;
    this.size = opts.size ?? 1;
    this._concealed = opts.hidden ?? false;
    this._censored = opts.censored ?? false;
    this.custom = opts.custom ?? "";
    this.extraTags = new Set(opts.tags ?? []);
    this.rest = opts.rest ?? "idle";
    this.state = this.rest; // стартуем в своём плане покоя

    this.baseSprite.anchor.set(0.5);
    this.root.addChild(this.baseSprite);
    if (this.dusty) this.buildDust();
    if (this.torn) this.root.addChild(this.buildTear());
    if (!this.flippable) this.root.addChild(this.buildLock());
    this.paint();
    this.dustAlpha = this.dustActive ? 1 : 0; // без fade на спавне — сразу в целевом состоянии
  }

  /** Идентичность-ДАННЫЕ (SELECTION-DESIGN §2): авто-теги по значению + игровые (extraTags). Живой
   *  геттер — после setValue (раскрытия) масть/ранг обновляются сами. Кастом-лицо → card+custom:id. */
  get tags(): ReadonlySet<string> {
    const base = this.custom ? new Set(["card", `custom:${this.custom}`]) : cardTags(this._card);
    return this.extraTags.size ? withTags(base, this.extraTags) : base;
  }

  // Живая «пыль»-цензура: облако частиц, построенное по НАСТОЯЩЕМУ лицу этой карты (цвет у каждой
  // частицы свой), поверх чистой подложки. Обрезано по карте маской-прямоугольником со скруглением.
  //
  // Раньше облако было общим на всю комнату и строилось по силуэту фака: цензура выглядела
  // одинаковой жёлтой крошкой поверх чего угодно — и туза пик, и джокера. Теперь пыль повторяет то,
  // что прячет.
  private buildDust(): void {
    this.dust = new ParticleField(this.dustSeeds(), dustParams(DANCE_DEFAULT, DUST_FLICKER));
    const mask = new Graphics();
    // Маска повторяет ПЛАСТИНУ карты, а не её габарит: лицо нарисовано с отступом 2 px от края
    // (roundRect(2,2,…) в cardTextures), и без этого отступа пыль садилась в двухпиксельное кольцо
    // ЗА пластиной — по краю карты шла заметная бахрома.
    mask.roundRect(-TEX_W / 2 + 2, -TEX_H / 2 + 2, TEX_W - 4, TEX_H - 4, 16).fill({ color: 0xffffff });
    this.dust.view.mask = mask;
    this.root.addChild(this.dust.view, mask);
  }

  /** Точки рождения пыли для ТЕКУЩЕГО лица. Кэш общий на комнату и ключуется тем же ключом, что и
   *  сама текстура, — одинаковые карты делят одно облако. */
  private dustSeeds(): ReadonlyArray<{ x: number; y: number; color: number }> {
    return this.tex.faceDustPoints(this.faceKey(), this.plainFaceTex(this.faceUp));
  }

  /** Ключ лица — ровно те параметры, от которых лицо зависит. Разъехаться с plainFaceTex не может:
   *  ветки здесь и там перечислены в одном порядке и по одним условиям. */
  private faceKey(): string {
    if (!this.faceUp) return `back:${this.back}`;
    if (this.masked) return "hidden";
    if (this.custom && this.tex.customFace(this.custom)) return `custom:${this.custom}`;
    return `face:${this._card}|${this.fourColor ? 1 : 0}|${this.faceStyle}`;
  }

  /** Значение карты (ранг+масть); "" — придержано. Ключ — это id, не значение. */
  get card(): string {
    return this._card;
  }

  /** Есть ли у клиента значение (иначе оно придержано сервером). */
  get hasValue(): boolean {
    return this._card !== "";
  }

  /** Скрыта ли карта (режим секретности). Снимается/ставится извне (BoardAPI: setConcealed). */
  get concealed(): boolean {
    return this._concealed;
  }

  /** Зацензурена ли карта (фильтр-пыль поверх настоящего лица). Снимается/ставится извне. */
  get censored(): boolean {
    return this._censored;
  }

  // СКРЫТОСТЬ и ЦЕНЗУРА — два разных явления, и их нельзя путать:
  //
  //   masked  — показывать МАСКУ ВМЕСТО лица. Значения у клиента либо нет вовсе (сервер придержал),
  //             либо оно объявлено секретным. Под пылью — чистый фон: показывать нечего.
  //   censored — лицо рисуется НАСТОЯЩЕЕ, а пыль ложится ПОВЕРХ него фильтром. Значение у клиента
  //             есть, но смотреть на него сейчас нельзя. Работает на ЛЮБОМ лице: числовом,
  //             кастомном, каком угодно.
  //
  // Отсюда и разделение полей: masked меняет ТЕКСТУРУ, censored — только слой пыли над ней.
  private get masked(): boolean {
    return this._concealed || !this.hasValue;
  }

  /** Нужна ли этой карте пыль вообще (маска ИЛИ фильтр) — по этому признаку она лениво строится. */
  private get dusty(): boolean {
    return this.masked || this._censored;
  }

  /** Переключить скрытость в рантайме: перерисовать лицо (при надобности — лениво построить «пыль»). */
  setConcealed(v: boolean): void {
    if (v === this._concealed) return;
    this._concealed = v;
    this.refaceMasked();
  }

  /** Покрутить рычаги живой пыли (размер частицы, разлёт, жизнь, мерцание). Нужен стенду и
   *  каталогу: без него параметры пыли задаются только при рождении карты и «поиграться» с ними
   *  нельзя — пришлось бы пересобирать сцену на каждый шаг ползунка. */
  setDustParams(p: Partial<ParticleParams>): void {
    this.dust?.setParams(p);
  }

  /** Переключить ЦЕНЗУРУ в рантайме. Лицо при этом не меняется — меняется только слой пыли над ним,
   *  поэтому кросс-фейд текстуры (refaceMasked) тут не нужен: пыль сама наплывает через dustAlpha. */
  setCensored(v: boolean): void {
    if (v === this._censored) return;
    this._censored = v;
    // Через тот же путь, что и скрытость: под пылью печатается чистая подложка, и смену текстуры
    // надо кросс-фейдить, иначе лицо щёлкает под ещё прозрачной пылью.
    this.refaceMasked();
  }

  /** Есть ли что подглядеть: карта скрыта, зацензурена ИЛИ лежит рубашкой. ЧИСТЫЙ предикат (без
   *  мутаций) — зона ПОДГЛЯДЕТЬ читает его для armed-текста («давай подсмотрим?» vs «зачем?»). */
  get canPeek(): boolean {
    return this._concealed || this._censored || !this.faceUp;
  }

  /**
   * «Подглядеть»: раскрыть карту (снять скрытость, перевернуть лицом вверх если лежала рубашкой) и
   * ВЕРНУТЬ функцию-undo, восстанавливающую прежний вид. reveal и restore живут одной парой — движок
   * лишь держит undo и зовёт его по таймеру / концу драга (см. playgroundEngine.startPeek), так что
   * «перевернул, но забыл перевернуть назад» взяться неоткуда. peekBob (парение показанной карты,
   * чтобы не читалась зависшей) ставится и снимается тем же undo.
   * Край: перехватить и повторно бросить карту ЗА <0.45с (reveal-флип ещё крутится) — встречный
   * requestFlip в undo откажет (this.flip занят), рубашка не вернётся; PEEK_DUR=3 делает обычные
   * пути безопасными, отдельный механизм на этот дабл-тап пока не заводим.
   */
  peekReveal(): (() => void) | null {
    if (!this.canPeek) return null;
    const wasFaceUp = this.faceUp;
    const wasConcealed = this._concealed;
    const wasCensored = this._censored;
    if (!wasFaceUp) this.requestFlip();
    this.setConcealed(false);
    this.setCensored(false); // фильтр снимаем тоже: иначе «подглядел» показывало бы пыль вместо лица
    this.peekBob = true;
    return () => {
      if (!wasFaceUp) this.requestFlip();
      this.setConcealed(wasConcealed);
      this.setCensored(wasCensored);
      this.peekBob = false;
    };
  }

  /** Проставить/придержать значение (раскрытие сервером): "" прячет, непустое — показывает лицо. */
  setValue(v: string): void {
    if (v === this._card) return;
    this._card = v;
    this.refaceMasked();
  }

  // Лениво построить «пыль» если карта теперь маскируется, и перерисовать лицо. Смена ЛИЦА
  // (не только пыли) иначе была резкой: пыль плавно наплывала (dustAlpha/DUST_FADE_DUR), а
  // текстура ПОД ней («лицо» ↔ «чистый фон под пылью») щёлкала мгновенно в момент вызова —
  // на скрытии это читалось как рывок под ещё прозрачной в начале пылью. Старую текстуру держим
  // тем же DUST_FADE_DUR кросс-фейдом поверх новой (см. fadeSprite/step/sync).
  private refaceMasked(): void {
    if (this.dusty && !this.dust) this.buildDust();
    else this.dust?.setPoints(this.dustSeeds()); // лицо сменилось — пыль обязана поехать за ним
    const oldTex = this.baseSprite.texture;
    this.paint(); // маска → чистый фон под пылью; иначе — настоящее лицо (пыль гаснет в sync)
    if (this.baseSprite.texture === oldTex) return;
    this.fadeSprite?.destroy();
    this.fadeSprite = new Sprite(oldTex);
    this.fadeSprite.anchor.set(0.5);
    this.root.addChildAt(this.fadeSprite, this.root.getChildIndex(this.baseSprite) + 1);
    this.fadeT = 0;
  }

  /**
   * Показываем ли пыль вообще. Требование «лицом вверх» здесь принципиально: рубашка ничего не
   * прячет — она и так публична, — поэтому цензурить её нечего и незачем.
   */
  private get dustShown(): boolean {
    return this.dust !== null && this.dusty && this.faceUp;
  }

  /** Видна ли сейчас пыль (вне переворота/горения) — тогда её крутим, цикл не спит. */
  private get dustActive(): boolean {
    return this.dustShown && !this.flip && !this.dying && !this.dead;
  }

  get scaleFactor(): number {
    return this.baseScale * this.size;
  }

  get width(): number {
    return TEX_W * this.scaleFactor;
  }

  get height(): number {
    return TEX_H * this.scaleFactor;
  }

  /** Масштаб плана покоя карты — движок им расставляет карты при монтировании. */
  get restScale(): number {
    return scaleForState(this.rest);
  }

  /** Полуразмеры покоя (для обобщённого хит-теста; движок берёт их × scaleVal). */
  get footprint(): { hw: number; hh: number } {
    return { hw: this.width / 2, hh: this.height / 2 };
  }

  /** Сменить план: целевой масштаб едет пружиной, поэтому размер/тень/позиция — плавно. */
  setState(s: CardState): void {
    this.state = s;
    this.body.setTarget({ scale: scaleForState(s) });
  }

  requestFlip(): boolean {
    if (!this.flippable || this.flip) return false;
    this.flip = { t: 0, dur: 0.45, fromFaceUp: this.faceUp };
    this.fadeSprite?.destroy(); // флип сам сменит текстуру спином — кросс-фейд лица тут не к месту
    this.fadeSprite = null;
    return true;
  }

  /** Лёгкая «стоп»-анимация: короткое затухающее покачивание — «эту карту тащить нельзя». */
  blockNudge(): void {
    if (!this.block) this.block = { t: 0, dur: 0.4 };
  }

  /** Сжечь: карта замирает, потом расходится снизу вверх при сильной дрожи; затем dead → убирают. */
  burn(): void {
    if (!this.dying && !this.dead) this.dying = { t: 0, dur: BURN_DUR };
  }

  get burning(): boolean {
    return this.dying !== null;
  }

  /** idle заморожен: reduce-motion (комфорт, issue #7) ИЛИ лёгкий профиль (перф, issue #8). */
  private get idleFrozen(): boolean {
    return this.reduceMotion || this.lowFx;
  }

  step(dt: number): void {
    this.age += dt;
    this.body.step(dt);
    const dustTarget = this.dustActive ? 1 : 0;
    if (this.dustAlpha !== dustTarget) {
      const step = dt / DUST_FADE_DUR;
      this.dustAlpha += Math.sign(dustTarget - this.dustAlpha) * Math.min(Math.abs(dustTarget - this.dustAlpha), step);
    }
    if ((this.dustActive || this.dustAlpha > 0) && !this.idleFrozen) {
      this.dustT += dt;
      this.dust!.update(this.dustT);
    }
    if (this.flip) {
      this.flip.t += dt;
      if (this.flip.t >= this.flip.dur) {
        this.faceUp = !this.flip.fromFaceUp;
        this.flip = null;
        this.dust?.setPoints(this.dustSeeds()); // сторона сменилась — пыль смазывает уже её
        this.paint();
      }
    }
    if (this.block) {
      this.block.t += dt;
      if (this.block.t >= this.block.dur) this.block = null;
    }
    if (this.dying) {
      this.dying.t += dt;
      if (this.dying.t >= this.dying.dur) {
        this.dying = null;
        this.dead = true;
      }
    }
    if (this.fadeSprite) {
      this.fadeT += dt;
      if (this.fadeT >= DUST_FADE_DUR) {
        this.fadeSprite.destroy();
        this.fadeSprite = null;
      } else {
        this.fadeSprite.alpha = 1 - this.fadeT / DUST_FADE_DUR;
      }
    }
  }

  /** Парящая карта не «отдыхает» — она качается, значит цикл не должен засыпать под ней. Живая
   *  пыль тоже «шевелится» непрерывно: пока она видна ИЛИ ещё доезжает fade — цикл держим бодрым.
   *  Под reduceMotion bob и вращение пыли заморожены (step()/sync() выше), поэтому оба условия
   *  здесь отпускают цикл в сон — иначе статичный кадр жёг бы 60fps вхолостую. */
  get resting(): boolean {
    const bobSettled = this.idleFrozen || !this.peekBob;
    const dustSettled = this.idleFrozen || (!this.dustActive && this.dustAlpha === 0);
    return this.body.isResting() && !this.flip && !this.block && !this.dying && this.state !== "floating" && bobSettled && dustSettled && !this.fadeSprite;
  }

  sync(): void {
    if (this.dust) {
      this.dust.view.visible = this.dustAlpha > 0.001;
      this.dust.view.alpha = this.dustAlpha;
    }
    const render = this.body.scaleVal * this.scaleFactor;
    // «Парение»: покачивание вверх-вниз только у floating; выше поднялась — дальше тень.
    let bobY = 0;
    let bobLift = 0;
    if (!this.idleFrozen && (this.state === "floating" || this.peekBob)) {
      const b = Math.sin(this.age * BOB_SPEED + this.bobPhase);
      bobY = b * this.height * 0.05;
      bobLift = (b * 0.5 + 0.5) * 0.12;
    }

    // «Стоп»-покачивание при заблокированном драге: затухающее мелкое смещение вбок.
    let shakeX = 0;
    if (this.block) {
      const p = this.block.t / this.block.dur;
      shakeX = Math.sin(this.block.t * 42) * this.width * 0.05 * (1 - p);
    }

    this.root.position.set(this.body.px + shakeX, this.body.py + bobY);
    this.root.rotation = this.body.rotation;
    let spinX = 1; // гориз. сжатие при перевороте — им же сужаем тень
    if (this.flip) {
      const angle = spinAngle(easeOutQuad(Math.min(1, this.flip.t / this.flip.dur)), 1);
      spinX = spinScale(angle);
      this.root.scale.set(render * spinX, render);
      const showOther = spinShowsOther(angle);
      this.baseSprite.texture = this.faceTex(showOther ? !this.flip.fromFaceUp : this.flip.fromFaceUp);
    } else {
      this.root.scale.set(render);
    }

    // Силуэт тени. Смещение растёт с «высотой» (карта выше — тень дальше, сильнее вниз). РАЗМЕР
    // тени — от размера ПОКОЯ карты (scaleFactor), а не от увеличенной драгом (render): по
    // перспективе приподнятая карта кажется крупнее, но её тень на доске почти исходного
    // размера, лишь чуть подрастая с высотой. В покое сдвиг маленький (тень прижата).
    this.shadowRect = shadowSilhouette({
      px: this.body.px,
      py: this.body.py,
      shakeX,
      bobY,
      bobLift,
      rotation: this.body.rotation,
      scaleVal: this.body.scaleVal,
      scaleFactor: this.scaleFactor,
      spinX,
    });

    // «Сжечь». Две фазы: ЗАМИРАНИЕ (держим на месте, дрожь нарастает) → РАСХОД снизу вверх
    // (маска отрезает низ волнистым «фронтом горения») при сильной дрожи. Без общего затухания:
    // видимость съедает именно маска. Накладывается ПОВЕРХ обычного sync.
    if (this.dying) {
      const f = burnFrame(this.dying.t, this.age, this.width);
      // «Без вспышек»: дрожь — фото-триггер, гасим её (jitter→0), плавный расход маской остаётся.
      const jx = this.flashOff ? 0 : f.jitterX;
      const jy = this.flashOff ? 0 : f.jitterY;
      this.root.position.set(this.body.px + jx, this.body.py + jy);
      if (f.dissolve) {
        // Маска оставляет видимой верхнюю часть; фронт горения едет вверх (см. burnFrame).
        if (!this.burnMask) {
          this.burnMask = new Graphics();
          this.root.addChild(this.burnMask);
          this.root.mask = this.burnMask;
        }
        this.burnMask.clear();
        this.burnMask.poly(f.dissolve.maskPoints).fill(0xffffff);
        if (this.shadowRect) {
          if (f.dissolve.shadowShrink === null) this.shadowRect = null;
          else this.shadowRect.hh *= f.dissolve.shadowShrink;
        }
      }
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }

  // ——— отрисовка ———

  /** Лицо БЕЗ учёта цензуры — то, что карта показала бы, не будь на ней пыли. Из него же строится
   *  облако пыли: смазывать надо именно это. */
  private plainFaceTex(faceUp: boolean): Texture {
    if (!faceUp) return this.tex.back(this.back);
    if (this.masked) return this.tex.hiddenFace(); // значения нет/оно секретно → статичный фак
    if (this.custom) {
      const t = this.tex.customFace(this.custom);
      if (t) return t; // неизвестный id → падаем на обычное число
    }
    return this.tex.face(this._card, this.fourColor, this.faceStyle);
  }

  /**
   * Что реально печатается в спрайт. Под живой пылью — ЧИСТАЯ подложка, а не лицо: иначе видно и
   * то, и другое сразу, и цензура перестаёт быть цензурой. Всё, что должно читаться сквозь пыль,
   * несут сами частицы (они и есть смаз этого лица).
   */
  private faceTex(faceUp: boolean): Texture {
    // Подложку подменяем ровно тогда, когда пыль реально будет нарисована. Иначе перевёрнутая
    // зацензуренная карта показывала бы чистую пластину вместо рубашки: пыль на ней не рисуется
    // (прятать нечего), а лицо уже подменено — карта выходила пустой.
    if (this.dustShown) return this.tex.hiddenBg();
    return this.plainFaceTex(faceUp);
  }

  private paint(): void {
    this.baseSprite.texture = this.faceTex(this.faceUp);
  }

  private buildTear(): Graphics {
    const g = new Graphics();
    const steps = 9;
    const pts: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const y = -TEX_H / 2 + (TEX_H * i) / steps;
      pts.push((i % 2 ? -1 : 1) * 12, y);
    }
    g.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
    g.stroke({ width: 10, color: 0xefe6d0 });
    g.moveTo(pts[0]!, pts[1]!);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i]!, pts[i + 1]!);
    g.stroke({ width: 3, color: 0x3a2f1f });
    return g;
  }

  private buildLock(): Graphics {
    const g = new Graphics();
    const x = TEX_W / 2 - 30;
    const y = -TEX_H / 2 + 36;
    g.arc(x, y - 6, 9, Math.PI, 0).stroke({ width: 4, color: 0x1e1e1e });
    g.roundRect(x - 14, y - 6, 28, 22, 4).fill({ color: 0x1e1e1e });
    g.circle(x, y + 3, 3).fill({ color: 0xd0c090 });
    return g;
  }
}
