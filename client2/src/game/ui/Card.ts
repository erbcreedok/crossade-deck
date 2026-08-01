import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import { CardBody } from "../CardBody";
import { spinAngle, spinScale, spinShowsOther } from "../flip";
import { easeOutQuad } from "../anim/easing";
import { TEX_H, TEX_W } from "../engine/constants";
import { scaleForState } from "./plane";
import { cardShadow, type ShadowShape } from "./shadow";
export type { ShadowShape };
import { bobOffset, idleBobs, scaleFromZ, screenLift, zFromScale } from "./elevation";

import { ParticleField, type ParticleParams } from "../engine/censorParticles";
import { DANCE_DEFAULT, DUST_FLICKER, dustParams } from "../censorConfig";
import type { Burnable, Concealable, Draggable, Flippable, Peekable, TableElement, Valued } from "../engine/element";
import type { FaceStyle } from "../engine/cardTextures";
import type { CardBackId } from "../cardBack";
import type { CardTextureCache } from "./CardTextureCache";
import { cardTags, withTags } from "../board/elementTags";
import { normalizeCard } from "../card";
import { BASE_PRESET, scaled, type AnimPreset } from "../anim/presets";
import { destroyStyle } from "../anim/destroyStyles";
import { appearStyle } from "../anim/appearStyles";
import type { EffectFrame } from "../anim/destroyStyles";
import { applyEffect } from "../anim/effectApply";
import { flipStyle } from "../anim/flipStyles";
import { makeSelectOutline } from "../engine/selectOutline";

// Карта UI-kit — объект с пропсами (масштабируемый, расширяемый) И «высотой над столом».
//
// Состояние (state) задаёт, в каком слое лежит карта и как высоко она над столом:
//   rest   — лежит на столе (низкая тень);
//   lifted — поднята (тень дальше и крупнее, сама чуть больше);
//   held   — её держат (выше поднятой);
//   drag   — в руке игрока (наивысшая, тень растёт сильнее всего);
//   fan    — в веере (задел на будущее).
// Смена состояния меняет целевой масштаб (пружина CardBody), поэтому размер/тень/позиция едут
// ПЛАВНО. Тень карта НЕ рисует сама: в sync() она считает СИЛУЭТ тени (shadowRect) — его
// движок собирает в общую маску уровня и заливает одной непрозрачной заливкой (см.
// ShadowLayer). Так пересекающиеся тени сливаются в одну и не темнят. Смещение/размер силуэта
// растут с «высотой» (elev): свет сверху справа → тень уходит вниз-влево, сильнее вниз.

/**
 * Где элемент сейчас находится: слой отрисовки и высота над столом. `rest` — лежит на столе.
 *
 * Это СОСТОЯНИЕ, и его нельзя путать с `idle`-анимацией пресета (дыхание в покое): состояние
 * говорит, ГДЕ вещь, анимация — как она при этом шевелится. Выключение одного не должно гасить
 * другое, поэтому и слова разные.
 */
export type CardState = "rest" | "lifted" | "held" | "drag" | "fan";

/**
 * ПОЗА покоя — та часть состояний, которую элементу можно назначить спекой.
 *
 * `drag` и `fan` сюда не входят: они случаются с элементом по ходу дела (палец, веер), а не
 * объявляются при создании. Ось названа `pose`, а не `rest`, потому что `rest` — одно из её
 * ЗНАЧЕНИЙ, и `rest: "rest"` не читается.
 */
export type Pose = "rest" | "lifted" | "held";

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
  pose?: Pose; // ПОЗА покоя: rest (лежит на столе) / lifted (поднята над столом) / held (держат)
  /**
   * Дышит ли карта (idle-покачивание). Не задано — по позе: поднятая дышит, лежащая нет.
   *
   * Ось отдельная от позы намеренно: дыхание — АНИМАЦИЯ и доступно чему угодно на столе, а поза —
   * состояние. Лежащая карта имеет право покачиваться, если сцена этого просит.
   */
  idle?: boolean;
  /**
   * ВЫСОТА над столом (ось z, ui/elevation.ts). У всего, что лежит на столе, — 0.
   *
   * Не то же, что поза покоя: поза — это роль («её держат»), а `z` — число, которым высоту можно
   * задать напрямую. Складываются: удерживаемая карта с z = 0.2 будет выше обычной удерживаемой.
   */
  z?: number;
  tags?: string[]; // ИГРОВЫЕ теги поверх авто (card/suit/rank/color): role:trump, team:blue — SELECTION-DESIGN §2
  /** НАЧАЛЬНАЯ выделенность (контур набора, SELECTION-DESIGN §4.A); дальше — setSelected(). */
  selected?: boolean;
}

interface FlipAnim {
  t: number;
  dur: number;
  fromFaceUp: boolean;
}

const DUST_FADE_DUR = 0.4; // fade вкл/выкл пыли — как у block (Card.ts blockNudge)

export class Card implements TableElement, Draggable, Flippable, Burnable, Concealable, Peekable, Valued {
  readonly root = new Container();
  readonly body = new CardBody();
  shadowRect: ShadowShape | null = null; // силуэт тени, обновляется в sync(); движок его собирает
  bobPhase = 0; // сдвиг фазы парения, чтобы карты не качались в унисон
  peekBob = false; // висит в «подглядеть» — тот же bob, что у lifted, чтобы не читалось как зависание
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

  state: CardState = "rest";
  readonly pose: Pose;
  /** Явное «дышать / не дышать». Не задано — решает поза (`idleBobs`). */
  readonly idle?: boolean;
  private age = 0;
  private readonly baseSprite = new Sprite();
  private flip: FlipAnim | null = null;
  private block: { t: number; dur: number } | null = null; // «стоп»-покачивание при блоке драга
  private born: { t: number; dur: number } | null = null; // появление (anim/appearStyles.ts)
  private dying: { t: number; dur: number } | null = null; // «сжечь»: замирание → расход снизу вверх
  private burnMask: Graphics | null = null; // маска фронта горения (создаётся на фазе расхода)
  private dust: ParticleField | null = null; // живая «пыль»-цензура скрытой карты (TG-спойлер)
  private dustT = 0; // локальное время пыли (крутит только пока она видна)
  private dustAlpha = 0; // сглаженная альфа пыли — плавный fade вместо мгновенного visible-тумблера
  private fadeSprite: Sprite | null = null; // старая текстура лица, кросс-фейдится поверх новой при смене masked
  private fadeT = 0;
  private selOutline: Graphics | null = null; // рамка выделения (setSelected)
  /** Заданная снаружи высота над столом. 0 — лежит. */
  private zBase: number;
  /**
   * Фил анимаций — ПРЕСЕТ, а не константы в коде (anim/presets.ts). Ставит движок: на спавне и при
   * смене, тем же способом, что reduceMotion/lowFx. По умолчанию база, то есть ровно прежнее
   * поведение — карта, поднятая вне сцены (тест, консоль), не обязана знать про пресеты.
   */
  private preset: AnimPreset = BASE_PRESET;
  dead = false; // догорела — движок убирает её из песочницы

  constructor(
    opts: CardOptions,
    private readonly tex: CardTextureCache,
    private readonly baseScale: number,
  ) {
    this.id = opts.id ?? "";
    // Нормализуем НА ВХОДЕ: буквенная масть («AS», «10H») — способ набрать карту с
    // клавиатуры, а не второе представление. Дальше по движку — только «♠♥♦♣», иначе
    // сравнения строк («эта карта уже на столе?») начали бы промахиваться мимо самих себя.
    this._card = normalizeCard(opts.card ?? "A♠");
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
    this.pose = opts.pose ?? "rest";
    this.idle = opts.idle;
    this.zBase = opts.z ?? 0;
    this.state = this.pose; // стартуем в своей позе покоя

    this.baseSprite.anchor.set(0.5);
    this.root.addChild(this.baseSprite);
    if (this.dusty) this.buildDust();
    if (this.torn) this.root.addChild(this.buildTear());
    if (!this.flippable) this.root.addChild(this.buildLock());
    this.paint();
    if (opts.selected) this.setSelected(true);
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

  /**
   * Контур выделения (SELECTION-DESIGN §4.A, метка `outline`). Рамка живёт В ROOT карты, поэтому
   * едет, крутится и масштабируется вместе с ней — без пер-кадровой синхронизации.
   *
   * Заметьте: `mark: "lift"` — это НЕ контур, а подъём карты со стола (`pose: "lifted"`). Обе
   * метки самостоятельны, и «выделенная стопка» по умолчанию выглядит именно поднятой.
   */
  setSelected(on: boolean): void {
    if (on === !!this.selOutline) return;
    if (on) {
      this.selOutline = makeSelectOutline({ w: TEX_W * this.size, h: TEX_H * this.size });
      this.root.addChild(this.selOutline);
    } else {
      this.selOutline?.destroy();
      this.selOutline = null;
    }
  }

  /** Высота над столом. Меняется на лету: поднять карту — не пересобирать её. */
  setZ(v: number): void {
    this.zBase = Math.max(0, v);
  }

  /** Фил анимаций этой карты. Пружины тела — часть пресета, поэтому уезжают в тело сразу. */
  /** Фил ЭТОЙ карты. Читает движок, когда решает, как переворачивать пачку, в которой она лежит. */
  get animPreset(): AnimPreset {
    return this.preset;
  }

  setAnimPreset(p: AnimPreset): void {
    this.preset = p;
    this.body.springs = p.springs;
    // Крен — множитель ПОВЕРХ физики конфига, поэтому уезжает в тело, а не остаётся здесь:
    // считает крен оно, из собственной скорости.
    this.body.tiltScale = p.tilt;
  }

  /** Проставить/придержать значение (раскрытие сервером): "" прячет, непустое — показывает лицо. */
  setValue(v: string): void {
    const n = normalizeCard(v);
    if (n === this._card) return;
    this._card = n;
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

  /** Масштаб позы покоя карты — движок им расставляет карты при монтировании. */
  get restScale(): number {
    return scaleForState(this.pose);
  }

  /** Полуразмеры покоя (для обобщённого хит-теста; движок берёт их × scaleVal). */
  get footprint(): { hw: number; hh: number } {
    return { hw: this.width / 2, hh: this.height / 2 };
  }

  /** Сменить состояние: целевой масштаб едет пружиной, поэтому размер/тень/позиция — плавно. */
  setState(s: CardState): void {
    this.state = s;
    this.body.setTarget({ scale: scaleForState(s) });
  }

  requestFlip(): boolean {
    if (!this.flippable || this.flip) return false;
    this.flip = { t: 0, dur: Math.max(0.001, scaled(this.preset.flip.dur, this.preset.speed)), fromFaceUp: this.faceUp };
    this.fadeSprite?.destroy(); // флип сам сменит текстуру спином — кросс-фейд лица тут не к месту
    this.fadeSprite = null;
    return true;
  }

  /** Лёгкая «стоп»-анимация: короткое затухающее покачивание — «эту карту тащить нельзя». */
  blockNudge(): void {
    if (!this.block) this.block = { t: 0, dur: 0.4 };
  }

  /**
   * Появиться. Зовёт тот, кто карту ПОСТАВИЛ: раздача, добор, возврат в игру — это события доски,
   * и знать о них карта не может. Повторный вызов перезапускает эффект (в каталоге это кнопка).
   */
  appear(): void {
    if (this.dead) return;
    const st = appearStyle(this.preset.appear.style);
    this.born = { t: 0, dur: Math.max(0.001, scaled(st.dur * this.preset.appear.scale, this.preset.speed)) };
  }

  /** Сжечь: карта замирает, потом расходится снизу вверх при сильной дрожи; затем dead → убирают. */
  burn(): void {
    if (this.dying || this.dead) return;
    const st = destroyStyle(this.preset.destroy.style);
    this.dying = { t: 0, dur: Math.max(0.001, scaled(st.dur * this.preset.destroy.scale, this.preset.speed)) };
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
    if (this.born) {
      this.born.t += dt;
      if (this.born.t >= this.born.dur) this.born = null; // кончилось — карта просто стоит в доме
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

  /** Дышащая карта не «отдыхает» — она качается, значит цикл не должен засыпать под ней. Условие
   *  идёт по САМОМУ дыханию, а не по позе: поднятая карта с выключенным дыханием неподвижна и
   *  держать ради неё цикл незачем, а лежащая с включённым — качается, и заснуть под ней нельзя.
   *  Живая пыль тоже «шевелится» непрерывно: пока она видна ИЛИ ещё доезжает fade — цикл бодр.
   *  Под reduceMotion bob и вращение пыли заморожены (step()/sync() выше), поэтому все условия
   *  здесь отпускают цикл в сон — иначе статичный кадр жёг бы 60fps вхолостую. */
  get resting(): boolean {
    const bobSettled = this.idleFrozen || !(idleBobs(this.state, this.idle) || this.peekBob);
    const dustSettled = this.idleFrozen || (!this.dustActive && this.dustAlpha === 0);
    return this.body.isResting() && !this.body.travelling && !this.flip && !this.block && !this.born && !this.dying && bobSettled && dustSettled && !this.fadeSprite;
  }

  sync(): void {
    if (this.dust) {
      this.dust.view.visible = this.dustAlpha > 0.001;
      this.dust.view.alpha = this.dustAlpha;
    }
    const render = this.body.scaleVal * this.scaleFactor;
    // Дыхание: качается вверх-вниз тот, кому это назначено. По умолчанию — поднятая карта.
    let bob = 0;
    if (!this.idleFrozen && (idleBobs(this.state, this.idle) || this.peekBob)) {
      // Дыхание — ЭКРАННОЕ покачивание, а не высота: размер карты при нём не меняется, слой тоже.
      // Пока оно кормило `z`, тень дышала вместе с ним — меняла размер под неподвижной картой.
      bob = bobOffset(Math.sin(this.age * this.preset.idle.speed + this.bobPhase), this.preset.idle.amp, this.height);
    }

    // «Стоп»-покачивание при заблокированном драге: затухающее мелкое смещение вбок.
    let shakeX = 0;
    if (this.block) {
      const p = this.block.t / this.block.dur;
      shakeX = Math.sin(this.block.t * 42) * this.width * 0.05 * (1 - p);
    }

    // ВЫСОТА — один источник: поза покоя (масштаб) плюс дыхание. Из неё выводится и подъём
    // картинки, и поведение тени. Двигать карту по экрану «чтобы выглядела выше» в обход `z`
    // нельзя: тогда одно событие описано дважды, и рано или поздно описания разойдутся.
    // Высота: поза покоя плюс подъём полёта. Полёт даёт её в пикселях — переводим в доли высоты
    // карты, чтобы `z` везде значил одно и то же.
    const z = zFromScale(this.body.scaleVal) + this.body.liftPx / Math.max(1, this.height) + this.zBase;
    this.root.position.set(this.body.px + shakeX, this.body.py + screenLift(z, this.height) + bob);
    this.root.rotation = this.body.rotation;
    let spinX = 1; // гориз. сжатие при перевороте — им же сужаем тень
    if (this.flip) {
      // ЧТО за движение — решает стиль из реестра (anim/flipStyles.ts). Он отдаёт угол и
      // отклонения ОТ дома; дом карта уже заняла сама, поэтому отклонения складываются с ним.
      const fr = flipStyle(this.preset.flip.style).frame(Math.min(1, this.flip.t / this.flip.dur), this.preset.flip.halfTurns);
      const angle = fr.angle;
      spinX = spinScale(angle);
      this.root.scale.set(render * spinX * fr.scale * scaleFromZ(this.zBase), render * fr.scale * scaleFromZ(this.zBase));
      this.root.position.set(this.root.position.x + fr.dx * this.width, this.root.position.y + fr.dy * this.height);
      this.root.rotation += fr.rot;
      const showOther = spinShowsOther(angle);
      this.baseSprite.texture = this.faceTex(showOther ? !this.flip.fromFaceUp : this.flip.fromFaceUp);
    } else {
      // Высота показывается размером: подняли — стало крупнее. Иначе `z` двигал бы только тень.
      this.root.scale.set(render * scaleFromZ(this.zBase));
    }

    // Силуэт тени. Смещение растёт с «высотой» (карта выше — тень дальше, сильнее вниз). РАЗМЕР
    // тени — от размера ПОКОЯ карты (scaleFactor), а не от увеличенной драгом (render): по
    // перспективе приподнятая карта кажется крупнее, но её тень на доске почти исходного
    // размера, лишь чуть подрастая с высотой. В покое сдвиг маленький (тень прижата).
    // ЭФФЕКТ применяется ДО тени: она выводится из итогового состояния предмета, а не правится
    // отдельно под каждый способ появиться или сгинуть.
    //
    // Появление и уничтожение взаимоисключающи, и уничтожение важнее: оно решает, жива ли карта.
    let fx: EffectFrame | null = null;
    if (this.dying) {
      const st = destroyStyle(this.preset.destroy.style);
      // Стилю даём СВОЁ время (0..dur стиля), а не растянутое пресетом: иначе множитель скорости
      // менял бы не темп, а саму форму движения — фронт горения не доходил бы до кромки.
      const f = st.frame(st.dur * (this.dying.t / this.dying.dur), { age: this.age, width: this.width });
      // «Без вспышек»: дрожь — фото-триггер, гасим её. Остальное движение стиля остаётся.
      fx = this.flashOff ? { ...f, dx: 0, dy: 0 } : f;
    } else if (this.born) {
      const st = appearStyle(this.preset.appear.style);
      fx = st.frame(st.dur * (this.born.t / this.born.dur), { age: this.age, width: this.width });
    }
    if (fx) {
      const ref = { g: this.burnMask };
      applyEffect(this.root, this.body.px, this.body.py, fx, ref);
      this.burnMask = ref.g;
    }

    // ТЕНЬ — всегда следствие состояния: место, высота, экранное смещение, форма. Отдельных
    // «теневых анимаций» нет и заводить их не нужно — эффект меняет предмет, тень идёт следом.
    this.shadowRect = cardShadow(
      {
        px: this.body.px,
        py: this.body.py,
        shakeX: shakeX + (fx?.dx ?? 0),
        // Масштаб эффекта — это высота: взлетевшая карта крупнее и выше над столом.
        z: z + Math.max(0, (fx?.scale ?? 1) - 1),
        rotation: this.body.rotation + (fx?.rot ?? 0),
        scaleFactor: this.scaleFactor,
        screenY: bob + (fx?.dy ?? 0),
        spinX,
        poly: fx?.mask ?? null,
        fade: fx?.shadow ?? 1,
      },
      this.preset.shadow,
    );
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
