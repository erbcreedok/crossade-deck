import { Container, Graphics } from "pixi.js";
import { CardBody } from "../CardBody";
import { ElementLife } from "./elementLife";
import { remountGlow } from "./elementGlow";
import { makeSelectOutline } from "../engine/selectOutline";
import { scaleForState } from "./plane";
import { withTags } from "../slotfield/elementTags";
import { idleBobs } from "./elevation";
import type { AnimPreset } from "../anim/presets";
import type { ParticleParams } from "../engine/censorParticles";
import type { ShadowShape } from "./shadow";
import type { GlowShape } from "./selection";
import type { CardSecrecy } from "./cardSecrecy";
import type { OwnShadow } from "./silhouetteExtract";
import type { CardState, Pose } from "./cardTypes";
import type { Burnable, Concealable, Draggable, Flippable, Glowable, Peekable, TableElement, Valued } from "../engine/element";

// ЕДИНСТВЕННЫЙ ЭЛЕМЕНТ СТОЛА. Карта, фишка, шахматная фигура — НЕ разные классы, а разные ВИДЫ
// (kind) одного предмета: реестр сборки (cardKind / pieceKinds) решает, как предмет выглядит
// (ItemVisual) и что он УМЕЕТ (caps — способности как ДАННЫЕ, а не как наличие метода в классе).
// Шасси одно: пружинное тело, жизнь (block/born/dying), свечение, рамка выделения, план/поза/
// высота, кадровый цикл. Двери способностей есть у всех — но отвечают «нет», если вид способности
// не собрал; системы движка спрашивают caps (engine/capabilities.ts), а не тип.

/** Способность как данные сборки: чем вид отличается от «просто лежит и тащится». */
export type ItemCap = "flip" | "conceal" | "peek" | "value" | "censor";

/** ВИД предмета — визуал и опциональные способности, собранные реестром (kind). */
export interface ItemVisual {
  /** Локальная коробка визуала (единицы root'а ДО масштаба тела): рамка выделения, фоллбэк свечения. */
  localBox(): { w: number; h: number };
  /** Футпринт ПОКОЯ в контент-пикселях (хит-тест берёт полуразмеры × scaleVal). */
  footprint(): { hw: number; hh: number };
  /** Построить детей root (спрайт/рисунок/пыль). Зовётся один раз из конструктора предмета. */
  mount(it: TableItem): void;
  /** Свои анимации вида (флип, вуаль, пыль). */
  step(it: TableItem, dt: number): void;
  /** Успокоился ли вид (иначе цикл не спит). */
  settled(it: TableItem): boolean;
  /** ВЕСЬ кадр: позиция/масштаб/текстура/эффект жизни → картинка и силуэт тени (it.shadowRect). */
  render(it: TableItem): void;
  /** Авто-теги вида (карта — по значению, живые). Игровые теги сборки домешиваются шасси. */
  autoTags(): ReadonlySet<string>;
  /** Контент-px на локальную единицу визуала — делитель фигуры свечения. */
  glowUnit(it: TableItem): number;
  /** Собственная форма свечения (пластина карты, круг фишки, силуэт фигуры). */
  glowFallback(it: TableItem): GlowShape;
  /** БЕЛЫЙ силуэт-снимок (фигура) для свечения стопкой; null — формы-снимка нет. */
  glowSilhouette?(): { texture: import("pixi.js").Texture; bounds: OwnShadow["bounds"] } | null;
  // ——— способности-данные (собраны видом или отсутствуют) ———
  flip?: { faceUp(): boolean; request(it: TableItem): boolean };
  secrecy?: CardSecrecy; // значение/скрытость/подглядеть (+ пыль-вуаль)
  censor?: { get(): boolean; set(v: boolean): void; params(p: Partial<ParticleParams>): void };
}

export interface ItemInit {
  id: string;
  kind: string; // "card" | "chip" | "chess" | … — вид из реестра
  caps: ReadonlySet<ItemCap>;
  visual: ItemVisual;
  draggable?: boolean;
  pose?: Pose;
  idle?: boolean;
  z?: number;
  tags?: readonly string[]; // ИГРОВЫЕ теги поверх авто-тегов вида (role:trump, team:blue)
  selected?: boolean;
}

export class TableItem implements TableElement, Draggable, Flippable, Burnable, Concealable, Peekable, Valued, Glowable {
  readonly root = new Container();
  readonly body = new CardBody();
  readonly life = new ElementLife(); // жизнь предмета: block/born/dying, возраст, пресет
  shadowRect: ShadowShape | null = null; // силуэт тени, обновляется в render; движок его собирает
  bobPhase = 0; // сдвиг фазы дыхания, чтобы соседи не качались в унисон
  peekBob = false; // висит в «подглядеть» — тот же bob, что у lifted, чтобы не читалось зависанием
  /** OS/юзер reduce-motion (issue #7): замораживает bob и живую пыль в статичный кадр. */
  reduceMotion = false;
  /** «Без вспышек» (issue #9, фото-чувствительность): гасит дрожь «сжечь», оставляя расход. */
  flashOff = false;
  /** Лёгкий профиль качества (issue #8): движок ставит при просадке FPS. Тени гасит сам движок. */
  lowFx = false;

  readonly id: string;
  readonly kind: string;
  readonly caps: ReadonlySet<ItemCap>;
  readonly visual: ItemVisual;
  readonly draggable: boolean;
  readonly pose: Pose;
  /** Явное «дышать / не дышать». Не задано — решает поза (`idleBobs`). */
  readonly idle?: boolean;
  state: CardState;
  /** Заданная снаружи высота над столом (setZ). 0 — лежит. */
  zBase: number;
  private readonly extraTags: ReadonlySet<string>;
  private glowNode: Container | null = null;
  private selOutline: Graphics | null = null;

  constructor(init: ItemInit) {
    this.id = init.id;
    this.kind = init.kind;
    this.caps = init.caps;
    this.visual = init.visual;
    this.draggable = init.draggable ?? true;
    this.pose = init.pose ?? "rest";
    this.idle = init.idle;
    this.zBase = init.z ?? 0;
    this.extraTags = new Set(init.tags ?? []);
    this.state = this.pose; // стартуем в своей позе покоя
    this.visual.mount(this);
    if (init.selected) this.setSelected(true);
  }

  /** Идентичность-ДАННЫЕ (SELECTION-DESIGN §2): авто-теги вида + игровые теги сборки. */
  get tags(): ReadonlySet<string> {
    const base = this.visual.autoTags();
    return this.extraTags.size ? withTags(base, this.extraTags) : base;
  }

  // ——— способности: двери у всех, «нет» — если вид способности не собрал ———
  get faceUp(): boolean {
    return this.visual.flip?.faceUp() ?? true; // без флипа предмет всегда «открыт»
  }
  requestFlip(): boolean {
    return this.visual.flip?.request(this) ?? false;
  }
  get card(): string {
    return this.visual.secrecy?.card ?? "";
  }
  get hasValue(): boolean {
    return this.visual.secrecy?.hasValue ?? true; // без оси значения скрывать нечего
  }
  setValue(v: string): void {
    this.visual.secrecy?.setValue(v);
  }
  get concealed(): boolean {
    return this.visual.secrecy?.concealed ?? false;
  }
  setConcealed(v: boolean): void {
    this.visual.secrecy?.setConcealed(v);
  }
  get censored(): boolean {
    return this.visual.censor?.get() ?? false;
  }
  setCensored(v: boolean): void {
    this.visual.censor?.set(v);
  }
  setDustParams(p: Partial<ParticleParams>): void {
    this.visual.censor?.params(p);
  }
  get canPeek(): boolean {
    return this.visual.secrecy?.canPeek ?? false;
  }
  peekReveal(): (() => void) | null {
    return this.visual.secrecy?.peekReveal() ?? null;
  }
  get glowSilhouette(): { texture: import("pixi.js").Texture; bounds: OwnShadow["bounds"] } | null {
    return this.visual.glowSilhouette?.() ?? null;
  }

  // ——— общее шасси ———
  get footprint(): { hw: number; hh: number } {
    return this.visual.footprint();
  }
  get width(): number {
    return this.footprint.hw * 2;
  }
  get height(): number {
    return this.footprint.hh * 2;
  }
  /** Масштаб позы покоя — движок им расставляет предметы при монтировании. */
  get restScale(): number {
    return scaleForState(this.pose);
  }
  /** Сменить состояние: целевой масштаб едет пружиной, поэтому размер/тень/позиция — плавно. */
  setState(s: CardState): void {
    this.state = s;
    this.body.setTarget({ scale: scaleForState(s) });
  }
  /** Высота над столом. Меняется на лету: поднять предмет — не пересобирать его. */
  setZ(v: number): void {
    this.zBase = Math.max(0, v);
  }
  /** Фил ЭТОГО предмета. Читает движок, когда решает, как переворачивать пачку. */
  get animPreset(): AnimPreset {
    return this.life.preset;
  }
  setAnimPreset(p: AnimPreset): void {
    this.life.setPreset(p, this.body);
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

  /** Свечение выделения (Glowable) — общий атом; форма-фоллбэк и единицы — у вида. */
  setGlow(color: number | null, figure?: readonly GlowShape[]): void {
    this.glowNode = remountGlow(this.root, this.glowNode, color, figure, this.visual.glowUnit(this), this.visual.glowFallback(this));
  }

  /** Контур выделения (SELECTION-DESIGN §4.A): рамка в root — едет/крутится/масштабируется сама.
   *  `mark: "lift"` — НЕ контур, а подъём (`pose: "lifted"`); метки самостоятельны. */
  setSelected(on: boolean): void {
    if (on === !!this.selOutline) return;
    if (on) {
      this.selOutline = makeSelectOutline(this.visual.localBox());
      this.root.addChild(this.selOutline);
    } else {
      this.selOutline?.destroy();
      this.selOutline = null;
    }
  }

  /** idle заморожен: reduce-motion (комфорт) ИЛИ лёгкий профиль (перф). */
  get idleFrozen(): boolean {
    return this.reduceMotion || this.lowFx;
  }

  step(dt: number): void {
    this.body.step(dt);
    this.life.step(dt);
    this.visual.step(this, dt);
  }

  /** Дышащий предмет не «отдыхает» — условие идёт по САМОМУ дыханию, а не по позе; вид добавляет
   *  свои непрерывные анимации (пыль, fade, флип) через settled. */
  get resting(): boolean {
    const bobSettled = this.idleFrozen || !(idleBobs(this.state, this.idle) || this.peekBob);
    return this.body.isResting() && !this.body.travelling && this.life.settled && bobSettled && this.visual.settled(this);
  }

  sync(): void {
    this.visual.render(this);
  }

  destroy(): void {
    this.root.destroy({ children: true });
  }
}
