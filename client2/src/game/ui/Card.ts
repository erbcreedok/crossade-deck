import { Container, Graphics, Sprite } from "pixi.js";
import { type ShadowShape } from "./shadow";
import { idleBobs } from "./elevation";
import { CardBody } from "../CardBody";
import { TEX_H, TEX_W } from "../engine/constants";
import type { GlowShape } from "./selection";
import { scaleForState } from "./plane";
import type { ParticleParams } from "../engine/censorParticles";
import type { Burnable, Concealable, Draggable, Flippable, Peekable, TableElement, Valued } from "../engine/element";
import type { CardTextureCache } from "./CardTextureCache";
import { cardTags, withTags } from "../slotfield/elementTags";
import { scaled, type AnimPreset } from "../anim/presets";
import { makeSelectOutline } from "../engine/selectOutline";
import { ElementLife } from "./elementLife";
import { remountGlow } from "./elementGlow";
import { CardSecrecy, repaintWithFade } from "./cardSecrecy";
import { syncCard } from "./cardRender";
import { buildLock, buildTear } from "./cardFace";
import type { CardOptions, CardState, Pose } from "./cardTypes";

export type { ShadowShape };
export type { CardOptions, CardState, Pose } from "./cardTypes";

// Карта UI-kit — объект с пропсами (масштабируемый, расширяемый) И «высотой над столом».
//
// Состояние (state) задаёт, в каком слое лежит карта и как высоко она над столом: rest → lifted →
// held → drag (веер fan — задел). Смена состояния меняет целевой масштаб (пружина CardBody),
// поэтому размер/тень/позиция едут ПЛАВНО. Тень карта НЕ рисует сама: в sync() она считает СИЛУЭТ
// (shadowRect) — движок собирает силуэты в общую маску уровня и заливает одной заливкой
// (ShadowLayer), так пересекающиеся тени сливаются и не темнят.
//
// ОБЩЕЕ с другими предметами стола вынесено способностями-коллабораторами, а не скопировано:
// жизнь (block/born/dying, пресет) — ElementLife, свечение — elementGlow, секретность/цензура с
// пылью и кросс-фейдом — CardSecrecy (+CardVeil), выбор текстуры — cardFace. Карта держит своё:
// физику, флип, тень и связку способностей в один предмет.

interface FlipAnim {
  t: number;
  dur: number;
  fromFaceUp: boolean;
}

export class Card implements TableElement, Draggable, Flippable, Burnable, Concealable, Peekable, Valued {
  readonly root = new Container();
  readonly body = new CardBody();
  readonly life = new ElementLife(); // общая жизнь предмета: block/born/dying, возраст, пресет
  readonly secrecy: CardSecrecy; // значение/скрытость/цензура/подглядеть (+ пыль-вуаль); двери ниже
  shadowRect: ShadowShape | null = null; // силуэт тени, обновляется в sync(); движок его собирает
  private glowNode: Container | null = null; // свечение выделения (setGlow)
  bobPhase = 0; // сдвиг фазы парения, чтобы карты не качались в унисон
  peekBob = false; // висит в «подглядеть» — тот же bob, что у lifted, чтобы не читалось зависанием
  /** OS/юзер reduce-motion (issue #7): движок ставит на спавне и при смене. Замораживает bob и
   *  живую пыль в статичный кадр — не трогает флип/драг/полёты (не в скоупе). */
  reduceMotion = false;
  /** «Без вспышек» (issue #9, фото-чувствительность): гасит дрожь «сжечь», оставляя расход. */
  flashOff = false;
  /** Лёгкий профиль качества (issue #8): замораживает idle и пыль как reduce-motion — движок
   *  ставит при просадке FPS. Тени гасит сам движок (пасс). */
  lowFx = false;

  readonly id: string; // КЛЮЧ идентичности (опаковый); значение живёт в secrecy и может быть придержано
  faceUp: boolean;
  readonly flippable: boolean;
  readonly draggable: boolean;
  readonly torn: boolean;
  readonly size: number;
  private readonly extraTags: ReadonlySet<string>; // игровые теги поверх авто (см. tags getter)

  state: CardState = "rest";
  readonly pose: Pose;
  /** Явное «дышать / не дышать». Не задано — решает поза (`idleBobs`). */
  readonly idle?: boolean;
  // Поля кадра — публичны для модуля cardRender (поведение функциями над данными фасада);
  // снаружи ui/ их не трогает никто: сценам хватает методов карты.
  readonly baseSprite = new Sprite();
  flip: FlipAnim | null = null;
  burnMask: Graphics | null = null; // маска фронта горения (создаётся на фазе расхода)
  private selOutline: Graphics | null = null; // рамка выделения (setSelected)
  /** Заданная снаружи высота над столом (setZ). 0 — лежит. */
  zBase: number;

  constructor(opts: CardOptions, tex: CardTextureCache, readonly baseScale: number) {
    this.id = opts.id ?? "";
    this.faceUp = opts.faceUp ?? true;
    this.flippable = opts.flippable ?? true;
    this.draggable = opts.draggable ?? true;
    this.torn = opts.torn ?? false;
    this.size = opts.size ?? 1;
    this.extraTags = new Set(opts.tags ?? []);
    this.pose = opts.pose ?? "rest";
    this.idle = opts.idle;
    this.zBase = opts.z ?? 0;
    this.state = this.pose; // стартуем в своей позе покоя
    this.secrecy = new CardSecrecy(
      this.root,
      tex,
      { back: opts.back ?? "ruby", faceStyle: opts.faceStyle ?? "pips", fourColor: opts.fourColor ?? false, custom: opts.custom ?? "" },
      {
        faceUp: () => this.faceUp,
        busy: () => this.flip !== null || this.life.burning || this.life.dead,
        requestFlip: () => void this.requestFlip(),
        setPeekBob: (v) => {
          this.peekBob = v;
        },
        repaint: () => repaintWithFade(this.secrecy.veil, this.baseSprite, this.secrecy.faceTex(this.faceUp)),
      },
      { card: opts.card ?? "A♠", hidden: opts.hidden ?? false, censored: opts.censored ?? false },
    );

    this.baseSprite.anchor.set(0.5);
    this.root.addChild(this.baseSprite);
    this.secrecy.prime();
    if (this.torn) this.root.addChild(buildTear());
    if (!this.flippable) this.root.addChild(buildLock());
    this.paint();
    if (opts.selected) this.setSelected(true);
  }

  /** Идентичность-ДАННЫЕ (SELECTION-DESIGN §2): авто-теги по значению + игровые (extraTags). Живой
   *  геттер — после setValue (раскрытия) масть/ранг обновляются сами. Кастом-лицо → card+custom:id. */
  get tags(): ReadonlySet<string> {
    const custom = this.secrecy.look.custom;
    const base = custom ? new Set(["card", `custom:${custom}`]) : cardTags(this.secrecy.card);
    return this.extraTags.size ? withTags(base, this.extraTags) : base;
  }

  // Значение и режимы секретности — целиком у коллаборатора; здесь тонкие двери способностей.
  get card(): string { return this.secrecy.card; }
  get hasValue(): boolean { return this.secrecy.hasValue; }
  get concealed(): boolean { return this.secrecy.concealed; }
  get censored(): boolean { return this.secrecy.censored; }
  get canPeek(): boolean { return this.secrecy.canPeek; }
  setConcealed(v: boolean): void { this.secrecy.setConcealed(v); }
  setCensored(v: boolean): void { this.secrecy.setCensored(v); }
  setValue(v: string): void { this.secrecy.setValue(v); }
  setDustParams(p: Partial<ParticleParams>): void { this.secrecy.setDustParams(p); }
  peekReveal(): (() => void) | null { return this.secrecy.peekReveal(); }

  /**
   * Контур выделения (SELECTION-DESIGN §4.A, метка `outline`). Рамка живёт В ROOT карты, поэтому
   * едет, крутится и масштабируется вместе с ней — без пер-кадровой синхронизации.
   * `mark: "lift"` — НЕ контур, а подъём карты со стола (`pose: "lifted"`); метки самостоятельны.
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

  /** Фил ЭТОЙ карты. Читает движок, когда решает, как переворачивать пачку, в которой она лежит. */
  get animPreset(): AnimPreset {
    return this.life.preset;
  }

  setAnimPreset(p: AnimPreset): void {
    this.life.setPreset(p, this.body);
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

  /** Свечение выделения (Glowable) — общий атом (elementGlow); своя тут только форма-фоллбэк:
   *  пластина карты. figure — светиться ЦЕЛОЙ стопкой по союзу силуэтов; null — погасить. */
  setGlow(color: number | null, figure?: readonly GlowShape[]): void {
    const f = this.baseScale * this.body.scaleVal; // контент-px на локальную единицу текстуры
    this.glowNode = remountGlow(this.root, this.glowNode, color, figure, f, { x: -TEX_W / 2, y: -TEX_H / 2, w: TEX_W, h: TEX_H, radius: 16 });
  }

  /** Сменить состояние: целевой масштаб едет пружиной, поэтому размер/тень/позиция — плавно. */
  setState(s: CardState): void {
    this.state = s;
    this.body.setTarget({ scale: scaleForState(s) });
  }

  requestFlip(): boolean {
    if (!this.flippable || this.flip) return false;
    this.flip = { t: 0, dur: Math.max(0.001, scaled(this.life.preset.flip.dur, this.life.preset.speed)), fromFaceUp: this.faceUp };
    this.secrecy.veil.dropFade(); // флип сам сменит текстуру спином — кросс-фейд лица тут не к месту
    return true;
  }

  blockNudge(): void {
    this.life.blockNudge();
  }

  appear(): void {
    this.life.appear();
  }

  burn(): void {
    this.life.burn();
  }

  get burning(): boolean {
    return this.life.burning;
  }

  get dead(): boolean {
    return this.life.dead;
  }

  /** idle заморожен: reduce-motion (комфорт, issue #7) ИЛИ лёгкий профиль (перф, issue #8). */
  private get idleFrozen(): boolean {
    return this.reduceMotion || this.lowFx;
  }

  step(dt: number): void {
    this.body.step(dt);
    this.life.step(dt);
    this.secrecy.veil.step(dt, this.secrecy.dustActive, this.idleFrozen);
    if (this.flip) {
      this.flip.t += dt;
      if (this.flip.t >= this.flip.dur) {
        this.faceUp = !this.flip.fromFaceUp;
        this.flip = null;
        this.secrecy.veil.setPoints(this.secrecy.dustSeeds()); // сторона сменилась — пыль едет за ней
        this.paint();
      }
    }
  }

  /** Дышащая карта не «отдыхает» — она качается, значит цикл не должен засыпать под ней. Условие
   *  идёт по САМОМУ дыханию, а не по позе. Живая пыль и доезжающий fade тоже держат цикл
   *  (veil.settled); под reduce-motion всё заморожено — цикл отпускается в сон. */
  get resting(): boolean {
    const bobSettled = this.idleFrozen || !(idleBobs(this.state, this.idle) || this.peekBob);
    return this.body.isResting() && !this.body.travelling && !this.flip && this.life.settled && bobSettled && this.secrecy.veil.settled(this.secrecy.dustActive, this.idleFrozen);
  }

  sync(): void {
    syncCard(this);
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }

  private paint(): void {
    this.baseSprite.texture = this.secrecy.faceTex(this.faceUp);
  }
}
