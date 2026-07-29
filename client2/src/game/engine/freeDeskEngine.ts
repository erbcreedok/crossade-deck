import { Application, Container, Graphics, Rectangle, Text } from "pixi.js";
import { CardTextureCache } from "../ui/CardTextureCache";
import { Card, type CardOptions, type CardState, type RestState, type ShadowShape } from "../ui/Card";
import { Piece } from "../ui/Piece";
import { pieceVisual, type PieceSpec } from "../ui/pieceKinds";
import { BoardZone, type AcceptRule, type OnOccupied } from "../board/boardZone";
import type { Board } from "../board/board";
import { gridSlots, ringSlots, type PositionedSlot } from "../board/layout/slots";
import { Field, NORMAL_FIELD } from "../board/field";
import { Stack } from "../board/stack";
import { attachControls, type Configurable } from "../ui/controls";
import type { Toggle } from "../ui/Toggle";
import type { Stepper } from "../ui/Stepper";
import type { Segmented } from "../ui/Segmented";
import { wrapRule } from "../board/boardModel";
import { BOARD_PRESETS, type BoardPreset } from "../board/boardPresets";
import { begin, toggle, clear as clearSel, has as hasSel, EMPTY, type Selection } from "../board/selection";
import type { CollectItem } from "../board/collectOrder";
import { assemble, ASSEMBLY_PRESETS, DEFAULT_PRESET, type AssemblyConfig, type Form, type NaturalOrder, type SortOverride } from "../board/assembly";
import { canSelect, ELIGIBLE, shouldLift, shouldOutline, type EligibleName, type Mark, type SelectVisualConfig } from "../board/selectVisual";
import { DEFAULT_DROP_POLICY, returnsHome, clearsSet, type OnDropOutside } from "../board/dropPolicy";
import { makeSelectOutline } from "./selectOutline";
import { asDraggable } from "./capabilities";
import { DropZone } from "../ui/DropZone";
import { Button, type ButtonOptions } from "../ui/Button";
import { SceneLayers, levelOf } from "./sceneLayers";
import type { Draggable, Peekable, TableElement } from "./element";
import { SingleDrag, GroupDrag, type DragPayload, type DragContext } from "./drag";
import type { Command } from "./command";
import { Marker, withAnchor, withDragger, type MarkerHost, type MarkerState, type ShowPolicy } from "./marker";
import { fitBlock, squeezeOffsets, fitSection, SB_BOX_PAD, SB_HEADER_GAP, SB_SECTION_GAP, SB_ITEM_GAP, SB_MARGIN, BLOCK_PAD } from "./sandboxLayout";
import { wrapRow, wrapFlow } from "./sandboxWrap";
import { Viewport, type ViewState } from "./viewport";
import { CanvasApp } from "./canvasApp";
import { InputRouter, type InputHandlers } from "./inputRouter";
import { topmostAt, type HitBox } from "./cardHit";
import { DRAG_SCALE, PIXEL_FONT, TEX_H, TEX_W } from "./constants";

export type { ViewState };

// UI-kit «/free-desk» — сторибук на канвасе. Один горизонтальный ряд карт-вариантов с
// подписями; контент панится и зумится (жесты/колесо/полосы). Управление drag-and-drop.
//
// СЛОИ (снизу вверх) — «высота над столом» + тени выше на нижних (см. Card):
//   surface     — стол: тексты, фон+название дропзон;
//   idleShadow  → idleCards   — карты в покое (лежат на столе над текстом);
//   floatShadow → floatCards  — парящие;
//   fanShadow                 — тень веера (падает лишь на «настольные», ниже глагола/веера);
//   verb                      — глагол дропзоны (над лежащими картами);
//   fanCards                  — карты веера (задел);
//   dragShadow  → dragCards   — карта в драге (наивысшая, тень выше веера).
// Карта при смене плана переезжает в свою пару слоёв (reparent), а размер/тень/позиция едут
// плавно пружиной — переход между планами не рвётся.

interface Story {
  caption: string;
  opts: CardOptions;
}

const STORIES: Story[] = [
  { caption: "открытая", opts: { faceUp: true } },
  { caption: "закрытая", opts: { faceUp: false } },
  { caption: "скрытая (пыль)", opts: { hidden: true, faceUp: true } }, // лицом — живая «пыль»-цензура (TG-спойлер); рубашка уже есть у «закрытой»
  { caption: "рубашка: изумруд", opts: { faceUp: false, back: "emerald" } },
  { caption: "лицо: символ", opts: { card: "K♥", faceStyle: "symbol" } },
  { caption: "4-цветная", opts: { card: "Q♦", fourColor: true } },
  { caption: "порванная", opts: { card: "10♦", torn: true } },
  { caption: "меньше ×0.7", opts: { size: 0.7 } },
  { caption: "нельзя тащить", opts: { card: "7♣", draggable: false } },
  { caption: "удерживаемая", opts: { card: "8♦", rest: "held" } },
  { caption: "приподнятая (в руке)", opts: { card: "9♠", rest: "floating" } },
  { caption: "джокер", opts: { custom: "joker" } }, // кастом-лицо из реестра CUSTOM_FACES, не хардкод-флаг
];

const PEEK_DUR = 3; // сек — сколько дропзона ПОДГЛЯДЕТЬ держит карту раскрытой перед автовозвратом

interface Placed {
  card: Card;
  home: { x: number; y: number };
  depth: number; // z-индекс глубины в своём слое; после драга карта возвращается на него
  specIndex: number; // из какого CardSpec рождена — для снимка/восстановления при рестарте канваса
}

// Элемент стола, которым можно ДВИГАТЬ пальцем: карта, фишка, фигура. Ровно то, что нужно
// системам движка (тени/слои/цикл/хит-тест/драг) — конкретный класс им безразличен.
type Elem = TableElement &
  Draggable & {
    readonly rest: RestState;
    readonly restScale: number;
    readonly footprint: { hw: number; hh: number };
  };

// Не-карточный элемент на столе (фишка/фигура) с домом и глубиной (как Placed для карт).
interface PiecePlaced {
  el: Piece;
  home: { x: number; y: number };
  depth: number;
}

// Дескриптор элемента ряда «Фишки и фигуры» (секция-как-данные): элемент + подпись + слот + опц. метка.
interface PieceRowItem {
  caption: string;
  w: number; // ширина слота — и подписи, и шага x
  el: { kind: "card"; id: string; card: string } | { kind: "piece"; id: string; spec: PieceSpec } | { kind: "stack" };
  marker?: { draw: (g: Graphics) => void; show: ShowPolicy; label: string };
}

// Элемент борда КАК ДАННЫЕ: карта (лицо) ЛИБО фигура (PieceSpec: chip/chess). Основа BoardFactory.
type ElementDef = { kind: "card"; face: string; size?: number } | PieceSpec;

// Декларативный конфиг GRID-борда: вся геометрия/содержимое — данные. Фабрика mountBoard собирает
// из него хром (registerBoardZone) и фигуры (spawnElement). «Новый борд = конфиг, не метод».
interface BoardConfig {
  title: string;
  labelText?: string; // если экранная подпись ≠ title
  cols: number;
  rows: number;
  cell: { w: number; h: number };
  gap?: number; // дефолт 8
  idPrefix: string; // id фигуры = `${idPrefix}-${key}-${j}`
  onOccupied: OnOccupied;
  slots: Record<string, ElementDef[]>; // ключ слота → стопка элементов (снизу вверх)
  pieceRatio?: number; // радиус фигуры = min(cell)*ratio (дефолт 0.34)
  hint?: string; // подпись-подсказка под бордом
  layout?: "grid" | "ring"; // дефолт grid; ring игнорирует cols/rows/gap, использует ringCount
  ringCount?: number; // число слотов кольца (layout: ring), дефолт 8
  maxSize?: number; // потолок стопки в КАЖДОМ слоте борда (дурак и т.п.)
  rule?: BoardPreset["rule"]; // value-правило по ЛИЦАМ (не по id) — mountBoard сам оборачивает в AcceptRule
}

// Одиночная цель с меткой (соло-карта, соло-фигура): host + драггер/якорь + как достать лид.
interface SoloTarget {
  host: MarkerHost;
  dragger: Marker;
  anchor: Marker;
  lead: () => Elem | null;
  label: string;
}

// Всё, за что можно схватиться ЧЕРЕЗ МЕТКУ (стопки и соло) — единый список для хит-теста захвата.
interface Grabber {
  marker: Marker;
  host: MarkerHost;
  lead: () => Elem | null;
}

// Стопка песочницы: Stack (порядок/дом/реордер на дереве слотов), host для меток и её драггер-метка.
// Драггер/якорь — generic Marker'ы (см. marker.ts), навешенные на host; хранятся в this.markers.
interface SandboxStack {
  stack: Stack;
  host: MarkerHost;
  dragger: Marker;
  anchor: Marker;
}

// Описание карты песочницы (позиция покоя + пропсы) — из него рождаются живые Card. Держим
// отдельно, чтобы «рестарт канваса» мог пересоздать канвас и воссоздать карты из тех же спеков.
interface CardSpec {
  opts: CardOptions;
  home: { x: number; y: number };
  depth: number;
  bobPhase: number;
}

// Снимок ИЗМЕНЯЕМОГО состояния карты — переживает пересоздание канваса (положение, лицевая
// сторона; сгоревшие карты в снимок не попадают и не воскресают).
interface CardRuntime {
  faceUp: boolean;
  x: number;
  y: number;
}

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 2.6;
// Чувствительность зума колесом: множитель = exp(-deltaY·ZOOM_SENS) по нормализованному в
// пиксели deltaY. ~0.0015 даёт ~14% на щелчок.
const ZOOM_SENS = 0.0015;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Полная колода 52 (лица карт закрытой стопки Поля).
const DECK52: string[] = ["♠", "♥", "♦", "♣"].flatMap((s) => ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"].map((r) => r + s));

// Иконки меток (в локальных координатах, центр 0,0) — драггер-грип и три разных якоря для демо.
const MARK = 0xcdb98f;
function drawGrip(g: Graphics): void {
  for (const dx of [-8, 0, 8]) g.circle(dx, 0, 2.6).fill({ color: MARK });
}
function drawAnchorIcon(g: Graphics): void {
  g.circle(0, -9, 3).stroke({ width: 1.6, color: MARK }); // кольцо
  g.moveTo(0, -6).lineTo(0, 9).stroke({ width: 1.6, color: MARK }); // шток
  g.moveTo(-6, -1).lineTo(6, -1).stroke({ width: 1.6, color: MARK }); // перекладина
  g.moveTo(-7, 3).lineTo(0, 9).lineTo(7, 3).stroke({ width: 1.6, color: MARK }); // лапы
}
function drawPinIcon(g: Graphics): void {
  g.moveTo(0, -9).lineTo(7, 0).lineTo(0, 9).lineTo(-7, 0).closePath().stroke({ width: 1.6, color: MARK }); // ромб
  g.circle(0, 0, 1.8).fill({ color: MARK });
}
function drawRingIcon(g: Graphics): void {
  g.circle(0, 0, 8).stroke({ width: 1.6, color: MARK }); // полое кольцо
}

export class FreeDeskEngine extends CanvasApp {
  private tex!: CardTextureCache;
  private content!: Container;
  private pendingRestore?: Map<number, CardRuntime>; // снимок для рестарта канваса (build читает его)

  private scene!: SceneLayers;

  private W = 1;
  private H = 1;
  private baseScale = 1;
  private cardW = 1;
  private cardH = 1;
  private contentW = 1;
  private contentH = 1;
  private lastSectionRight = 0; // правый край последней sectionFrame — для пар секций БОК О БОК (см. buildContent)
  // reduceMotion — поле базового CanvasApp (issue #7): гасит покачивание armed/hot-текста дропзон
  // (DropZone.step) и, через onReduceMotionChange ниже, bob/пыль каждой Card.

  private viewport = new Viewport(MIN_ZOOM, MAX_ZOOM);
  private cards: Placed[] = [];
  private pieces: PiecePlaced[] = []; // не-карточные элементы (фишки, фигуры) — тот же драг/тени
  private cardSpecs: CardSpec[] = [];
  private controlCards: Card[] = []; // карты раздела «Управление» — двигаются API, не драгом
  private controlButtons: { cap: string; b: Button }[] = []; // flip/conceal/reveal/move — для e2e
  private widgetDemo = { flag: false, level: 3, mode: 0 }; // витрина «виджеты контролов» — тривиальное состояние
  private widgetControls: { toggles: Toggle[]; steppers: Stepper[]; segments: Segmented[] } | null = null;
  private byId = new Map<string, Elem>(); // реестр по id (карты + фишки + фигуры) для API/меток
  private stackMove: { a: string[]; b: string[]; ax: number; bx: number; y: number; toB: boolean } | null = null;
  private stacks: SandboxStack[] = [];
  private solos: SoloTarget[] = []; // одиночные цели с метками (соло-карта, соло-фигура)
  private chipPile: { ids: string[]; dragger: Marker } | null = null; // стопка фишек (для e2e-грипа)
  private boardZones: BoardZone[] = []; // игровые зоны (борды): фигуры в слотах, драг между слотами
  private boardTitles: string[] = []; // заголовки бордов (align с boardZones), для e2e
  // ПОЛЕ (обособленный модуль board/field.ts): владелец с закрытой стопкой + flow-гридом.
  private fields: Field[] = [];
  private fieldReorderToggle: Toggle | null = null;
  private fieldSteppers: Stepper[] = []; // мин/макс колонок/строк — для e2e-хука координат +/-
  private selMode = false; // режим изолированного мультиселекта (демо-борд)
  private sel: Selection = EMPTY; // выделенный набор, замкнут на selZone
  private selZone: BoardZone | null = null; // зона демо-выделения
  private selDragging: string[] | null = null; // набор, который сейчас тащат целиком
  private selGrabCp = { x: 0, y: 0 }; // точка захвата набора (тап vs драг)
  private multiSelectOn = true; // конфиг: доступен ли режim выделения
  // Сборка набора — рычаги как ДАННЫЕ (issue #56, SELECTION-DESIGN §4–5). Одна конфигурация вместо
  // прежних «сорт набора»/«сборка» тумблеров; песочница крутит её рычаги, дефолт — пресет grab-to-hand.
  private selAssembly: AssemblyConfig = { ...ASSEMBLY_PRESETS[DEFAULT_PRESET]! };
  private selPresetName: string = DEFAULT_PRESET; // последний выбранный пресет (для e2e-хука; манипуляции рычагами его не сбрасывают)
  private faceOf = new Map<string, string>(); // id фигуры → лицо карты (для сорта набора по номиналу)
  private selButtons: { label: string; btn: Button }[] = []; // кнопки «выделение»/«снять» (для e2e)
  private selMultiButtons: Button[] = []; // тумблер «мультиселект» — для e2e
  private selPresetButtons: Button[] = []; // тумблер «пресет:» — для e2e
  private selFormButtons: Button[] = []; // тумблер «форма:» — для e2e
  private selOrderButtons: Button[] = []; // тумблер «порядок:» — для e2e
  private selSortButtons: Button[] = []; // тумблер «сорт:» (override) — для e2e
  // Отбор-визуал набора как ДАННЫЕ (issue #60, SELECTION-DESIGN §4.A): что можно выбрать (eligible),
  // подсветка выбираемых (hintEligible), как метить выбранное (mark). Дефолт как в примере: только
  // карты, без подсказки, метка «оба» (подъём + контур).
  private selVisual: SelectVisualConfig = { eligible: ELIGIBLE.cards!, hintEligible: false, mark: "both" };
  private selEligibleName: EligibleName = "cards"; // имя eligible-предиката рядом с ним самим — для e2e-хука
  private selOutlines = new Map<string, { g: Graphics; kind: "select" | "hint" }>(); // контур-атомы по id фигуры
  private selEligibleButtons: Button[] = []; // тумблер «выбор:» (карты/буби/любые) — для e2e
  private selHintButtons: Button[] = []; // тумблер «подсказка:» (выкл/вкл) — для e2e
  private selMarkButtons: Button[] = []; // тумблер «метка:» (подъём/контур/оба) — для e2e
  // Дроп набора МИМО зон как ПОЛИТИКА-ДАННЫЕ (issue #61, dropPolicy.ts): домой / остаться / распустить.
  private selDropOutside: OnDropOutside = DEFAULT_DROP_POLICY.onDropOutside;
  private selDropOutsideButtons: Button[] = []; // тумблер «мимо зон:» — для e2e
  private hoveredBtn: Button | null = null; // наведённая кнопка (ПК): чтобы гасить/зажигать только её, а не перебирать все (issue #48 баг №4)
  private hoverRerenders = 0; // счётчик перерисовок кнопок от ховера — для e2e-замера отсутствия лагов
  // Long-press по фигуре демо-зоны (issue #48 баг №3): удержание ~500мс без сдвига входит в режим
  // выделения и берёт фигуру в набор — второй способ входа помимо кнопки «выделение».
  private longPress: { id: string; sx: number; sy: number; timer: ReturnType<typeof setTimeout> } | null = null;
  private boardOnOccupiedSegments: Segmented[] = []; // тумблер «на занятый слот» каждого из 7 пресетов — для e2e
  private markers: Marker[] = []; // все метки слотов (драггеры + якоря), generic
  private grabbers: Grabber[] = []; // всё, за что тянут через метку (стопки + соло) — для хит-теста
  private grabbedMarker: Marker | null = null; // за какую метку сейчас тянут (для follow/endFollow)
  private pendingHost: MarkerHost | null = null; // host захватываемой цели (между pickCard и grab)
  private stackMode: "one" | "whole" = "one"; // режим драга карты стопки: одна карта / вся пачка
  private dragSqueeze = false; // плейсмент пачки при драге: false — врассыпную, true — сжать в руку
  private stackModeButtons: Button[] = []; // «режим драга карты» — для e2e-хука
  private stackSqueezeButtons: Button[] = []; // «при драге стопки» — для e2e-хука
  private stackReorderToggle: Toggle | null = null; // «реордер стопок» — для e2e-хука
  private buttons: Button[] = [];
  private buttonShowcase: { cap: string; b: Button }[] = []; // раздел «Кнопки» — для e2e-хука
  private zones: Array<{ zone: DropZone; onDrop: (p: DragPayload) => void; accepts: (p: DragPayload) => boolean; textFor?: (p: DragPayload) => { armed: string; hot: string } }> = [];

  private input = new InputRouter<Elem, Button>(this.inputHandlers());
  private drag: DragPayload | null = null; // текущий груз драга (одна карта или пачка)
  // «Подглядеть» (дропзона ПОДГЛЯДЕТЬ, см. buildDropzonesBlock): id -> сессия показа. undo —
  // замыкание из Peekable.peekReveal, возвращающее карту КАК БЫЛО (лицо/скрытость/peekBob) — reveal
  // и restore одной парой, рассинхрону неоткуда взяться. t — прошедшее время, grabbed — карту
  // перехватили повторным драгом (тогда restore ждёт КОНЦА драга или истечения PEEK_DUR, см.
  // onCardGrab / onCardDrop / frame; при истечении под пальцем карта остаётся в драге, домой НЕ едет).
  private peeking = new Map<string, { el: Elem; undo: () => void; t: number; grabbed: boolean }>();
  // Контекст драга: поднять элемент в слой драга / вернуть домой (движок-специфика для payload).
  private dragCtx: DragContext = {
    raise: (el) => {
      el.setState("drag");
      el.root.zIndex = 1e6;
      this.placeCard(el);
    },
    returnHome: (el) => this.releaseElement(el as Elem),
    flipGroup: (els) => this.flipGroup(els),
    startPeek: (els) => this.startPeek(els),
  };
  private dragScreen = { x: 0, y: 0 }; // экранная позиция пальца при драге — для авто-скролла у кромки
  private panVel = { x: 0, y: 0 }; // сглаженная скорость пана (px/сек) — для инерции
  private lastPanT = 0;
  private pinch = { dist: 1, zoom: 1, midContentX: 0, midContentY: 0 };
  private onView: ((v: ViewState) => void) | null = null;

  protected onLayout(width: number, height: number): void {
    this.W = width;
    this.H = height;
    this.cardH = Math.max(48, Math.min(140, Math.min(this.W, this.H) * 0.16));
    this.baseScale = this.cardH / TEX_H;
    this.cardW = TEX_W * this.baseScale;
  }

  private wire(app: Application): void {
    app.stage.eventMode = "static";
    app.stage.hitArea = new Rectangle(0, 0, this.W, this.H);
    app.stage.on("pointerdown", this.onDown);
    app.stage.on("pointermove", this.onMove);
    app.stage.on("pointerup", this.onUp);
    app.stage.on("pointerupoutside", this.onUp);
    app.canvas.addEventListener("wheel", this.onWheel, { passive: false });
  }

  // Собрать сцену в свежем канвасе (Host уже поднял app/канвас). pendingRestore — снимок карт для
  // рестарта канваса; без него песочница строится в исходном виде.
  protected build(app: Application): void {
    this.tex = new CardTextureCache(app);
    this.content = new Container();
    app.stage.addChild(this.content);
    this.buildLayers();
    this.buildContent(this.pendingRestore);
    this.pendingRestore = undefined;
    this.wire(app);
  }

  protected onBooted(): void {
    this.clampView();
    this.applyView();
    this.render();
    this.wake();
    this.emitView();
  }

  // Полный сброс песочницы к исходному состоянию (карты, стопки, зоны) — канвас не пересоздаём.
  restartSandbox(): void {
    if (!this.app || this.destroyed) return;
    this.clearContent();
    this.buildContent();
    this.input.reset();
    this.clampView();
    this.applyView();
    this.render();
    this.wake();
    this.emitView();
  }

  // Пересоздать сам канвас (свежий WebGL-контекст), СОХРАНИВ состояние песочницы: снимаем
  // положение/лицо живых карт и вид, сносим app, поднимаем новый и восстанавливаемся.
  async restartCanvas(): Promise<void> {
    if (!this.app || this.destroyed) return;
    const savedView = { x: this.viewport.x, y: this.viewport.y, zoom: this.viewport.zoom };
    this.pendingRestore = this.snapshotCards(); // build его прочитает после boot
    this.teardown();
    await this.boot();
    if (this.app) {
      this.viewport.x = savedView.x;
      this.viewport.y = savedView.y;
      this.viewport.zoom = savedView.zoom;
      this.clampView();
      this.applyView();
      this.emitView();
    }
  }

  private buildLayers(): void {
    this.scene = new SceneLayers(this.content);
  }

  /** Положить элемент в слой его текущего плана. Тень рисует слитый ShadowLayer (см. render). */
  private placeCard(el: TableElement): void {
    this.scene.place(el.root, levelOf(el.state));
  }

  // ——— контент ———

  private label(text: string, x: number, y: number, size: number, fill: number, wrap?: number, anchorX = 0.5): Text {
    const t = new Text({
      text,
      style: { fontFamily: PIXEL_FONT, fontSize: size, fill, align: "center", wordWrap: wrap !== undefined, wordWrapWidth: wrap ?? 0 },
    });
    t.anchor.set(anchorX, 0);
    t.position.set(x, y);
    // На узком экране длинное слово без пробелов (напр. «удерживаемая») перенос не ловит и
    // вылезает за свою ячейку, налезая на соседа. Гарантия: если подпись всё же шире ячейки —
    // ужимаем её ровно до ширины (масштаб вокруг якоря, центровка под картой сохраняется).
    if (wrap !== undefined && t.width > wrap) t.scale.set(wrap / t.width);
    return t;
  }

  // Единая рамка+заголовок секции песочницы (замена самопальных заголовков без контейнера —
  // отсюда «теряются секции»). ВСЕГДА двухпроходно: заголовок кладём сразу, контент строит
  // build() как обычно, а рамку рисуем ПОСЛЕ по фактическим bottom/width и вставляем ПОД
  // заголовком/контентом (addChildAt на индекс, записанный до обеих отрисовок) — работает
  // одинаково что для контента известного размера заранее, что для раскладки с динамической
  // высотой (борды/поле), не нужно два разных пути.
  private sectionFrame(left: number, top: number, title: string, build: (contentLeft: number, contentTop: number) => { bottom: number; width: number }): number {
    const headerH = 26;
    const contentLeft = left + SB_BOX_PAD;
    const contentTop = top + SB_BOX_PAD + headerH + SB_HEADER_GAP;
    const frameIndex = this.scene.surface.children.length;
    this.scene.surface.addChild(this.label(title, contentLeft, top + SB_BOX_PAD, headerH, 0xcdb98f, undefined, 0));
    const { bottom, width } = build(contentLeft, contentTop);
    const box = fitSection(width, bottom - contentTop, SB_BOX_PAD, headerH, SB_HEADER_GAP);
    const frame = new Graphics();
    frame.roundRect(left, top, box.boxW, box.boxH, 10).fill({ color: 0x000000, alpha: 0.12 }).stroke({ width: 2, color: 0x4a5b50 });
    this.scene.surface.addChildAt(frame, frameIndex);
    this.contentW = Math.max(this.contentW, left + box.boxW); // виджет самого широкого бокса задаёт полотно
    this.lastSectionRight = left + box.boxW;
    return top + box.boxH + SB_SECTION_GAP;
  }

  // Ряд «Карты — варианты»: копим спеки (позиция+пропсы), рисуем подписи. wrapRow переносит
  // строки на узком экране — раньше 12 карточек росли вправо без ограничения (переполняли 390px).
  // cellW — ШАГ между картами (карта + запас под длинную подпись типа «приподнятая (в руке)», не
  // задевающий соседа), НЕ ширина контента. Правый край бокса поэтому считаем по РЕАЛЬНОМУ краю
  // последней карты/подписи в строке, а не по полному номинальному шагу — у шага справа от
  // последней карты в строке нет соседа, чтобы его оправдывать, а у первой карты слева такого
  // запаса и не было (не симметрично). Ту же ошибку другие ряды (buildPieces и т.п.) не повторяют:
  // там per-item ширина уже равна фактической ширине элемента, не раздутому шагу.
  private buildCardsRow(left: number, top: number): { bottom: number; width: number } {
    const cellW = this.cardW * 2.15; // шаг под карту + подпись (было cardW + cardW*1.15)
    const itemH = this.cardH + 40; // карта + место под подпись
    const { items, totalH } = wrapRow(STORIES.map(() => cellW), this.cardW * 8, itemH, SB_ITEM_GAP);
    let width = 0;
    STORIES.forEach((s, i) => {
      const p = items[i]!;
      const cx = left + p.x + this.cardW / 2;
      const cy = top + p.y + this.cardH / 2;
      // Явный id обязателен: без него Card.id === "" (Card.ts:103) — и ЛЮБЫЕ две карты этого ряда
      // делят один ключ идентичности. Всё, что адресует элементы по id (peeking «подглядеть»,
      // byId), тогда путает их между собой: показ одной карты снимал таймер у соседней.
      this.cardSpecs.push({ opts: { ...s.opts, id: s.opts.id ?? `story-${i}` }, home: { x: cx, y: cy }, depth: i, bobPhase: i * 0.9 });
      const cap = this.label(s.caption, cx, cy + this.cardH / 2 + 8, 14, 0x9aa89f, cellW * 0.9);
      this.scene.surface.addChild(cap);
      const rightEdge = Math.max(p.x + this.cardW, p.x + this.cardW / 2 + cap.width / 2);
      width = Math.max(width, rightEdge);
    });
    return { bottom: top + totalH, width };
  }

  // Ряд «Дропзоны»: перевернуть, сжечь, подглядеть. Фон+название — на поверхности, глагол — над картами.
  // ПОДГЛЯДЕТЬ реагирует на способность peek (только Peekable — только карты, см. drag.ts) и
  // единственная из трёх задействует armed («давай подсмотрим?») — зазывающий текст, пока драг
  // способной карты идёт где-то ещё на канвасе, не только когда её навели именно на эту зону. Текст
  // при этом ЗАВИСИТ от того, есть ли у ЭТОЙ карты что подглядывать (needsPeek) — уже раскрытой
  // картой зона отвечает «зачем?»/«нет.» и после дропа не запускает подглядывание (см. startPeek).
  // Одна колонка (пока что — задел под будущее расширение набора зон): каждая зона — невысокая
  // кнопка-полоса, а не карточный слот. Высота — своя, не cardH (зона больше не притворяется
  // местом ПОД карту, это список действий), но ширина по-прежнему от cardW — тот же язык
  // масштабирования, что у всей песочницы.
  private buildDropzonesBlock(left: number, top: number): { bottom: number; width: number } {
    const zoneW = this.cardW * 2.4;
    const zoneH = zoneW * (9 / 16); // 16:9 (ширина:высота) по прямому решению владельца
    let y = top;
    this.registerZone(new DropZone({ name: "ПЕРЕВОРОТ", verb: "перевернуть", rect: { x: left, y, w: zoneW, h: zoneH } }), (p) => p.flip?.(), (p) => !!p.flip);
    y += zoneH + SB_ITEM_GAP;
    this.registerZone(new DropZone({ name: "СЖЕЧЬ", verb: "сжечь", rect: { x: left, y, w: zoneW, h: zoneH } }), (p) => p.burn?.(), (p) => !!p.burn);
    y += zoneH + SB_ITEM_GAP;
    this.registerZone(
      new DropZone({ name: "ПОДГЛЯДЕТЬ", verb: "Отпускай!", armed: "давай подсмотрим?", rect: { x: left, y, w: zoneW, h: zoneH } }),
      (p) => p.peek?.(),
      (p) => !!p.peek,
      (p) => (this.needsPeek(p.lead) ? { armed: "давай подсмотрим?", hot: "Отпускай!" } : { armed: "зачем?", hot: "нет." }),
    );
    return { bottom: y + zoneH, width: zoneW };
  }

  // Собрать песочницу: мебель (тексты, дропзоны, кнопки) — всегда заново; карты — из спеков,
  // при restore восстанавливая их положение/лицо (рестарт канваса), иначе в исходном виде.
  // Порядок секций: (Карты + Дропзоны бок о бок) → Кнопки → Фигуры → Стопки → Поле → Управление
  // → Борды (борды — последними: самая тяжёлая секция, плотная сетка). Каждая секция —
  // sectionFrame, единый SB_SECTION_GAP между низом одной и верхом следующей (было 8 разных чисел).
  private buildContent(restore?: Map<number, CardRuntime>): void {
    let y = SB_MARGIN;
    // Дропзоны — БОК О БОК с Картами (та же верхняя граница), не под ними: карты сами по себе
    // узкие (wrapRow держит их в ~3 колонки, см. buildCardsRow), а дропзоны — одна колонка
    // (buildDropzonesBlock), так что рядом остаётся место, которое иначе простаивало бы справа.
    // Между ними SB_ITEM_GAP, не SB_SECTION_GAP: это не «следующая секция страницы» (та связь —
    // вертикальная, SB_SECTION_GAP так и подписан), а два блока ОДНОГО ряда — тот же смысл, что
    // у SB_ITEM_GAP везде внутри секции. Уже + меньше зазора = дропзонам физически хватает места
    // рядом на телефонном экране вместо того, чтобы вылезать за его правый край.
    const cardsTop = y;
    const cardsBottom = this.sectionFrame(SB_MARGIN, cardsTop, "Карты — варианты", (cl, ct) => this.buildCardsRow(cl, ct));
    const cardsRight = this.lastSectionRight;
    const dzBottom = this.sectionFrame(cardsRight + SB_ITEM_GAP, cardsTop, "Дропзоны", (cl, ct) => this.buildDropzonesBlock(cl, ct));
    y = Math.max(cardsBottom, dzBottom);
    y = this.buildButtons(SB_MARGIN, y);
    y = this.buildPieces(SB_MARGIN, y);
    y = this.buildStacks(SB_MARGIN, y);
    y = this.buildField(SB_MARGIN, y);
    y = this.buildControls(SB_MARGIN, y);
    y = this.buildBoardZones(SB_MARGIN, y);
    y = this.sectionFrame(SB_MARGIN, y, "Дроп-индикатор: варианты подписи", (cl, ct) => this.buildDropIndicatorDemo(cl, ct));
    this.contentH = y + SB_MARGIN - SB_SECTION_GAP; // последняя секция уже добавила свой SB_SECTION_GAP

    // Карты рождаем ПОСЛЕ мебели — чтобы легли поверх подписей/зон.
    this.spawnCards(restore);
  }

  // Только для e2e: экранные точки зон + состояние первой карты + число карт. Дёшево, безвредно.
  testHooks(): {
    zones: Record<string, { x: number; y: number }>;
    zoneHot: Record<string, boolean>;
    zoneArmed: Record<string, boolean>;
    zoneHotText: Record<string, string>;
    zoneArmedText: Record<string, string>;
    firstCard: { x: number; y: number; faceUp: boolean } | null;
    cardCount: number;
    grips: ({ x: number; y: number } | null)[];
    stackCards: { x: number; y: number }[][];
    stackIds: string[][];
    markerVis: { dragger: boolean; anchor: boolean }[];
    pieces: { id: string; x: number; y: number }[];
    pieceCount: number;
    soloVis: { label: string; dragger: boolean; anchor: boolean; x: number; y: number }[];
    pileGrip: { x: number; y: number } | null;
    boardFigures: { id: string; key: string; x: number; y: number }[];
    boardSlots: { key: string; x: number; y: number }[];
    selMode: boolean;
    selection: string[];
    // Вложенная форма под e2e issue #48 (отдельный ключ, а не переопределение плоского selection:
    // string[], от которого зависит board.spec.ts): всё про UI-состояние выделения в одном месте.
    selectionState: {
      active: boolean;
      selected: string[];
      clearButtonVisibleAt: { x: number; y: number } | null; // null, пока не в режиме — кнопки «снять» нет
      selectToggleAt: { x: number; y: number } | null;
      multiSelectEnabled: boolean;
      // Конфиг сборки набора как ДАННЫЕ (issue #56): рычаги form/order/sortOverride + последний пресет.
      assembly: { preset?: string; form: Form; order: NaturalOrder; sortOverride: SortOverride };
      // Отбор-визуал как ДАННЫЕ (issue #60): eligible по ИМЕНИ, подсветка выбираемых, метка выбранного.
      visual: { eligible: EligibleName; hintEligible: boolean; mark: Mark };
      // Дроп мимо зон как ДАННЫЕ (issue #61): что делать с набором, отпущенным вне принимающих зон.
      policy: { onDropOutside: OnDropOutside };
    };
    perf: { hoverRerenders: number }; // сколько кнопок перерисовалось от ховера — для замера отсутствия лагов (баг №4)
    selButtons: { label: string; x: number; y: number }[];
    selFigures: { id: string; key: string; x: number; y: number; selected: boolean; outlined: boolean; hinted: boolean }[];
    boards: { title: string; figures: { id: string; key: string; x: number; y: number }[]; slots: { key: string; x: number; y: number }[]; onOccupied: OnOccupied; onOccupiedAt: { x: number; y: number }[] }[];
    field: { stack: number; grid: number; colsMin: number; colsMax: number | undefined; rowsMin: number; rowsMax: number | undefined; reorder: boolean; reorderToggleAt: { x: number; y: number } | null; stackAt: { x: number; y: number }; gridRect: { x: number; y: number; w: number; h: number }; gridCards: { id: string; x: number; y: number }[] } | null;
    buttonShowcase: { cap: string; x: number; y: number; disabled: boolean }[];
    stackModeAt: { x: number; y: number }[];
    stackSqueezeAt: { x: number; y: number }[];
    stackReorderAt: { x: number; y: number } | null;
    selMultiAt: { x: number; y: number }[];
    selPresetAt: { x: number; y: number }[]; // тумблер «пресет:»
    selFormAt: { x: number; y: number }[]; // тумблер «форма:» (стопка/раскрыт/ряд)
    selOrderAt: { x: number; y: number }[]; // тумблер «порядок:» (расположение/выбор)
    selSortAt: { x: number; y: number }[]; // тумблер «сорт:» (—/номинал/масть — override)
    selEligibleAt: { x: number; y: number }[]; // тумблер «выбор:» (карты/буби/любые)
    selHintAt: { x: number; y: number }[]; // тумблер «подсказка:» (выкл/вкл)
    selMarkAt: { x: number; y: number }[]; // тумблер «метка:» (подъём/контур/оба)
    selDropOutsideAt: { x: number; y: number }[]; // тумблер «мимо зон:» (домой/остаться/распустить — #61)
    controls: {
      buttons: { cap: string; x: number; y: number }[];
      flipFaceUp: boolean | null;
      concealed: boolean | null;
      revealValue: string | null;
      moveCounts: { a: number; b: number } | null;
      widgets: { flag: boolean; level: number; mode: number; toggleAt: { x: number; y: number } | null; stepperMinusAt: { x: number; y: number } | null; stepperPlusAt: { x: number; y: number } | null; segmentedAt: { x: number; y: number }[] } | null;
    };
    cardW: number;
    draggingId: string | null;
    storyCards: { caption: string; x: number; y: number; card: string; faceUp: boolean; draggable: boolean; back: string; faceStyle: string; fourColor: boolean; torn: boolean; size: number; custom: string; rest: string; concealed: boolean }[];
  } {
    const toScreen = (cx: number, cy: number) => ({ x: this.viewport.x + cx * this.viewport.zoom, y: this.viewport.y + cy * this.viewport.zoom });
    const zones: Record<string, { x: number; y: number }> = {};
    for (const z of this.zones) {
      const r = z.zone.rect;
      zones[z.zone.label] = toScreen(r.x + r.w / 2, r.y + r.h / 2);
    }
    const zoneHot: Record<string, boolean> = {};
    for (const z of this.zones) zoneHot[z.zone.label] = z.zone.verb.visible;
    const zoneArmed: Record<string, boolean> = {};
    for (const z of this.zones) zoneArmed[z.zone.label] = z.zone.armedText?.visible ?? false;
    const zoneHotText: Record<string, string> = {};
    for (const z of this.zones) zoneHotText[z.zone.label] = z.zone.verb.text;
    const zoneArmedText: Record<string, string> = {};
    for (const z of this.zones) zoneArmedText[z.zone.label] = z.zone.armedText?.text ?? "";
    const first = this.cards[0]?.card;
    return {
      zones,
      zoneHot,
      zoneArmed,
      zoneHotText,
      zoneArmedText,
      firstCard: first ? { ...toScreen(first.body.px, first.body.py), faceUp: first.faceUp } : null,
      cardCount: this.cards.length,
      grips: this.stacks.map((st) => toScreen(st.dragger.gfx.position.x, st.dragger.gfx.position.y)),
      stackCards: this.stacks.map((st) => st.stack.ids.map((id) => this.byId.get(id)).filter((c): c is Elem => !!c).map((c) => toScreen(c.body.px, c.body.py))),
      stackIds: this.stacks.map((st) => st.stack.ids),
      markerVis: this.stacks.map((st) => ({ dragger: st.dragger.shown(), anchor: st.anchor.shown() })),
      pieces: this.pieces.map((p) => ({ id: p.el.id, ...toScreen(p.el.body.px, p.el.body.py) })),
      pieceCount: this.pieces.length,
      pileGrip: this.chipPile ? toScreen(this.chipPile.dragger.gfx.position.x, this.chipPile.dragger.gfx.position.y) : null,
      soloVis: this.solos.map((s) => ({
        label: s.label,
        dragger: s.dragger.shown(),
        anchor: s.anchor.shown(),
        ...toScreen(s.dragger.gfx.position.x, s.dragger.gfx.position.y),
      })),
      boardFigures: this.boardFiguresHook(toScreen),
      boardSlots: this.firstBoard()?.slotRects().map(({ key, rect }) => ({ key, ...toScreen(rect.x + rect.w / 2, rect.y + rect.h / 2) })) ?? [],
      selMode: this.selMode,
      selection: [...this.sel.ids],
      selectionState: {
        active: this.selMode,
        selected: [...this.sel.ids],
        clearButtonVisibleAt: this.selBtnScreen("снять", toScreen, this.selMode),
        selectToggleAt: this.selBtnScreen("выделение", toScreen, true),
        multiSelectEnabled: this.multiSelectOn,
        assembly: { preset: this.selPresetName, form: this.selAssembly.form, order: this.selAssembly.order, sortOverride: this.selAssembly.sortOverride },
        visual: { eligible: this.selEligibleName, hintEligible: this.selVisual.hintEligible, mark: this.selVisual.mark },
        policy: { onDropOutside: this.selDropOutside },
      },
      perf: { hoverRerenders: this.hoverRerenders },
      selButtons: this.selButtons.map(({ label, btn }) => ({ label, ...toScreen(btn.x, btn.y) })),
      selFigures: this.selZone
        ? Object.entries(this.selZone.board.slots)
            .flatMap(([key, c]) => c.members.map((id) => ({ id, key, el: this.byId.get(id) })))
            .filter((o): o is { id: string; key: string; el: Elem } => !!o.el)
            .map(({ id, key, el }) => ({
              id,
              key,
              ...toScreen(el.body.px, el.body.py),
              selected: hasSel(this.sel, id),
              outlined: this.selOutlines.get(id)?.kind === "select",
              hinted: this.selOutlines.get(id)?.kind === "hint",
            }))
        : [],
      boards: this.boardZones.map((z, zi) => ({
        title: this.boardTitles[zi] ?? "",
        figures: Object.entries(z.board.slots).flatMap(([key, c]) =>
          c.members.map((id) => ({ id, key, el: this.byId.get(id) })).filter((o): o is { id: string; key: string; el: Elem } => !!o.el).map(({ id, key, el }) => ({ id, key, ...toScreen(el.body.px, el.body.py) })),
        ),
        slots: z.slotRects().map(({ key, rect }) => ({ key, ...toScreen(rect.x + rect.w / 2, rect.y + rect.h / 2) })),
        onOccupied: z.onOccupied,
        onOccupiedAt: this.boardOnOccupiedSegments[zi] ? this.boardOnOccupiedSegments[zi]!.buttons().map((b) => toScreen(b.x, b.y)) : [],
      })),
      field: this.fieldHook(toScreen),
      buttonShowcase: this.buttonShowcase.map(({ cap, b }) => ({ cap, disabled: b.disabled, ...toScreen(b.x, b.y) })),
      stackModeAt: this.stackModeButtons.map((b) => toScreen(b.x, b.y)),
      selMultiAt: this.selMultiButtons.map((b) => toScreen(b.x, b.y)),
      selPresetAt: this.selPresetButtons.map((b) => toScreen(b.x, b.y)),
      selFormAt: this.selFormButtons.map((b) => toScreen(b.x, b.y)),
      selOrderAt: this.selOrderButtons.map((b) => toScreen(b.x, b.y)),
      selSortAt: this.selSortButtons.map((b) => toScreen(b.x, b.y)),
      selEligibleAt: this.selEligibleButtons.map((b) => toScreen(b.x, b.y)),
      selHintAt: this.selHintButtons.map((b) => toScreen(b.x, b.y)),
      selMarkAt: this.selMarkButtons.map((b) => toScreen(b.x, b.y)),
      selDropOutsideAt: this.selDropOutsideButtons.map((b) => toScreen(b.x, b.y)),
      stackSqueezeAt: this.stackSqueezeButtons.map((b) => toScreen(b.x, b.y)),
      stackReorderAt: this.stackReorderToggle ? toScreen(this.stackReorderToggle.hitCenter().x, this.stackReorderToggle.hitCenter().y) : null,
      controls: {
        buttons: this.controlButtons.map(({ cap, b }) => ({ cap, ...toScreen(b.x, b.y) })),
        flipFaceUp: (this.byId.get("ctl-flip") as Card | undefined)?.faceUp ?? null,
        concealed: (this.byId.get("ctl-conceal") as Card | undefined)?.concealed ?? null,
        revealValue: (this.byId.get("ctl-reveal") as Card | undefined)?.card ?? null,
        moveCounts: this.stackMove ? { a: this.stackMove.a.length, b: this.stackMove.b.length } : null,
        widgets: this.widgetControls
          ? {
              flag: this.widgetDemo.flag,
              level: this.widgetDemo.level,
              mode: this.widgetDemo.mode,
              toggleAt: this.widgetControls.toggles[0] ? toScreen(this.widgetControls.toggles[0].hitCenter().x, this.widgetControls.toggles[0].hitCenter().y) : null,
              stepperMinusAt: this.widgetControls.steppers[0] ? toScreen(this.widgetControls.steppers[0].buttons()[0]!.x, this.widgetControls.steppers[0].buttons()[0]!.y) : null,
              stepperPlusAt: this.widgetControls.steppers[0] ? toScreen(this.widgetControls.steppers[0].buttons()[1]!.x, this.widgetControls.steppers[0].buttons()[1]!.y) : null,
              segmentedAt: this.widgetControls.segments[0] ? this.widgetControls.segments[0].buttons().map((b) => toScreen(b.x, b.y)) : [],
            }
          : null,
      },
      cardW: this.cardW * this.viewport.zoom,
      draggingId: this.drag?.lead.id ?? null,
      // «Карты — варианты» всегда спавнятся ПЕРВЫМИ (buildCardsRow — первая секция buildContent),
      // так что this.cards[i] для i < STORIES.length — тот же элемент, что и STORIES[i] (как уже
      // делает firstCard = this.cards[0] выше).
      storyCards: STORIES.map((s, i) => {
        const c = this.cards[i]?.card;
        if (!c) return null;
        return { caption: s.caption, ...toScreen(c.body.px, c.body.py), card: c.card, faceUp: c.faceUp, draggable: c.draggable, back: c.back, faceStyle: c.faceStyle, fourColor: c.fourColor, torn: c.torn, size: c.size, custom: c.custom, rest: c.rest, concealed: c.concealed };
      }).filter((x): x is NonNullable<typeof x> => x !== null),
    };
  }

  // Состояние Поля для e2e: размеры стопки/грида + экранные точки/рамка грида.
  private fieldHook(toScreen: (x: number, y: number) => { x: number; y: number }): { stack: number; grid: number; colsMin: number; colsMax: number | undefined; rowsMin: number; rowsMax: number | undefined; reorder: boolean; reorderToggleAt: { x: number; y: number } | null; steppers: { label: string; value: number; minusAt: { x: number; y: number }; plusAt: { x: number; y: number } }[]; stackAt: { x: number; y: number }; gridRect: { x: number; y: number; w: number; h: number }; gridCards: { id: string; x: number; y: number }[] } | null {
    const f = this.fields[0];
    if (!f) return null;
    const gr = f.gridRect();
    const tl = toScreen(gr.x, gr.y);
    return {
      stack: f.stackIds.length,
      grid: f.gridIds.length,
      colsMin: f.colsMin,
      colsMax: f.colsMax,
      rowsMin: f.rowsMin,
      rowsMax: f.rowsMax,
      reorder: f.reorder,
      reorderToggleAt: this.fieldReorderToggle ? toScreen(this.fieldReorderToggle.hitCenter().x, this.fieldReorderToggle.hitCenter().y) : null,
      steppers: (() => {
        const numberLabels = f.params().filter((p) => p.kind === "number").map((p) => p.label);
        return this.fieldSteppers.map((s, i) => {
          const [minus, plus] = s.buttons();
          return { label: numberLabels[i] ?? "", value: s.value, minusAt: toScreen(minus!.x, minus!.y), plusAt: toScreen(plus!.x, plus!.y) };
        });
      })(),
      stackAt: toScreen(f.stackRect.x + f.stackRect.w / 2, f.stackRect.y + f.stackRect.h / 2),
      gridRect: { x: tl.x, y: tl.y, w: gr.w * this.viewport.zoom, h: gr.h * this.viewport.zoom },
      gridCards: f.gridIds
        .map((id) => ({ id, el: this.byId.get(id) }))
        .filter((o): o is { id: string; el: Elem } => !!o.el)
        .map(({ id, el }) => ({ id, ...toScreen(el.body.px, el.body.py) })),
    };
  }

  // Первый борд (Поле — отдельная механика, НЕ в boardZones).
  private firstBoard(): BoardZone | undefined {
    return this.boardZones[0];
  }

  // Экранные позиции фигур первого борда + их ЛОГИЧЕСКИЙ слот (для e2e: проверить переезд).
  private boardFiguresHook(toScreen: (x: number, y: number) => { x: number; y: number }): { id: string; key: string; x: number; y: number }[] {
    const z = this.firstBoard();
    if (!z) return [];
    const out: { id: string; key: string; x: number; y: number }[] = [];
    for (const key of Object.keys(z.board.slots)) {
      for (const id of z.board.slots[key]!.members) {
        const el = this.byId.get(id);
        if (el) out.push({ id, key, ...toScreen(el.body.px, el.body.py) });
      }
    }
    return out;
  }

  // ——— публичное API доски = ПОРТ КОМАНД (то, чем СЕРВЕР/консоль/скрытая логика двигают карты) ———
  // Все действия проходят через один dispatch (choke-point для undo/сети/синка — см. CONTROL-DESIGN.md).
  // Движения — та же пружина, что и при драге. Ниже — тонкие обёртки-удобства над dispatch.

  /** Исполнить команду управления доской. Единая дверь для всех драйверов. */
  dispatch(cmd: Command): void {
    switch (cmd.t) {
      case "flip": {
        const el = this.byId.get(cmd.id);
        if (el && "requestFlip" in el && (el as { requestFlip(): boolean }).requestFlip()) this.wake();
        break;
      }
      case "move": {
        const c = this.byId.get(cmd.id);
        if (c) {
          c.body.setTarget({ x: cmd.x, y: cmd.y, rot: 0 });
          this.wake();
        }
        break;
      }
      case "conceal": {
        const el = this.byId.get(cmd.id);
        if (el && "setConcealed" in el) {
          (el as { setConcealed(v: boolean): void }).setConcealed(cmd.v);
          this.wake();
        }
        break;
      }
      case "setValue": {
        const el = this.byId.get(cmd.id);
        if (el && "setValue" in el) {
          (el as { setValue(v: string): void }).setValue(cmd.value);
          this.wake();
        }
        break;
      }
    }
  }

  /** Перевернуть карту по id (напр. «игрок открыл карту»). Не-Flippable элемент игнорируем. */
  flipCard(id: string): void {
    this.dispatch({ t: "flip", id });
  }

  /** Плавно (пружиной) переместить карту по id в точку контента (напр. «перенёс в дропзону»). */
  moveCard(id: string, x: number, y: number): void {
    this.dispatch({ t: "move", id, x, y });
  }

  /** Скрыть/раскрыть карту по id (секретность ставится/снимается ИЗВНЕ). Не-Concealable игнорим. */
  setConcealed(id: string, v: boolean): void {
    this.dispatch({ t: "conceal", id, v });
  }

  /** Проставить/придержать ЗНАЧЕНИЕ карты по id (сервер раскрыл придержанное; "" — снова придержать). */
  setCardValue(id: string, value: string): void {
    this.dispatch({ t: "setValue", id, value });
  }

  // ——— раздел «Управление» (демо API) ———

  private buildControls(left: number, top: number): number {
    return this.sectionFrame(left, top, "Управление", (contentLeft, contentTop) => {
      let y = contentTop;
      let width = 0;
      const row = (bottom: number, w: number) => {
        y = bottom + SB_ITEM_GAP;
        width = Math.max(width, w);
      };
      const r1 = this.buildFlipBlock(contentLeft, y);
      row(r1.bottom, r1.width);
      const r2 = this.buildConcealBlock(contentLeft, y);
      row(r2.bottom, r2.width);
      const r3 = this.buildRevealBlock(contentLeft, y);
      row(r3.bottom, r3.width);
      const r4 = this.buildMoveBlock(contentLeft, y);
      row(r4.bottom, r4.width);
      const r5 = this.buildWidgetsBlock(contentLeft, y);
      width = Math.max(width, r5.width);
      return { bottom: r5.bottom, width };
    });
  }

  // Общий каркас демо-блока «Управления»: fit-рамка + текст-кнопка + одна карта. Блоки различаются
  // лишь кнопкой (лейбл+действие) и пропсами карты — их даёт вызыватель. DRY для flip/conceal/reveal.
  private singleCardControl(left: number, top: number, btn: Button, cardOpts: CardOptions): { bottom: number; width: number } {
    const box = fitBlock(btn.w, this.cardW, btn.h, this.cardH);
    this.blockFrame(left, top, box.boxW, box.boxH);
    const cx = left + box.boxW / 2;
    btn.place(cx, top + box.btnCY);
    this.registerButton(btn);
    const card = new Card({ ...cardOpts, rest: "idle" }, this.tex, this.baseScale);
    card.body.snapTo({ x: cx, y: top + box.cardCY, rot: 0, scale: card.restScale });
    this.addControlCard(card);
    return { bottom: top + box.boxH, width: box.boxW };
  }

  // Блок «перевернуть» — по тапу переворачивает карту (flipCard). Бокс подгоняется под контент (fit).
  private buildFlipBlock(left: number, top: number): { bottom: number; width: number } {
    const cap = "перевернуть карту";
    const btn = this.textButton(cap, () => this.flipCard("ctl-flip"));
    this.controlButtons.push({ cap, b: btn });
    return this.singleCardControl(left, top, btn, { id: "ctl-flip", card: "A♥" });
  }

  // Блок «раскрыть/скрыть» (C3): карта в режиме секретности (живая «пыль»); тап снимает/ставит
  // скрытость через API — раскрытая показывает НАСТОЯЩЕЕ лицо (значение под пылью реально).
  private buildConcealBlock(left: number, top: number): { bottom: number; width: number } {
    let concealed = true;
    const cap = "раскрыть / скрыть";
    const btn = this.textButton(cap, () => {
      concealed = !concealed;
      this.setConcealed("ctl-conceal", concealed);
    });
    this.controlButtons.push({ cap, b: btn });
    return this.singleCardControl(left, top, btn, { id: "ctl-conceal", card: "K♠", hidden: true });
  }

  // Блок «раскрытие значения» (C1): карта с ПРИДЕРЖАННЫМ значением (card:"" → маска); тап проставляет
  // значение через API — карта показывает НАСТОЯЩЕЕ лицо (сервер раскрыл / снова придержал).
  private buildRevealBlock(left: number, top: number): { bottom: number; width: number } {
    let known = false;
    const cap = "узнать значение";
    const btn = this.textButton(cap, () => {
      known = !known;
      this.setCardValue("ctl-reveal", known ? "Q♦" : "");
    });
    this.controlButtons.push({ cap, b: btn });
    return this.singleCardControl(left, top, btn, { id: "ctl-reveal", card: "" });
  }

  // Блок 2: две стопки (5 и 4). Тап — случайная карта летит из одной в другую и остаётся там;
  // следующий тап — случайная летит обратно. Направление чередуется. Бокс подгоняется под контент.
  private buildMoveBlock(left: number, top: number): { bottom: number; width: number } {
    const step = this.cardW * 0.4;
    const footprint = this.cardW + 4 * step; // до 5 карт внахлёст
    const stacksGap = this.cardW * 0.7;
    const stacksW = footprint * 2 + stacksGap;
    const cap = "перенос из стопки в стопку";
    const btn = this.textButton(cap, () => this.doStackMove());
    this.controlButtons.push({ cap, b: btn });
    const box = fitBlock(btn.w, stacksW, btn.h, this.cardH);
    this.blockFrame(left, top, box.boxW, box.boxH);
    const cx = left + box.boxW / 2;
    btn.place(cx, top + box.btnCY);
    this.registerButton(btn);
    const y = top + box.cardCY;
    const groupLeft = left + (box.boxW - stacksW) / 2; // группа стопок по центру блока
    const ax = groupLeft;
    const bx = groupLeft + footprint + stacksGap;
    const a = ["6♣", "7♣", "8♣", "9♣", "10♣"].map((r, i) => this.makeStackCard(`sa${i}`, r));
    const b = ["6♦", "7♦", "8♦", "9♦"].map((r, i) => this.makeStackCard(`sb${i}`, r));
    this.stackMove = { a, b, ax, bx, y, toB: true };
    this.relayoutStack(a, ax, y, true);
    this.relayoutStack(b, bx, y, true);
    return { bottom: top + box.boxH, width: box.boxW };
  }

  // Витрина «виджеты контролов» — Toggle/Stepper/Segmented на тривиальном локальном состоянии,
  // ОТДЕЛЬНО от команд dispatch/flipCard/… выше: доказывает, что это переиспользуемые атомы UI-kit,
  // а не то, что «прикрутили только к Полю/бордам». Тот же двухпроходный трюк, что у sectionFrame —
  // размер бокса известен только после attachControls (Stepper/Toggle/Segmented сами решают свою ширину).
  private buildWidgetsBlock(left: number, top: number): { bottom: number; width: number } {
    const pad = BLOCK_PAD;
    const frameIndex = this.scene.surface.children.length;
    const cap = this.label("виджеты контролов (Toggle / Stepper / Segmented)", left + pad, top + pad, 13, 0xcdb98f, undefined, 0);
    this.scene.surface.addChild(cap);
    const contentTop = top + pad + cap.height + 12;
    const cfg: Configurable = {
      params: () => [
        { kind: "bool", label: "флаг", get: () => this.widgetDemo.flag, set: (v) => (this.widgetDemo.flag = v) },
        { kind: "number", label: "уровень", min: 0, max: 10, get: () => this.widgetDemo.level, set: (v) => (this.widgetDemo.level = v) },
        { kind: "choice", label: "режим", options: ["a", "b", "c"], get: () => this.widgetDemo.mode, set: (v) => (this.widgetDemo.mode = v) },
      ],
    };
    const rc = attachControls(cfg, { layer: this.scene.surface, register: (b) => this.registerButton(b), onChange: () => this.wake() }, { x: left + pad, y: contentTop });
    this.widgetControls = rc;
    const width = Math.max(cap.width, rc.steppers[0]?.w ?? 0, rc.toggles[0]?.w ?? 0, rc.segments[0]?.w ?? 0) + pad * 2;
    const height = rc.bottom - top + pad;
    const frame = new Graphics();
    frame.roundRect(left, top, width, height, 12).fill({ color: 0x000000, alpha: 0.1 }).stroke({ width: 1, color: 0x4a5b50 });
    this.scene.surface.addChildAt(frame, frameIndex);
    return { bottom: top + height, width };
  }

  private doStackMove(): void {
    const s = this.stackMove;
    if (!s) return;
    const [from, to, fromX, toX] = s.toB ? [s.a, s.b, s.ax, s.bx] : [s.b, s.a, s.bx, s.ax];
    if (from.length > 0) {
      const [id] = from.splice(Math.floor(Math.random() * from.length), 1); // случайная карта
      to.push(id); // ложится сверху (правее)
      this.relayoutStack(from, fromX, s.y);
      this.relayoutStack(to, toX, s.y);
    }
    s.toB = !s.toB; // следующий тап — в обратную сторону
  }

  // Разложить стопку: i-я карта левее→правее, правее = выше по z. snap — при первичной раскладке.
  private relayoutStack(ids: string[], originX: number, y: number, snap = false): void {
    const step = this.cardW * 0.4;
    ids.forEach((id, i) => {
      const c = this.byId.get(id);
      if (!c) return;
      c.root.zIndex = i;
      const x = originX + this.cardW / 2 + i * step;
      if (snap) c.body.snapTo({ x, y, rot: 0, scale: c.restScale });
      else this.moveCard(id, x, y);
    });
    this.wake();
  }

  private makeStackCard(id: string, rank: string): string {
    const card = new Card({ id, card: rank, rest: "idle" }, this.tex, this.baseScale);
    this.addControlCard(card);
    return id;
  }

  private addControlCard(card: Card): void {
    card.reduceMotion = this.reduceMotion;
    this.controlCards.push(card);
    if (card.id) this.byId.set(card.id, card);
    this.placeCard(card);
  }

  private textButton(label: string, onClick: () => void): Button {
    return new Button({ label, variant: "text", onClick }); // размещает вызывающий блок
  }

  private registerButton(b: Button): void {
    this.buttons.push(b);
    this.scene.surface.addChild(b.root);
  }

  private blockFrame(x: number, y: number, w: number, h: number): void {
    const g = new Graphics();
    g.roundRect(x, y, w, h, 12)
      .fill({ color: 0x000000, alpha: 0.1 })
      .stroke({ width: 1, color: 0x4a5b50 });
    this.scene.surface.addChild(g);
  }

  // Кладём зону: фон+название — на поверхность (под картами), глагол — в слой над лежащими картами.
  // accepts — умеет ли ТЕКУЩИЙ груз то, что предлагает эта зона (flip/burn/peek); зона подсвечивается
  // (glow + текст-обещание) ТОЛЬКО если груз реально способен — иначе зона «врёт» глаголом грузу,
  // который она всё равно не примет (см. hot-циклы в onCardMove/edgeScroll). textFor — опционально:
  // подпись зависит не только от способности, но и от ТЕКУЩЕГО состояния груза (ПОДГЛЯДЕТЬ уже
  // раскрытой картой нечего подглядывать — см. needsPeek/buildDropzonesBlock).
  private registerZone(zone: DropZone, onDrop: (p: DragPayload) => void, accepts: (p: DragPayload) => boolean, textFor?: (p: DragPayload) => { armed: string; hot: string }): void {
    this.zones.push({ zone, onDrop, accepts, textFor });
    this.scene.surface.addChild(zone.base);
    this.scene.verb.addChild(zone.verb);
    if (zone.armedText) this.scene.verb.addChild(zone.armedText);
  }

  // Живые Card из накопленных спеков. restore — снимок (положение/лицо), сгоревшие пропускаем.
  private spawnCards(restore?: Map<number, CardRuntime>): void {
    this.cardSpecs.forEach((spec, i) => {
      const r = restore?.get(i);
      if (restore && !r) return; // сгоревшую карту при рестарте канваса не воскрешаем
      const card = new Card(r ? { ...spec.opts, faceUp: r.faceUp } : spec.opts, this.tex, this.baseScale);
      card.reduceMotion = this.reduceMotion;
      card.bobPhase = spec.bobPhase;
      card.root.zIndex = spec.depth;
      card.body.snapTo({ x: r ? r.x : spec.home.x, y: r ? r.y : spec.home.y, rot: 0, scale: card.restScale });
      this.placeCard(card);
      if (card.id) this.byId.set(card.id, card); // карты стопок адресуются по id (захват пачки)
      this.cards.push({ card, home: spec.home, depth: spec.depth, specIndex: i });
    });
  }

  private snapshotCards(): Map<number, CardRuntime> {
    const m = new Map<number, CardRuntime>();
    for (const p of this.cards) {
      if (p.card.dead || p.card.burning) continue; // сгоревшие/догорающие не восстанавливаем
      m.set(p.specIndex, { faceUp: p.card.faceUp, x: p.card.body.px, y: p.card.body.py });
    }
    return m;
  }

  // Стопки. Первая — ЛЕВИТИРУЮЩАЯ: 6 карт стоят внахлёст рядом, каждая сдвинута вправо;
  // негласное правило — верхняя карта СПРАВА (правее = выше по z). Без веера/арки/перестановок.
  // Ряд из ТРЁХ стопок с разными «драггерами» захвата всей пачки: без ручки / грип / таб.
  // Плюс переключатель режима драга карты (одна / вся стопка). Верхняя карта справа, левитируют.
  private buildStacks(left: number, top: number): number {
    return this.sectionFrame(left, top, "Стопки", (contentLeft, contentTop) => {
      const cy = contentTop + this.cardH / 2;
      const step = this.cardW * 0.4; // сдвиг соседа вправо (перекрытие)
      const ranks = ["6♦", "7♦", "8♦", "9♦", "10♦"];
      const footprint = this.cardW + (ranks.length - 1) * step;
      const gap = this.cardW * 0.9;
      // Демо якорей: у трёх стопок РАЗНЫЕ политики видимости и разные иконки. Драггер у всех
      // одинаковый (грип, летит с пачкой). Драггер↔якорь свапаются по состоянию (см. marker.ts).
      const anchors: { draw: (g: Graphics) => void; show: ShowPolicy; cap: string }[] = [
        { draw: drawAnchorIcon, show: "away", cap: "якорь: когда унесли" },
        { draw: drawRingIcon, show: "empty", cap: "кольцо: когда пусто" },
        { draw: drawPinIcon, show: "always", cap: "метка: всегда" },
      ];
      anchors.forEach((a, s) => {
        const ox = contentLeft + s * (footprint + gap);
        const ids = ranks.map((_, i) => `stk${s}c${i}`);
        // Stack держит порядок/дом/реордер на дереве слотов; дома карт берём у него.
        const stack = new Stack({ left: ox, top: cy - this.cardH / 2, cell: { w: this.cardW, h: this.cardH }, step, ids, reorder: true });
        ids.forEach((id, i) => {
          this.cardSpecs.push({ opts: { id, card: ranks[i]!, rest: "floating" }, home: stack.homeOf(id), depth: i, bobPhase: i * 0.6 + s });
        });
        const slot = { x: ox + footprint / 2, y: cy }; // центр стопки — дом для меток
        const host: MarkerHost = {
          slotPos: () => slot,
          state: () => this.stackState(stack.ids),
          makePayload: (cp) => this.makeStackPayload(stack.ids, cp),
        };
        const dragger = withDragger(host, this.scene.verb, this.scene.cards.drag, {
          draw: drawGrip,
          offset: { x: 0, y: this.cardH / 2 + 9 }, // грип под стопкой
          hit: { w: 44, h: 22 },
          follow: true,
          followOffset: { x: 0, y: this.cardH * 0.62 }, // едет под пачкой у пальца
        });
        const anchor = withAnchor(host, this.scene.surface, { draw: a.draw, show: a.show }); // якорь в центре, под картами
        this.markers.push(dragger, anchor);
        this.stacks.push({ stack, host, dragger, anchor });
        this.grabbers.push({ marker: dragger, host, lead: () => this.byId.get(stack.top ?? "") ?? null });
        this.scene.surface.addChild(this.label(a.cap, ox + footprint / 2, cy + this.cardH / 2 + 26, 12, 0x9aa89f, footprint));
      });
      const stacksRight = contentLeft + 2 * (footprint + gap) + footprint;
      let y = cy + this.cardH / 2 + 50;
      let width = stacksRight - contentLeft;
      const r1 = this.segToggle(contentLeft, y, "режим драга карты:", ["по карте", "всю стопку"], this.stackMode === "one" ? 0 : 1, (i) => (this.stackMode = i === 0 ? "one" : "whole"));
      this.stackModeButtons = r1.buttons;
      y = r1.bottom + SB_ITEM_GAP;
      width = Math.max(width, r1.width);
      const r2 = this.segToggle(contentLeft, y, "при драге стопки:", ["рассыпью", "в руку"], this.dragSqueeze ? 1 : 0, (i) => (this.dragSqueeze = i === 1));
      this.stackSqueezeButtons = r2.buttons;
      y = r2.bottom + SB_ITEM_GAP;
      width = Math.max(width, r2.width);
      // «реордер стопок:» — общий тумблер на ВСЕ три демо-стопки разом (Stack.Configurable сам
      // по себе — про ОДНУ стопку; адаптер сверху даёт attachControls+Toggle вместо segToggle,
      // не меняя поведение «один переключатель — все стопки»).
      const reorderAll: Configurable = {
        params: () => [{ kind: "bool", label: "реордер стопок:", get: () => this.stacks[0]?.stack.reorder ?? true, set: (v) => this.stacks.forEach((st) => (st.stack.reorder = v)) }],
      };
      const rc = attachControls(reorderAll, { layer: this.scene.surface, register: (b) => this.registerButton(b), onChange: () => this.wake() }, { x: contentLeft, y });
      this.stackReorderToggle = rc.toggles[0] ?? null;
      y = rc.bottom;
      width = Math.max(width, rc.toggles[0]?.w ?? 0);
      return { bottom: y, width };
    });
  }

  // Ряд НЕ-карточных элементов: соло-карта с меткой + фишки номиналов + шахматы. Все — тот же
  // драг/тени/метки, что и карты (Piece реализует те же способности). Конь тоже носит метку —
  // withDragger/withAnchor generic по элементу, не только по стопке.
  private buildPieces(left: number, top: number): number {
    return this.sectionFrame(left, top, "Фишки и фигуры", (contentLeft, contentTop) => {
      const r = this.cardH * 0.34; // радиус фишки/подставки
      const slotW = this.cardW * 1.05;

      // Ряд как ДАННЫЕ: соло-карта с меткой / фишки-номиналы / шахматы (конь с меткой) / стопка фишек.
      // Все — тот же драг/тени/метки; фишки/фигуры Draggable+Burnable, но НЕ Flippable (зона реагирует
      // на способности). `el.kind` диспетчится ниже одним циклом (задел под BoardFactory-контент).
      const items: PieceRowItem[] = [
        { caption: "карта + метка", w: slotW, el: { kind: "card", id: "solo-card", card: "A♠" }, marker: { draw: drawAnchorIcon, show: "away", label: "карта" } },
        { caption: "фишка 5", w: slotW * 0.78, el: { kind: "piece", id: "chip-5", spec: { kind: "chip", color: 0xb23b34, denom: "5" } } },
        { caption: "фишка 25", w: slotW * 0.78, el: { kind: "piece", id: "chip-25", spec: { kind: "chip", color: 0x2f6b34, denom: "25" } } },
        { caption: "фишка 100", w: slotW * 0.78, el: { kind: "piece", id: "chip-100", spec: { kind: "chip", color: 0x24242a, denom: "100" } } },
        { caption: "фишка 500", w: slotW * 0.78, el: { kind: "piece", id: "chip-500", spec: { kind: "chip", color: 0x6c4bb0, denom: "500" } } },
        { caption: "чёрный конь", w: slotW * 0.9, el: { kind: "piece", id: "chess-knight", spec: { kind: "chess", dark: true, glyph: "♞" } }, marker: { draw: drawRingIcon, show: "empty", label: "конь" } },
        { caption: "белая пешка", w: slotW * 0.9, el: { kind: "piece", id: "chess-pawn", spec: { kind: "chess", dark: false, glyph: "♟" } } },
        { caption: "стопка фишек", w: slotW, el: { kind: "stack" } },
      ];

      // Перенос строк: ряд из 8 переполняет узкий экран (390px) — wrapRow пакует по maxWidth,
      // itemH включает высоту карты/фишки + подпись под ней (тот же зазор, что был у одной строки).
      const maxWidth = this.cardW * 8;
      const itemH = this.cardH + 34;
      const { items: placed, totalH } = wrapRow(items.map((it) => it.w), maxWidth, itemH, SB_ITEM_GAP);
      let width = 0;
      items.forEach((it, i) => {
        const p = placed[i]!;
        const x = contentLeft + this.cardW / 2 + p.x;
        const cy = contentTop + p.y + this.cardH / 2;
        const home = { x, y: cy };
        if (it.el.kind === "card") this.cardSpecs.push({ opts: { id: it.el.id, card: it.el.card, rest: "idle" }, home, depth: 100, bobPhase: 0 });
        else if (it.el.kind === "piece") this.spawnPiece(it.el.id, home, it.el.spec, r);
        else this.buildChipStack(x, cy, r); // стопка фишек — группа за грип (GroupDrag)
        if (it.marker && it.el.kind !== "stack") this.attachSolo(it.el.id, home, it.marker.draw, it.marker.show, it.marker.label);
        this.scene.surface.addChild(this.label(it.caption, x, cy + this.cardH / 2 + 8, 12, 0x9aa89f, it.w));
        width = Math.max(width, p.x + it.w);
      });

      return { bottom: contentTop + totalH, width: this.cardW / 2 + width };
    });
  }

  // Живой не-карточный элемент: визуал берём из реестра по спеке (pieceKinds), дальше как карту
  // (snapTo → слой → реестр byId → список pieces). r — радиус; размер элемента r*2.
  private spawnPiece(id: string, home: { x: number; y: number }, spec: PieceSpec, r: number, depth?: number): void {
    const { build, shadow } = pieceVisual(spec, r);
    const piece = new Piece({ id, w: r * 2, h: r * 2, build, shadow });
    piece.root.zIndex = depth ?? 100 + this.pieces.length;
    piece.body.snapTo({ x: home.x, y: home.y, rot: 0, scale: piece.restScale });
    this.placeCard(piece);
    this.byId.set(id, piece);
    this.pieces.push({ el: piece, home: { ...home }, depth: piece.root.zIndex });
  }

  // Состояние одиночной цели (соло-карта/фигура) для меток: 1 дома, если жива и не в драге.
  private soloState(id: string): MarkerState {
    const el = this.byId.get(id);
    if (!el) return { atHome: 0, total: 0 };
    return { atHome: el.state === "drag" ? 0 : 1, total: 1 };
  }

  // Навесить пару меток (драггер+якорь) на ЛЮБОЙ host (соло-элемент ИЛИ группу) — общая навеска:
  // грип едет с грузом, якорь стоит дома по политике. Регистрирует их в markers+grabbers.
  private mountMarkers(host: MarkerHost, lead: () => Elem | null, anchorDraw: (g: Graphics) => void, anchorShow: ShowPolicy): { dragger: Marker; anchor: Marker } {
    const dragger = withDragger(host, this.scene.verb, this.scene.cards.drag, {
      draw: drawGrip,
      offset: { x: 0, y: this.cardH / 2 + 9 },
      hit: { w: 44, h: 22 },
      follow: true,
      followOffset: { x: 0, y: this.cardH * 0.62 },
    });
    const anchor = withAnchor(host, this.scene.surface, { draw: anchorDraw, show: anchorShow });
    this.markers.push(dragger, anchor);
    this.grabbers.push({ marker: dragger, host, lead });
    return { dragger, anchor };
  }

  // Метки на ОДИНОЧНЫЙ элемент по id (host отдаёт SingleDrag). Соло-карта и соло-фигура одинаково.
  private attachSolo(id: string, slot: { x: number; y: number }, anchorDraw: (g: Graphics) => void, anchorShow: ShowPolicy, label: string): void {
    const lead = () => this.byId.get(id) ?? null;
    const host: MarkerHost = {
      slotPos: () => slot,
      state: () => this.soloState(id),
      makePayload: (cp) => {
        const el = this.byId.get(id);
        return el ? new SingleDrag(el, this.dragCtx, cp) : null;
      },
    };
    const { dragger, anchor } = this.mountMarkers(host, lead, anchorDraw, anchorShow);
    this.solos.push({ host, dragger, anchor, lead, label });
  }

  // Вертикальная СТОПКА ФИШЕК (как в покере), которую тянут ЦЕЛИКОМ за грип. Тот же host +
  // makeStackPayload (GroupDrag), что у стопки карт — доказательство, что группировка generic по
  // элементу. Флип пачки не сработает (фишки не Flippable → GroupDrag.flip пуст), сжечь — сработает.
  private buildChipStack(x: number, cy: number, r: number): void {
    const n = 6;
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const id = `pile-${i}`;
      this.spawnPiece(id, { x, y: cy - i * r * 0.28 }, { kind: "chip", color: 0xc79a3e, denom: "" }, r); // одинаковые, друг на друге
      ids.push(id);
    }
    const slot = { x, y: cy - ((n - 1) / 2) * r * 0.28 }; // центр столбика
    const host: MarkerHost = {
      slotPos: () => slot,
      state: () => this.stackState(ids),
      makePayload: (cp) => this.makeStackPayload(ids, cp),
    };
    const { dragger } = this.mountMarkers(host, () => this.byId.get(ids[ids.length - 1]!) ?? null, drawAnchorIcon, "away");
    this.chipPile = { ids, dragger };
  }

  // «Ручка» стопки: еле видна (аффорданс, не мусор). grip — три точки, tab — пилюля; обе под низом
  // стопки. Возвращает прямоугольник хит-зоны (в координатах контента) или null (без ручки).
  // Состояние стопки для меток: сколько карт живо (в byId) и сколько стоит дома (не в драге).
  private stackState(ids: string[]): MarkerState {
    let atHome = 0;
    let total = 0;
    for (const id of ids) {
      const c = this.byId.get(id);
      if (!c) continue; // уничтожена/реапнута
      total++;
      if (c.state !== "drag") atHome++;
    }
    return { atHome, total };
  }

  // Груз для захвата всей стопки (по её живым картам).
  private makeStackPayload(ids: string[], cp: { x: number; y: number }): DragPayload | null {
    const cards = ids.map((id) => this.byId.get(id)).filter((c): c is Elem => !!c);
    return cards.length ? new GroupDrag(cards, this.wholeOffsets(cards, cp), this.dragCtx) : null;
  }

  // Стильный сегментный переключатель режима драга: «по карте» | «всю стопку».
  // Стильный сегментный переключатель: подпись + текст-кнопки, под активной — золотая черта.
  // Остаётся для ДЕМО-флагов самого движка (не свойство переиспользуемого объекта) — там, где
  // цель уже Configurable, тумблер идёт через attachControls+Segmented (см. раздел «Дизайн»).
  private segToggle(left: number, y: number, caption: string, labels: string[], initial: number, onPick: (i: number) => void): { bottom: number; width: number; buttons: Button[]; setMark: (i: number) => void } {
    const cap = this.label(caption, left, y, 12, 0x9aa89f, undefined, 0);
    this.scene.surface.addChild(cap);
    const mark = new Graphics();
    const btns: Button[] = [];
    const setMark = (i: number) => {
      const b = btns[i]!;
      mark.clear();
      mark.roundRect(b.x - b.w / 2 + 4, b.y + b.h / 2 - 1, b.w - 8, 2, 1).fill({ color: 0xf2c14e });
      this.wake();
    };
    let x = left + cap.width + 14;
    let rowH = 0;
    labels.forEach((lab, i) => {
      const b = this.textButton(lab, () => {
        onPick(i);
        setMark(i);
      });
      b.place(x + b.w / 2, y + b.h / 2);
      this.registerButton(b);
      btns.push(b);
      x += b.w + 10;
      rowH = Math.max(rowH, b.h);
    });
    this.scene.surface.addChild(mark);
    setMark(initial);
    // setMark наружу: пресет-тумблер пересинхронивает золотую черту остальных, НЕ дёргая их onPick.
    return { bottom: y + rowH, width: x - left - 10, buttons: btns, setMark };
  }

  // ——— ПОЛЕ — обвязка обособленного модуля board/field.ts (механика ЖИВЁТ там) ———
  // Движок только: рисует заголовок/конфиг-кнопку, создаёт Field, спавнит его 52 карты (визуалы),
  // применяет дома от Field и делегирует дроп. Всю логику Поля программируем в field.ts.
  private buildField(left: number, top: number): number {
    return this.sectionFrame(left, top, "Поле", (contentLeft, contentTop) => {
      this.scene.surface.addChild(this.label("глобальные конфиги поля (обсудим)", contentLeft, contentTop, 12, 0x9aa89f, undefined, 0));
      const cfg = new Button({ label: "конфиг поля (скоро)", variant: "secondary", size: "sm", disabled: true });
      cfg.place(contentLeft + cfg.w / 2, contentTop + 26);
      this.registerButton(cfg);

      const gy = contentTop + 50;
      const cell = { w: this.cardW * 0.95, h: this.cardH * 0.95 };
      const stackIds = DECK52.map((_, i) => `field-s-${i}`);
      // Конфиг ЭТОГО поля: обычная сетка + свой якорь-подсказка (колода→грид) + мин 3 колонки / макс 4 строки
      // (при упоре грид растёт вширь) + реордер + зазор колода→грид под длинную стрелку-якорь (deckGap 132).
      // Раскладку (где колода/грид) Поле считает САМО из этих данных — движок только даёт позицию и размер.
      const fieldCfg = { ...NORMAL_FIELD, colsMin: 3, rowsMax: 4, reorder: true, deckGap: 132, decor: { ...NORMAL_FIELD.decor!, anchorText: "тяни карту сюда" } };
      const field = new Field({ left: contentLeft, top: gy, cell, stackIds, layerBelow: this.scene.surface, layerAbove: this.scene.verb, config: fieldCfg });
      this.scene.surface.addChild(field.frame, field.anchor, field.verb);
      this.fields.push(field);

      // 52 карты закрытой стопки (рубашкой вверх). Дома берём у Field; верх — макс. z (тянется он).
      stackIds.forEach((id, i) => {
        this.faceOf.set(id, DECK52[i]!);
        this.cardSpecs.push({ opts: { id, card: DECK52[i]!, faceUp: false, rest: "idle", size: 0.85 }, home: field.homeOf(id), depth: 700 + i, bobPhase: 0 });
      });
      field.draw();

      // Контроллеры грида строятся из field.params() генериком (мин колонок / макс строк / реордер).
      // Место под ними — под зарезервированной Полем высотой (Field знает её сам).
      const controls = attachControls(field, {
        layer: this.scene.surface,
        register: (b) => this.registerButton(b),
        onChange: () => {
          this.applyFieldHomes(field);
          field.draw();
          this.wake();
        },
      }, { x: field.stackRect.x, y: gy + field.reservedHeight() + 10 });
      this.fieldReorderToggle = controls.toggles[0] ?? null;
      this.fieldSteppers = controls.steppers;
      let by = controls.bottom + 14;
      const outer = field.outerRect();
      this.scene.surface.addChild(this.label("тяни верхнюю карту из стопки в грид — карты пакуются по индексу и грид растёт", outer.x + outer.w / 2, by, 12, 0x9aa89f, outer.w));
      const bottom = by + 24;
      const controlsW = this.fieldSteppers.reduce((acc, s) => acc + s.w + 28, 0);
      const width = Math.max(outer.x + outer.w - contentLeft, controlsW);
      return { bottom, width };
    });
  }

  private fieldForCard(id: string): Field | null {
    return this.fields.find((f) => f.owns(id)) ?? null;
  }

  // Применить дома фигур Поля к их картам (после дропа/реордера карты переезжают пружиной).
  private applyFieldHomes(f: Field, except?: string): void {
    for (const id of f.allIds()) {
      if (id === except) continue; // перетаскиваемую не трогаем (она у пальца)
      const home = f.homeOf(id);
      this.setFigureHome(id, home);
      this.byId.get(id)?.body.setTarget({ x: home.x, y: home.y, rot: 0 });
    }
  }

  private stackForCard(id: string): SandboxStack | null {
    return this.stacks.find((s) => s.stack.owns(id)) ?? null;
  }

  // После реордера/наведения в стопке: новые дома + z по индексу (верх справа = выше), пружиной.
  // except — перетаскиваемую не трогаем (она у пальца).
  private applyStackHomes(st: SandboxStack, except?: string): void {
    st.stack.ids.forEach((id, i) => {
      if (id === except) return;
      const home = st.stack.homeOf(id);
      const placed = this.cards.find((p) => p.card.id === id);
      if (placed) {
        placed.home = home;
        placed.depth = i;
        placed.card.root.zIndex = i;
      }
      this.byId.get(id)?.body.setTarget({ x: home.x, y: home.y, rot: 0 });
    });
    this.wake();
  }

  // Ширина/высота борда ДО рендера — той же геометрией, что использует mountBoard (left=top=0,
  // ничего не рисуя), плюс оценка места под хвостовые контролы (тумблер/хинт/кнопки под бордом) —
  // не пиксель-в-пиксель, но безопасно с запасом (упаковка wrapFlow не должна давать нахлёст).
  private measureBoardConfig(cfg: BoardConfig, extraH: number): { w: number; h: number } {
    const { bounds } = cfg.layout === "ring" ? this.ringBounds(0, 22, cfg.cell, cfg.ringCount ?? 8) : this.gridBounds(0, 22, cfg.cols, cfg.rows, cfg.cell, cfg.gap ?? 8);
    return { w: bounds.w, h: bounds.y + bounds.h + 8 + extraH };
  }

  private selectDemoPreset(): BoardPreset {
    // 6 карт в сетке 4×2 (слоты 0,3 и 1,3 пусты — цель для драга набора). Ранги нарочно вразнобой
    // (10/6/8/A/7/Q), в т.ч. 6/8/10 — чтобы «сорт по номиналу» был виден и на 6+ фигурах помещался
    // без overflow (две короткие строки вместо одной длинной, см. issue #48, баги «6 карт» и «сорт»).
    return {
      title: "выделение (изолир., тащи набор, сорт по номиналу)",
      cols: 4,
      rows: 2,
      onOccupied: "merge",
      slots: { "0,0": ["10♠"], "0,1": ["6♣"], "0,2": ["8♥"], "1,0": ["A♦"], "1,1": ["7♣"], "1,2": ["Q♠"] },
    };
  }

  // Игровые зоны (борды): ПЛОТНАЯ СЕТКА (data-driven), не вертикальный стек — 10 бордов меряются
  // (measureBoardConfig/фиксированные размеры custom-бордов), паковка wrapFlow, потом рендер по
  // готовым (x,y). Тоглер под каждым меняет исход дропа на занятый слот (merge/swap/capture/reject)
  // через BoardZone.Configurable+Segmented. Демо-полигон BoardFactory: разные борды = разные ДАННЫЕ,
  // один движок (все 10 — один путь mountBoard).
  private buildBoardZones(left: number, top: number): number {
    return this.sectionFrame(left, top, "Игровые зоны (борды)", (contentLeft, contentTop) => {
      const PRESET_EXTRA_H = 60; // тумблер «на занятый слот» (Segmented) + отступ
      const SELECT_EXTRA_H = 277; // кнопки выделение/снять + 5 тумблеров сборки + 3 тумблера отбор-визуала + тумблер «мимо зон» (#61)
      const CHROME_EXTRA_H = 50; // хинт-подсказка + отступ (шахматы/смешанный)

      interface BoardItem {
        size: { w: number; h: number };
        render: (x: number, y: number) => number;
      }
      const items: BoardItem[] = BOARD_PRESETS.map((preset, pi) => ({
        size: this.measureBoardConfig(this.presetToBoardConfig(preset, `bz${pi}`, this.cellForPreset(preset)), PRESET_EXTRA_H),
        render: (x, y) => this.buildOneBoard(x, y, preset, pi),
      }));
      const selectPreset = this.selectDemoPreset();
      items.push({
        size: this.measureBoardConfig(this.presetToBoardConfig(selectPreset, `bz${BOARD_PRESETS.length}`, this.cellForPreset(selectPreset)), SELECT_EXTRA_H),
        render: (x, y) => this.buildSelectDemo(x, y, BOARD_PRESETS.length),
      });
      items.push({ size: this.measureBoardConfig(this.chessBoardConfig(), CHROME_EXTRA_H), render: (x, y) => this.buildChessBoard(x, y) });
      items.push({ size: this.measureBoardConfig(this.mixedBoardConfig(), CHROME_EXTRA_H), render: (x, y) => this.buildMixedBoard(x, y) });

      const maxWidth = this.cardW * 8;
      const { slots, totalH } = wrapFlow(items.map((it) => it.size), maxWidth, SB_ITEM_GAP);
      let width = 0;
      items.forEach((it, i) => {
        const s = slots[i]!;
        it.render(contentLeft + s.x, contentTop + s.y);
        width = Math.max(width, s.x + it.size.w);
      });
      return { bottom: contentTop + totalH, width };
    });
  }

  // Рамка контейнера + сетка слотов (на поверхности, под фигурами). Общая для всех бордов (DRY).
  private drawBoardFrame(zone: BoardZone, bounds: { x: number; y: number; w: number; h: number }): void {
    const frame = new Graphics();
    frame.roundRect(bounds.x - 5, bounds.y - 5, bounds.w + 10, bounds.h + 10, 10).fill({ color: 0x000000, alpha: 0.12 }).stroke({ width: 2, color: 0x4a5b50 });
    for (const { rect } of zone.slotRects()) frame.roundRect(rect.x, rect.y, rect.w, rect.h, 6).stroke({ width: 1, color: 0x5d6b64 });
    this.scene.surface.addChild(frame);
  }

  // Геометрия РУЧНОЙ сетки борда: позиционированные слоты + рамка-bounds. DRY для custom-бордов.
  private gridBounds(left: number, gy: number, cols: number, rows: number, cell: { w: number; h: number }, gap: number): { positioned: PositionedSlot[]; bounds: { x: number; y: number; w: number; h: number } } {
    const positioned = gridSlots({ cols, cell, gap, origin: { x: left, y: gy } }, rows);
    const w = cols * cell.w + (cols - 1) * gap;
    const h = rows * cell.h + (rows - 1) * gap;
    return { positioned, bounds: { x: left, y: gy, w, h } };
  }

  // Обвязка борд-зоны: BoardZone + учёт в списках + заголовок + рамка. Общая для пресет-бордов
  // (spawnBoard) и custom (шахматы/смешанный). Фигуры спавнит вызыватель. opts: value-правило + иная подпись.
  private registerBoardZone(title: string, left: number, top: number, positioned: PositionedSlot[], bounds: { x: number; y: number; w: number; h: number }, slots: Board["slots"], onOccupied: OnOccupied, opts?: { rule?: AcceptRule; labelText?: string }): BoardZone {
    const zone = new BoardZone({ slots: positioned, board: { slots, onEmpty: "keep" }, bounds, onOccupied, rule: opts?.rule });
    this.boardZones.push(zone);
    this.boardTitles.push(title);
    this.scene.surface.addChild(this.label(opts?.labelText ?? title, left, top, 13, 0xcdb98f, undefined, 0));
    this.drawBoardFrame(zone, bounds);
    return zone;
  }

  // Спавн ОДНОГО элемента борда по дескриптору: карта → cardSpecs; фигура (chip/chess) → spawnPiece
  // (визуал из реестра pieceKinds). Единая точка, снявшая 3-веточный диспетч смешанного борда.
  private spawnElement(id: string, home: { x: number; y: number }, def: ElementDef, depth: number, r = 0): void {
    if (def.kind === "card") {
      this.cardSpecs.push({ opts: { id, card: def.face, rest: "idle", size: def.size ?? 0.86 }, home, depth, bobPhase: 0 });
      this.faceOf.set(id, def.face); // для сорта набора по номиналу (rankOf) — любой карточный борд, не только select-демо
    } else this.spawnPiece(id, home, def, r, depth); // def здесь — PieceSpec (chip/chess); r — только для фигур
  }

  // Геометрия РИНГ-борда (монополия): n слотов по окружности. Радиус — по высоте ячейки, та же
  // пропорция, что раньше была у layoutForPreset (cardH*1.35 при cell=cardH*0.82 → ratio≈1.65).
  private ringBounds(left: number, gy: number, cell: { w: number; h: number }, count: number): { positioned: PositionedSlot[]; bounds: { x: number; y: number; w: number; h: number } } {
    const radius = cell.h * 1.65;
    const cx = left + radius + cell.w / 2;
    const cy = gy + radius + cell.h / 2;
    const positioned = ringSlots(count, { cx, cy, radius, cell });
    // ширина/высота НЕ равны, если cell не квадратная (карты уже, чем выше) — раньше layoutForPreset
    // считал d одной формулой на оба измерения, отсюда нижняя карта кольца заезжала на тумблер под ним.
    return { positioned, bounds: { x: left, y: gy, w: 2 * radius + cell.w, h: 2 * radius + cell.h } };
  }

  // BOARDFACTORY: из конфига-ДАННЫХ собираем хром (grid ИЛИ ring) + фигуры. «Новый борд = конфиг».
  // depthBase — база z фигур (для смешанных стопок важен порядок: снизу вверх). Возвращает зону и низ.
  private mountBoard(cfg: BoardConfig, left: number, top: number, depthBase: number): { zone: BoardZone; bottom: number } {
    const gy = top + 22;
    const { positioned, bounds } = cfg.layout === "ring" ? this.ringBounds(left, gy, cfg.cell, cfg.ringCount ?? 8) : this.gridBounds(left, gy, cfg.cols, cfg.rows, cfg.cell, cfg.gap ?? 8);
    const r = Math.min(cfg.cell.w, cfg.cell.h) * (cfg.pieceRatio ?? 0.34);
    const slots: Board["slots"] = {};
    const faces: Record<string, string> = {};
    const keys = Object.keys(cfg.slots);
    for (const key of keys) {
      slots[key] = { members: cfg.slots[key]!.map((_, j) => `${cfg.idPrefix}-${key}-${j}`), maxSize: cfg.maxSize };
      cfg.slots[key]!.forEach((def, j) => {
        if (def.kind === "card") faces[`${cfg.idPrefix}-${key}-${j}`] = def.face;
      });
    }
    const rule = cfg.rule ? wrapRule(cfg.rule, faces) : undefined;
    const zone = this.registerBoardZone(cfg.title, left, top, positioned, bounds, slots, cfg.onOccupied, { labelText: cfg.labelText, rule });
    let depth = depthBase;
    for (const key of keys) {
      cfg.slots[key]!.forEach((def, j) => this.spawnElement(`${cfg.idPrefix}-${key}-${j}`, zone.figureHome(`${cfg.idPrefix}-${key}-${j}`), def, depth++, r));
    }
    if (cfg.hint) this.scene.surface.addChild(this.label(cfg.hint, left + bounds.w / 2, bounds.y + bounds.h + 12, 12, 0x9aa89f, bounds.w));
    return { zone, bottom: bounds.y + bounds.h + 8 };
  }

  // Пресет-данные (BoardPreset) → декларативный BoardConfig — та же фабрика mountBoard для ВСЕХ
  // 7 пресетов, что уже обслуживает шахматы/смешанный борд. cell передаёт вызыватель (grid/ring —
  // разные пропорции, как раньше в layoutForPreset).
  private presetToBoardConfig(preset: BoardPreset, idPrefix: string, cell: { w: number; h: number }): BoardConfig {
    const slots: Record<string, ElementDef[]> = {};
    for (const [key, faces] of Object.entries(preset.slots)) slots[key] = faces.map((face) => ({ kind: "card", face }));
    return {
      title: preset.title,
      cols: preset.cols,
      rows: preset.rows,
      cell,
      idPrefix,
      onOccupied: preset.onOccupied,
      slots,
      layout: preset.layout,
      ringCount: preset.ringCount,
      maxSize: preset.maxSize,
      rule: preset.rule,
    };
  }

  // Пропорции ячейки под пресет — те же, что раньше были в layoutForPreset (grid/ring разные).
  private cellForPreset(preset: BoardPreset): { w: number; h: number } {
    return preset.layout === "ring" ? { w: this.cardW * 0.82, h: this.cardH * 0.82 } : { w: this.cardW * 1.15, h: this.cardH * 1.02 };
  }

  // Борд-пресет → BoardConfig → mountBoard (единая фабрика, та же, что у шахмат/смешанного борда).
  // «На занятый слот» — через BoardZone.Configurable+Segmented (attachControls), не segToggle.
  private buildOneBoard(left: number, top: number, preset: BoardPreset, pi: number): number {
    const cfg = this.presetToBoardConfig(preset, `bz${pi}`, this.cellForPreset(preset));
    const { zone, bottom } = this.mountBoard(cfg, left, top, 300 + pi * 100);
    const rc = attachControls(zone, { layer: this.scene.surface, register: (b) => this.registerButton(b), onChange: () => this.wake() }, { x: left, y: bottom });
    if (rc.segments[0]) this.boardOnOccupiedSegments[pi] = rc.segments[0];
    return rc.bottom + 26;
  }

  // Демо ИЗОЛИРОВАННОГО мультиселекта: борд + кнопки «выделение» / «снять». В режиме тап по фигуре
  // ЭТОЙ зоны тогглит выделение (лифт), фигуры ДРУГИХ зон выделить нельзя (изоляция по scope).
  private buildSelectDemo(left: number, top: number, pi: number): number {
    const preset = this.selectDemoPreset();
    const cfg = this.presetToBoardConfig(preset, `bz${pi}`, this.cellForPreset(preset));
    const { zone, bottom } = this.mountBoard(cfg, left, top, 300 + pi * 100);
    this.selZone = zone;
    const bMode = new Button({ label: "выделение", variant: "secondary", size: "sm", onClick: () => this.toggleSelectMode() });
    const bClear = new Button({ label: "снять", variant: "ghost", size: "sm", onClick: () => this.clearSelection() });
    bMode.place(left + bMode.w / 2, bottom + 12);
    bClear.place(left + bMode.w + 10 + bClear.w / 2, bottom + 12);
    this.registerButton(bMode);
    this.registerButton(bClear);
    this.selButtons = [{ label: "выделение", btn: bMode }, { label: "снять", btn: bClear }];
    this.syncSelButtons(); // «снять» скрыта вне режима, «выделение» гаснет — исходное согласованное состояние

    // Сборка набора — рычаги как ДАННЫЕ (issue #56, SELECTION-DESIGN §4–5). Один конфиг selAssembly
    // вместо прежних «сорт набора»/«сборка»: тестер крутит рычаги ПО отдельности или берёт готовый
    // пресет (тот пересинхронивает золотую черту form/order/sort). Дефолт — пресет grab-to-hand.
    this.multiSelectOn = true;
    this.selAssembly = { ...ASSEMBLY_PRESETS[DEFAULT_PRESET]! };
    this.selPresetName = DEFAULT_PRESET;
    // Отбор-визуал (issue #60) — дефолт как в примере: только карты, без подсказки, метка «оба».
    this.selVisual = { eligible: ELIGIBLE.cards!, hintEligible: false, mark: "both" };
    this.selEligibleName = "cards";
    this.selDropOutside = DEFAULT_DROP_POLICY.onDropOutside; // #61 — дефолт «домой»
    this.selOutlines.clear(); // контуры прежнего билда уничтожены вместе с root карт при пересборке контента
    const t1 = bottom + 34;
    this.selMultiButtons = this.segToggle(left, t1, "мультиселект:", ["вкл", "выкл"], 0, (i) => {
      this.multiSelectOn = i === 0;
      if (!this.multiSelectOn && this.selMode) {
        this.selMode = false;
        this.sel = clearSel();
        this.syncSelButtons();
        this.refreshSel();
        this.wake();
      }
    }).buttons;

    const forms: Form[] = ["stack-tight", "stack-open", "row"];
    const orders: NaturalOrder[] = ["proximity", "selection"];
    const overrides: SortOverride[] = ["none", "rank", "suit"];
    const presets = ["grab-to-hand", "build-on-first", "tray-zone", "sorted-row"];
    const formIdx = (f: Form) => Math.max(0, forms.indexOf(f)); // fan (v2) → 0: в пресетах песочницы не участвует
    const orderIdx = (o: NaturalOrder) => (o === "proximity" ? 0 : 1); // append ≈ selection (оба «по нажатию»)
    const overrideIdx = (s: SortOverride) => Math.max(0, overrides.indexOf(s)); // center (v2) → 0

    const form = this.segToggle(left, t1 + 26, "форма:", ["стопка", "раскрыт", "ряд"], formIdx(this.selAssembly.form), (i) => (this.selAssembly.form = forms[i]!));
    this.selFormButtons = form.buttons;
    const order = this.segToggle(left, t1 + 52, "порядок:", ["расположение", "выбор"], orderIdx(this.selAssembly.order), (i) => (this.selAssembly.order = orders[i]!));
    this.selOrderButtons = order.buttons;
    const sort = this.segToggle(left, t1 + 78, "сорт:", ["—", "номинал", "масть"], overrideIdx(this.selAssembly.sortOverride), (i) => (this.selAssembly.sortOverride = overrides[i]!));
    this.selSortButtons = sort.buttons;
    // Пресет берёт ВЕСЬ конфиг из ASSEMBLY_PRESETS и пересинхронит черту остальных тумблеров (setMark
    // не дёргает их onPick). Отдельные рычаги после этого дают гибрид, но selPresetName не сбрасывают.
    const presetToggle = this.segToggle(left, t1 + 104, "пресет:", ["рука", "первая", "лоток", "ряд↑"], Math.max(0, presets.indexOf(this.selPresetName)), (i) => {
      const name = presets[i]!;
      this.selPresetName = name;
      this.selAssembly = { ...ASSEMBLY_PRESETS[name]! };
      form.setMark(formIdx(this.selAssembly.form));
      order.setMark(orderIdx(this.selAssembly.order));
      sort.setMark(overrideIdx(this.selAssembly.sortOverride));
    });
    this.selPresetButtons = presetToggle.buttons;

    // Отбор-визуал (issue #60, SELECTION-DESIGN §4.A) — три ортогональных рычага-ДАННЫХ рядом со сборкой.
    const eligibleNames: EligibleName[] = ["cards", "diamonds", "any"];
    const eligible = this.segToggle(left, t1 + 130, "выбор:", ["карты", "буби", "любые"], Math.max(0, eligibleNames.indexOf(this.selEligibleName)), (i) => {
      this.selEligibleName = eligibleNames[i]!;
      this.selVisual.eligible = ELIGIBLE[this.selEligibleName]!;
      this.refreshSel(); // пересчитать подсказку/убрать контуры того, что стало неподходящим (набор сам не трогаем)
      this.wake();
    });
    this.selEligibleButtons = eligible.buttons;
    const hint = this.segToggle(left, t1 + 156, "подсказка:", ["выкл", "вкл"], this.selVisual.hintEligible ? 1 : 0, (i) => {
      this.selVisual.hintEligible = i === 1;
      this.refreshSel();
      this.wake();
    });
    this.selHintButtons = hint.buttons;
    const marks: Mark[] = ["lift", "outline", "both"];
    const mark = this.segToggle(left, t1 + 182, "метка:", ["подъём", "контур", "оба"], Math.max(0, marks.indexOf(this.selVisual.mark)), (i) => {
      this.selVisual.mark = marks[i]!;
      this.refreshSel();
      this.wake();
    });
    this.selMarkButtons = mark.buttons;

    // Дроп набора МИМО зон (issue #61, dropPolicy.ts) — политика как ДАННЫЕ: домой / остаться / распустить.
    const outsides: OnDropOutside[] = ["return-home", "stay", "dissolve"];
    const outsideIdx = Math.max(0, outsides.indexOf(this.selDropOutside));
    const outside = this.segToggle(left, t1 + 208, "мимо зон:", ["домой", "остаться", "распустить"], outsideIdx, (i) => {
      this.selDropOutside = outsides[i]!;
    });
    this.selDropOutsideButtons = outside.buttons;
    return t1 + 234;
  }

  // ——— изолированный мультиселект (selection.ts) ———
  private toggleSelectMode(): void {
    if (!this.multiSelectOn) return; // конфиг контейнера отключил мультиселект
    this.selMode = !this.selMode;
    this.sel = this.selMode ? begin("sel") : clearSel();
    this.syncSelButtons();
    this.refreshSel();
    this.wake();
  }

  private clearSelection(): void {
    if (this.selMode) this.sel = begin("sel"); // остаёмся в режиме, гасим набор
    this.refreshSel();
    this.wake();
  }

  // Кнопки режима следуют за selMode: «выделение» подсвечена, пока режим включён (иначе кликнул —
  // а она серая, непонятно включилось ли, issue #48 баг №1); «снять» вообще не показываем вне
  // режима — гасить нечего, а зависшая кнопка читается как «застряла» (баг №6).
  private syncSelButtons(): void {
    const bMode = this.selButtons.find((b) => b.label === "выделение")?.btn;
    const bClear = this.selButtons.find((b) => b.label === "снять")?.btn;
    bMode?.setActive(this.selMode);
    if (bClear) bClear.root.visible = this.selMode;
  }

  // Экранная точка кнопки выделения по подписи (для e2e-хука selectionState) — null, если кнопки нет
  // или она сейчас невидима (visible=false «снятой» вне режима).
  private selBtnScreen(label: string, toScreen: (x: number, y: number) => { x: number; y: number }, visible: boolean): { x: number; y: number } | null {
    const btn = this.selButtons.find((b) => b.label === label)?.btn;
    return btn && visible ? toScreen(btn.x, btn.y) : null;
  }

  // Взвести таймер удержания по фигуре демо-зоны. sx/sy — экранная точка захвата (порог сдвига).
  private armLongPress(id: string, sp: { x: number; y: number }): void {
    this.cancelLongPress();
    this.longPress = { id, sx: sp.x, sy: sp.y, timer: setTimeout(() => this.fireLongPress(), 500) };
  }

  private cancelLongPress(): void {
    if (!this.longPress) return;
    clearTimeout(this.longPress.timer);
    this.longPress = null;
  }

  // Удержание доиграло: обрываем начатый было драг (фигура едет домой), входим в режим и берём фигуру.
  private fireLongPress(): void {
    const lp = this.longPress;
    if (!lp || this.selMode) return this.cancelLongPress();
    this.longPress = null;
    this.drag?.release();
    this.drag = null;
    this.input.reset(); // палец ещё на экране, но жест уже «съеден» удержанием — не даём ему стать драгом
    this.toggleSelectMode();
    this.toggleSelectFigure(lp.id);
  }

  // Тап по фигуре демо-зоны в режиме → тоггл. owner="sel" всегда совпадает со scope (изоляция:
  // сюда доходят ТОЛЬКО фигуры selZone, чужие зоны остаются драгабельными и не выделяются).
  private toggleSelectFigure(id: string): void {
    // Отбор ограничен eligible (issue #60): невыбранную-НЕподходящую в набор не берём — «стоп»-кивок,
    // как у недвигаемой карты. Снятие уже выбранной не ограничиваем (иначе набор было бы не разобрать).
    if (!hasSel(this.sel, id) && !this.canSelectId(id)) {
      const el = this.byId.get(id);
      if (el) asDraggable(el)?.blockNudge();
      this.wake();
      return;
    }
    this.sel = toggle(this.sel, id, "sel");
    this.refreshSel();
    this.wake();
  }

  // Подходит ли фигура под текущий eligible-предикат (по её тегам). Чужая/отсутствующая → нет.
  private canSelectId(id: string): boolean {
    const el = this.byId.get(id);
    return !!el && canSelect(el.tags, this.selVisual.eligible);
  }

  // Собрать текущий набор по конфигу selAssembly (issue #56): упорядочить (order+override) и разложить
  // по форме. press = позиция в sel.ids (порядок нажатия), x/y — позиция фигуры на столе (для proximity),
  // face — лицо (для override rank/suit). orderedIds и offsets выровнены индекс-в-индекс (см. assemble).
  private assembleSelection(): { orderedIds: string[]; offsets: { id: string; dx: number; dy: number }[] } {
    const items: CollectItem[] = this.sel.ids.map((id, press) => {
      const el = this.byId.get(id);
      return { id, press, x: el?.body.px ?? 0, y: el?.body.py ?? 0, face: this.faceOf.get(id) ?? "" };
    });
    return assemble(items, this.selAssembly, this.cardW);
  }

  // Подсветка: выделенные — приподняты (floating), остальные — на столе. setState меняет УРОВЕНЬ
  // тени (levelOf → слой shadows.<level>), поэтому спрайт обязан переехать в ПАРНЫЙ слой того же
  // уровня (placeCard) — иначе тень floating уедет выше спрайта, застрявшего в idle (issue #55).
  private refreshSel(): void {
    if (!this.selZone) return;
    const lift = shouldLift(this.selVisual.mark); // поднимать ли выбранное во floating
    const outline = shouldOutline(this.selVisual.mark); // рисовать ли контур у выбранного
    const hintOn = this.selVisual.hintEligible && this.sel.ids.length > 0; // подсветка выбираемых — только когда в наборе ≥1
    for (const key of Object.keys(this.selZone.board.slots)) {
      for (const id of this.selZone.board.slots[key]!.members) {
        const el = this.byId.get(id);
        if (!el) continue;
        const selected = hasSel(this.sel, id);
        // Подъём — только если метка его разрешает (mark=outline держит карту на столе).
        el.setState(selected && lift ? "floating" : "idle");
        this.placeCard(el); // держим спрайт и его тень в одном уровне
        // Контур: у выбранного при mark∈{outline,both}; иначе — подсказка выбираемым-невыбранным; иначе снять.
        const kind = selected && outline ? "select" : hintOn && !selected && this.canSelectId(id) ? "hint" : "none";
        this.setSelOutline(el, kind);
      }
    }
  }

  // Держать контур-атом (selectOutline.ts) в актуальном виде: создать на выбор/подсказку, снять иначе,
  // пересоздать при смене вида (select↔hint отличаются толщиной/прозрачностью). Атом — child root карты,
  // поэтому едет и масштабируется с ней сам, пер-кадровая синхронизация не нужна.
  private setSelOutline(el: Elem, kind: "select" | "hint" | "none"): void {
    const cur = this.selOutlines.get(el.id);
    if (kind === "none") {
      if (cur) {
        cur.g.destroy();
        this.selOutlines.delete(el.id);
      }
      return;
    }
    if (cur && cur.kind === kind) return; // тот же вид — ничего не пересобираем
    if (cur) cur.g.destroy();
    const g = makeSelectOutline(kind === "hint" ? { alpha: 0.42, width: 4 } : { width: 6 });
    el.root.addChild(g);
    this.selOutlines.set(el.id, { g, kind });
  }

  // Конфиги custom-бордов (шахматы/смешанный) — ВЫНЕСЕНЫ из build*, чтобы buildBoardZones мог их
  // же смерить (measureBoardConfig) ДО рендера, не задавая геометрию дважды в двух местах.
  private chessBoardConfig(): BoardConfig {
    return {
      title: "шахматы из ФИГУР (Piece, capture)",
      cols: 4,
      rows: 2,
      cell: { w: this.cardW * 1.0, h: this.cardH * 0.92 },
      idPrefix: "chessb",
      onOccupied: "capture",
      slots: {
        "0,0": [{ kind: "chess", glyph: "♞", dark: true }],
        "0,2": [{ kind: "chess", glyph: "♟", dark: false }],
        "1,1": [{ kind: "chess", glyph: "♜", dark: true }],
        "1,3": [{ kind: "chess", glyph: "♙", dark: false }],
      },
      hint: "тащи фигуру на фигуру — съедает (capture)",
    };
  }

  private mixedBoardConfig(): BoardConfig {
    return {
      title: "СМЕШАННЫЙ стек: карта+шахмата+фишка",
      labelText: "смешанный стек: карта + шахмата + фишка (generic)",
      cols: 3,
      rows: 1,
      cell: { w: this.cardW * 1.15, h: this.cardH * 1.05 },
      idPrefix: "mix",
      onOccupied: "merge",
      pieceRatio: 0.3,
      slots: {
        // стопка вперемешку (снизу вверх: карта → шахмата → фишка); z по позиции в стопке
        "0,0": [{ kind: "card", face: "A♠", size: 0.78 }, { kind: "chess", glyph: "♞", dark: true }, { kind: "chip", denom: "5", color: 0xb23b34 }],
        "0,1": [{ kind: "card", face: "K♥", size: 0.78 }],
        "0,2": [{ kind: "chess", glyph: "♟", dark: false }],
      },
      hint: "тащи любую фигуру из смешанной стопки в другой слот",
    };
  }

  // Борд из НЕ-карточных фигур (Piece): шахматы прямо на доске. Доказательство, что слоты держат
  // любые фигуры, не только карты — весь драг/переезд/capture работает без правок «для фигур».
  private buildChessBoard(left: number, top: number): number {
    const { bottom } = this.mountBoard(this.chessBoardConfig(), left, top, 480);
    return bottom + 26;
  }

  // СМЕШАННЫЙ борд: в одном слоте стопка из РАЗНЫХ типов (карта + шахмата + фишка). Финальное
  // доказательство генерика — контейнер держит что угодно вперемешку; z по позиции в стопке.
  private buildMixedBoard(left: number, top: number): number {
    const { bottom } = this.mountBoard(this.mixedBoardConfig(), left, top, 500);
    return bottom + 22;
  }

  // Зона, которой принадлежит фигура (или null).
  private boardZoneOf(id: string): BoardZone | null {
    for (const z of this.boardZones) if (z.locate(id)) return z;
    return null;
  }

  // Увести вытесненные (capture) фигуры с борда — сжечь (как «ушли из игры»). Карта ИЛИ фигура.
  private exileFigures(ids: string[]): void {
    for (const id of ids) {
      const el = this.byId.get(id);
      if (el && "burn" in el) (el as { burn(): void }).burn();
    }
  }

  // Задать home фигуре борда — среди карт ИЛИ не-карточных фигур (обобщено под Piece-борды).
  private setFigureHome(id: string, home: { x: number; y: number }): void {
    const c = this.cards.find((p) => p.card.id === id);
    if (c) {
      c.home = home;
      return;
    }
    const p = this.pieces.find((q) => q.el.id === id);
    if (p) p.home = home;
  }

  // Глубина хранится и в Pixi zIndex, и в трекинге (this.cards/this.pieces) — releaseElement/
  // homeOf читают ИМЕННО трекинг, так что менять надо оба, иначе следующий release откатит zIndex
  // назад к спавн-глубине (это и было причиной z-order бага на бордах после merge/swap/capture).
  private setFigureDepth(id: string, depth: number): void {
    const c = this.cards.find((p) => p.card.id === id);
    if (c) {
      c.depth = depth;
      c.card.root.zIndex = depth;
      return;
    }
    const p = this.pieces.find((q) => q.el.id === id);
    if (p) {
      p.depth = depth;
      p.el.root.zIndex = depth;
    }
  }

  // Пересчитать home всех фигур зоны И отправить их туда пружиной (после переезда/свапа/merge
  // стек-смещения меняются). БЕЗ setTarget вытесненная свапом фигура оставалась в целевом слоте —
  // «обе на одном слоте». Перетаскиваемую пропускаем: её домой везёт release.
  // zIndex тоже пересчитываем по позиции в members (как applyStackHomes для стопок) — иначе после
  // merge z остаётся спавн-порядка, и свежая карта визуально прячется под старыми на своём слоте.
  private refreshZoneHomes(zone: BoardZone): void {
    const dragged = this.drag?.lead.id;
    const keys = Object.keys(zone.board.slots);
    const zs = keys.flatMap((k) => zone.board.slots[k]!.members.map((id) => this.byId.get(id)?.root.zIndex)).filter((z): z is number => z !== undefined);
    const base = zs.length ? Math.min(...zs) : 0;
    let i = 0;
    for (const key of keys) {
      for (const id of zone.board.slots[key]!.members) {
        const home = zone.figureHome(id);
        this.setFigureHome(id, home);
        this.setFigureDepth(id, base + i++);
        const el = this.byId.get(id);
        if (id !== dragged) el?.body.setTarget({ x: home.x, y: home.y, rot: 0 });
      }
    }
    this.wake();
  }

  // Витрина кнопок: варианты, размеры, состояние «недоступна» — рядами с подписями.
  private buildButtons(left: number, top: number): number {
    return this.sectionFrame(left, top, "Кнопки", (contentLeft, contentTop) => {
      let y = contentTop;
      let width = 0;
      const row = (items: Array<{ opts: ButtonOptions; cap: string }>) => {
        const r = this.buttonRow(contentLeft, y, items);
        y = r.bottom;
        width = Math.max(width, r.width);
      };
      row([
        { opts: { label: "Основная", variant: "primary" }, cap: "primary" },
        { opts: { label: "Вторичная", variant: "secondary" }, cap: "secondary" },
        { opts: { label: "Опасно", variant: "danger" }, cap: "danger" },
        { opts: { label: "Призрак", variant: "ghost" }, cap: "ghost" },
      ]);
      row([
        { opts: { label: "Мелкая", size: "sm" }, cap: "sm" },
        { opts: { label: "Средняя", size: "md" }, cap: "md" },
        { opts: { label: "Крупная", size: "lg" }, cap: "lg" },
      ]);
      row([{ opts: { label: "Недоступна", disabled: true }, cap: "disabled" }]);
      return { bottom: y, width };
    });
  }

  private buttonRow(left: number, y: number, items: Array<{ opts: ButtonOptions; cap: string }>): { bottom: number; width: number } {
    const gap = 26;
    const made = items.map((it) => ({ b: new Button(it.opts), cap: it.cap }));
    const rowH = Math.max(...made.map((m) => m.b.h));
    let x = left;
    for (const { b, cap } of made) {
      const cx = x + b.w / 2;
      b.place(cx, y + rowH / 2);
      this.scene.surface.addChild(b.root);
      this.buttons.push(b);
      this.buttonShowcase.push({ cap, b });
      this.scene.surface.addChild(this.label(cap, cx, y + rowH + 8, 13, 0x9aa89f));
      x += b.w + gap;
    }
    return { bottom: y + rowH + 42, width: x - left - gap };
  }

  // «Дроп-индикатор»: 5 вариантов ОФОРМЛЕНИЯ подписи над бордом при наведении — юзер-тест перед
  // выбором финального (прямой запрос владельца). REST — подпись лежит НИЖЕ карт борда, как
  // сегодня (скрыта, z surface < idle) — baseline проблемы. ACTIVE переносит подпись на
  // scene.verb — тот же слой, что уже несёт «глагол» DropZone (глагол дропзоны/наведение).
  //
  // Отклонение от тикета (по прямому решению владельца, 2026-07-28): тикет просил драг-карту
  // (rest: "held" → drag-слой, самый верхний) поверх подписи ВО ВСЕХ пяти, смещённую на +20px.
  // Но rest:"held" рисуется в DRAG_SCALE (×1.45, см. constants.ts) — при 20px карта того же
  // плана целиком накрывает и борд, и подпись (ничего не видно, буквально проверено скриншотом),
  // а с исправленным сдвигом (половина ширины ячейки) карта перекрывала ПОЧТИ ВСЮ подпись во всех
  // пяти и мешала СРАВНИВАТЬ стили между собой — то, ради чего секция и существует. Поэтому драг-
  // карта осталась только в ОДНОМ, последнем (6-м) слоте — «живой» сценарий «как это реально
  // выглядит при наведении», стиль — победитель первых пяти (HUD-тег); в первых пяти подпись
  // читается целиком, ничем не занавешенная. Все карты секции (борд + драг-карта 6-го слота) —
  // драгабл (демо ощущается живее) и ничем не зажаты: эти «борды» — декоративная рамка
  // cellFrame, не BoardZone, границ и не было. Отпущенная карта едет домой пружиной, как любой
  // безхозный элемент (drag.release()), кроме случая, когда её унесли в «СЖЕЧЬ» — как и остальные
  // карты песочницы.
  private buildDropIndicatorDemo(left: number, top: number): { bottom: number; width: number } {
    const cell = { w: this.cardW, h: this.cardH };
    const dragOffsetX = cell.w * 0.5;
    const text = "переместить сюда";
    let depth = 0;

    const cellFrame = (x: number, y: number): void => {
      const g = new Graphics();
      g.roundRect(x, y, cell.w, cell.h, 8).fill({ color: 0x000000, alpha: 0.12 }).stroke({ width: 1, color: 0x4a5b50 });
      this.scene.surface.addChild(g);
    };
    const boardCard = (id: string, x: number, y: number): void => {
      this.cardSpecs.push({ opts: { id, card: "5♠", rest: "idle" }, home: { x: x + cell.w / 2, y: y + cell.h / 2 }, depth: depth++, bobPhase: 0 });
    };
    const dragCard = (id: string, x: number, y: number): void => {
      this.cardSpecs.push({ opts: { id, card: "K♥", rest: "held" }, home: { x: x + cell.w / 2 + dragOffsetX, y: y + cell.h / 2 }, depth: depth++, bobPhase: 0 });
    };

    // REST: подпись стоит под картой борда — визуально скрыта, ровно как сегодня.
    cellFrame(left, top);
    boardCard("di-rest", left, top);
    this.scene.surface.addChild(this.label(text, left + cell.w / 2, top + cell.h / 2 - 7, 12, 0xf2c14e, cell.w * 1.4));
    this.scene.surface.addChild(this.label("REST (в покое)", left + cell.w / 2, top + cell.h + 10, 12, 0x9aa89f, cell.w * 1.6));
    const restBottom = top + cell.h + 32;

    // ACTIVE: 5 стилей БЕЗ карты сверху (подпись читается целиком — сравниваем стили между
    // собой), плюс 6-й слот отдельно — единственное место, где реально видно наложение
    // драг-карты на подпись (сценарий «на самом деле так и будет выглядеть при наведении»).
    const variants: { name: string; paint: (cx: number, cy: number) => void }[] = [
      { name: "оригинал: обводка 3px", paint: (cx, cy) => this.paintIndicatorOutline(cx, cy, text, 3) },
      { name: "жёсткая тень", paint: (cx, cy) => this.paintIndicatorHardShadow(cx, cy, text) },
      { name: "badge (подложка)", paint: (cx, cy) => this.paintIndicatorBadge(cx, cy, text, false) },
      { name: "тонкий контур + тень", paint: (cx, cy) => this.paintIndicatorOutline(cx, cy, text, 1.5, true) },
      { name: "HUD-тег", paint: (cx, cy) => this.paintIndicatorBadge(cx, cy, text, true) },
    ];
    // Матрица 3×2 (не wrapRow-лента): 6 ячеек — 5 стилей + «живой» слот, фиксированной сеткой
    // строка/столбец, а не построчным переносом по ширине экрана (прямое решение владельца).
    const GRID_COLS = 3;
    const activeTop = restBottom + 26;
    const plainCellW = cell.w + 16; // запас под подпись, если она чуть шире карты
    const liveCellW = cell.w / 2 + dragOffsetX + (cell.w * DRAG_SCALE) / 2 + 20; // + до правого края увеличенной драг-карты
    const colW = Math.max(plainCellW, liveCellW); // единая ширина колонки — иначе не матрица, а лесенка
    const rowH = cell.h + 40;

    variants.forEach((v, i) => {
      const row = Math.floor(i / GRID_COLS);
      const col = i % GRID_COLS;
      const x = left + col * (colW + SB_ITEM_GAP);
      const y = activeTop + row * (rowH + SB_ITEM_GAP);
      cellFrame(x, y);
      boardCard(`di-active-${i}`, x, y);
      v.paint(x + cell.w / 2, y + cell.h / 2);
      this.scene.surface.addChild(this.label(v.name, x + cell.w / 2, y + cell.h + 10, 12, 0x9aa89f, plainCellW * 0.95));
    });
    // 6-я ячейка (row1, col2) — «живой» слот: стиль HUD-тега под настоящей драг-картой.
    {
      const i = variants.length; // индекс 5 → row1,col2
      const row = Math.floor(i / GRID_COLS);
      const col = i % GRID_COLS;
      const x = left + col * (colW + SB_ITEM_GAP);
      const y = activeTop + row * (rowH + SB_ITEM_GAP);
      cellFrame(x, y);
      boardCard("di-live-board", x, y);
      this.paintIndicatorBadge(x + cell.w / 2, y + cell.h / 2, text, true);
      dragCard("di-live-drag", x, y);
      this.scene.surface.addChild(this.label("HUD-тег + наведение (реальный сценарий)", x + cell.w / 2, y + cell.h + 10, 12, 0x9aa89f, liveCellW * 0.95));
    }

    const rows = Math.ceil((variants.length + 1) / GRID_COLS);
    const width = GRID_COLS * colW + (GRID_COLS - 1) * SB_ITEM_GAP;
    const bottom = activeTop + rows * rowH + (rows - 1) * SB_ITEM_GAP;
    return { bottom: bottom + 20, width: Math.max(cell.w, width) };
  }

  // Толстая/тонкая обводка вокруг текста, опционально + мягкая тень (blur). fill — золото, как у
  // существующего DropZone.verb — та же семья «глагол над картами».
  private paintIndicatorOutline(cx: number, cy: number, text: string, strokeWidth: number, softShadow = false): void {
    const t = new Text({
      text,
      style: {
        fontFamily: PIXEL_FONT,
        fontSize: 12,
        fill: 0xf2c14e,
        align: "center",
        stroke: { color: 0x000000, width: strokeWidth },
        ...(softShadow ? { dropShadow: { color: 0x000000, alpha: 0.5, blur: 3, distance: 1, angle: Math.PI / 4 } } : {}),
      },
    });
    t.anchor.set(0.5);
    t.position.set(cx, cy);
    this.scene.verb.addChild(t);
  }

  // ЖЁСТКАЯ тень: сплошной чёрный дубль текста со смещением (-2/+2), без blur — не путать с
  // мягким Pixi dropShadow (тот вариант — paintIndicatorOutline(softShadow=true)).
  private paintIndicatorHardShadow(cx: number, cy: number, text: string): void {
    const shadow = new Text({ text, style: { fontFamily: PIXEL_FONT, fontSize: 12, fill: 0x000000, align: "center" } });
    shadow.anchor.set(0.5);
    shadow.position.set(cx - 2, cy + 2);
    const main = new Text({ text, style: { fontFamily: PIXEL_FONT, fontSize: 12, fill: 0xf2c14e, align: "center" } });
    main.anchor.set(0.5);
    main.position.set(cx, cy);
    this.scene.verb.addChild(shadow, main);
  }

  // Подложка под текстом: badge — нейтральная полупрозрачная плашка; hud — та же плашка с
  // акцентной рамкой и золотым текстом (игровой «шильдик»).
  private paintIndicatorBadge(cx: number, cy: number, text: string, hud: boolean): void {
    const t = new Text({ text, style: { fontFamily: PIXEL_FONT, fontSize: 12, fill: hud ? 0xf2c14e : 0xe8e8e8, align: "center" } });
    t.anchor.set(0.5);
    t.position.set(cx, cy);
    const pad = 6;
    const bg = new Graphics();
    bg.roundRect(cx - t.width / 2 - pad, cy - t.height / 2 - pad / 2, t.width + pad * 2, t.height + pad, 6).fill({ color: 0x1c2620, alpha: hud ? 0.85 : 0.55 });
    if (hud) bg.stroke({ width: 2, color: 0xf2c14e });
    this.scene.verb.addChild(bg, t);
  }

  // ——— вьюпорт ———

  // Синхронизировать границы камеры перед операцией (экран/контент меняются в mount/buildContent).
  private syncVp(): void {
    this.viewport.setScreen(this.W, this.H);
    this.viewport.setContent(this.contentW, this.contentH);
  }

  private screenToContent(sx: number, sy: number): { x: number; y: number } {
    return this.viewport.screenToContent(sx, sy);
  }

  private clampView(): void {
    this.syncVp();
    this.viewport.clamp();
  }

  private applyView(): void {
    this.content.position.set(this.viewport.x, this.viewport.y);
    this.content.scale.set(this.viewport.zoom);
  }

  private zoomAround(sx: number, sy: number, factor: number): void {
    this.syncVp();
    this.viewport.zoomAround(sx, sy, factor);
    this.applyView();
    this.wake();
    this.emitView();
  }

  // Зум колесом — ТОЛЬКО с модификатором (кроссплатформенно): Ctrl на Windows/Linux/Mac или
  // Cmd на Mac. Пинч тачпада браузер шлёт как колесо с ctrlKey — тоже зум. Без модификатора
  // любое колесо/скролл (мышь и тачпад) — это ПАН. Shift не берём: в браузерах это гориз.скролл.
  private wheelIsZoom(e: WheelEvent): boolean {
    return e.ctrlKey || e.metaKey;
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    // deltaY в пиксели: в строчном/страничном режиме домножаем.
    const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * this.H : e.deltaY;
    if (this.wheelIsZoom(e)) {
      const rect = this.app!.canvas.getBoundingClientRect();
      this.zoomAround(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-dy * ZOOM_SENS));
    } else {
      // Тачпад: двумя пальцами тащим канвас (пан), а не зумим.
      this.syncVp();
      this.viewport.panBy(-e.deltaX, -dy);
      this.applyView();
      this.wake();
      this.emitView();
    }
  };

  setOnView(cb: ((v: ViewState) => void) | null): void {
    this.onView = cb;
    this.emitView();
  }

  private emitView(): void {
    this.onView?.(this.viewState());
  }

  private viewState(): ViewState {
    this.syncVp();
    return this.viewport.state();
  }

  setZoom(z: number): void {
    this.syncVp();
    this.viewport.setZoom(z);
    this.applyView();
    this.wake();
    this.emitView();
  }

  setScrollX(fraction: number): void {
    this.syncVp();
    this.viewport.setScrollX(fraction);
    this.applyView();
    this.wake();
    this.emitView();
  }

  setScrollY(fraction: number): void {
    this.syncVp();
    this.viewport.setScrollY(fraction);
    this.applyView();
    this.wake();
    this.emitView();
  }

  // ——— ввод ———

  // Все перетаскиваемые элементы (карты + фишки/фигуры) — единый хит-тест/список.
  private draggables(): Elem[] {
    const out: Elem[] = this.cards.map((p) => p.card);
    for (const p of this.pieces) out.push(p.el);
    return out;
  }

  private hitElement(cx: number, cy: number): Elem | null {
    // Бокс по ВИДИМОМУ размеру (scaleVal), не раздутый DRAG_SCALE; из накрывших побеждает ВЕРХНЯЯ
    // по z. Футпринт берём из самого элемента — карта/фишка/фигура одинаково (см. Elem.footprint).
    const els = this.draggables();
    const boxes: HitBox[] = els.map((el) => {
      const s = el.body.scaleVal;
      const f = el.footprint;
      return { px: el.body.px, py: el.body.py, hw: f.hw * s, hh: f.hh * s, z: el.root.zIndex };
    });
    const i = topmostAt(boxes, cx, cy);
    return i >= 0 ? els[i]! : null;
  }

  private hitButton(cx: number, cy: number): Button | null {
    for (const b of this.buttons) if (b.hitTest(cx, cy)) return b;
    return null;
  }

  // Ввод: стейт-машину ведёт InputRouter, движок лишь форвардит события и отдаёт домен в колбэки.
  private onDown = (e: { global: { x: number; y: number }; pointerId: number }): void => {
    this.viewport.stopFling(); // касание гасит инерцию
    this.input.down(e.pointerId, e.global.x, e.global.y);
  };
  private onMove = (e: { global: { x: number; y: number }; pointerId: number }): void =>
    this.input.move(e.pointerId, e.global.x, e.global.y);
  private onUp = (e: { global: { x: number; y: number }; pointerId: number }): void =>
    this.input.up(e.pointerId, e.global.x, e.global.y);

  // Хит-тесты и реакции на жесты (домен). Стейт-машина — в InputRouter.
  private inputHandlers(): InputHandlers<Elem, Button> {
    return {
      screenToContent: (sx, sy) => this.screenToContent(sx, sy),
      // Захват: сперва любая метка-драггер (стопки ИЛИ соло — единый список grabbers) → тянем её
      // цель через host; иначе элемент под пальцем (а в режиме «всю стопку» — карта стопки цепляет
      // драггер стопки). host+метка передаются из pickCard в onCardGrab через pendingHost/grabbedMarker.
      pickCard: (cx, cy) => {
        const g = this.grabbers.find((gr) => gr.marker.interactive && gr.marker.hitTest(cx, cy));
        if (g) {
          this.pendingHost = g.host;
          this.grabbedMarker = g.marker;
          return g.lead(); // лид: верхняя карта стопки / сам соло-элемент
        }
        const el = this.hitElement(cx, cy);
        if (el && this.stackMode === "whole") {
          const owner = this.stacks.find((s) => el.id !== "" && s.stack.owns(el.id));
          if (owner) {
            this.pendingHost = owner.host;
            this.grabbedMarker = owner.dragger;
          }
        }
        return el;
      },
      // В режиме выделения: ВЫДЕЛЕННУЮ фигуру демо-зоны можно тащить (тянется весь набор),
      // НЕвыделенную — нет (тап тогглит выбор через onCardBlocked). Вне режима — обычная драгабельность.
      cardDraggable: (c) => (this.selMode && this.selZone?.locate(c.id) ? hasSel(this.sel, c.id) : c.draggable),
      pickButton: (cx, cy) => this.hitButton(cx, cy),
      buttonContains: (b, cx, cy) => b.hitTest(cx, cy),
      onCardGrab: (card, cp, sp) => {
        this.dragScreen = { x: sp.x, y: sp.y };
        // Перехват «поглядеть» повторным драгом: НЕ абортим мгновенно. Помечаем grabbed и гасим
        // peekBob (под пальцем карта явно не «зависла» — резонанс-парение ни к чему); скрытность НЕ
        // трогаем — она вернётся по КОНЦУ драга (onCardDrop/Cancel) или по истечении PEEK_DUR, что
        // раньше. Так «показанную» карту можно утащить и она вернётся в исходный вид сама.
        const pk = this.peeking.get(card.id);
        if (pk) {
          pk.grabbed = true;
          if ("peekBob" in pk.el) pk.el.peekBob = false; // гасим резонанс-парение под пальцем (peekBob есть только у Card)
        }
        // Взвод long-press: фигуру демо-зоны держат вне режима → через 500мс без сдвига входим в
        // выделение и берём её (issue #48 баг №3). Обычный драг продолжается параллельно; если палец
        // поехал (onCardMove) или отпущен раньше (onCardDrop) — взвод снимается, драг остаётся драгом.
        if (!this.selMode && this.multiSelectOn && this.selZone?.locate(card.id)) this.armLongPress(card.id, sp);
        // Драг выделенного НАБОРА: собираем по конфигу selAssembly (порядок + форма) сразу при старте
        // (issue #56) — не «врассыпную». Порядок решён здесь и запомнен в selDragging, дроп берёт его
        // как есть (см. onCardDrop). GroupDrag ждёт cards и offsets выровненными индекс-в-индекс к orderedIds.
        if (this.selMode && this.selZone && hasSel(this.sel, card.id)) {
          const { orderedIds, offsets } = this.assembleSelection();
          const cards: Elem[] = [];
          const off: { dx: number; dy: number }[] = [];
          orderedIds.forEach((id, i) => {
            const el = this.byId.get(id);
            if (el) {
              cards.push(el);
              off.push({ dx: offsets[i]!.dx, dy: offsets[i]!.dy }); // индекс-в-индекс: пропускаем оба, если элемента нет
            }
          });
          this.selDragging = cards.map((e) => e.id);
          this.selGrabCp = { x: cp.x, y: cp.y };
          this.drag = new GroupDrag(cards, off, this.dragCtx);
          this.drag.move(cp);
          return;
        }
        const payload = this.pendingHost?.makePayload?.(cp) ?? null; // груз всей пачки (или null)
        this.pendingHost = null;
        if (payload) {
          this.drag = payload;
          this.grabbedMarker?.beginFollow(); // грип едет за пальцем поверх пачки
        } else {
          this.grabbedMarker = null;
          this.drag = new SingleDrag(card, this.dragCtx, cp);
        }
        this.drag.move(cp);
        this.fieldForCard(card.id)?.beginDrag(); // карта Поля — грид показывает дропзону + «наведи»
      },
      onCardMove: (_card, cp, sp) => {
        this.dragScreen = { x: sp.x, y: sp.y };
        // Палец поехал (>10 экранных px) — это драг, а не удержание: снимаем взвод long-press.
        if (this.longPress && Math.hypot(sp.x - this.longPress.sx, sp.y - this.longPress.sy) > 10) this.cancelLongPress();
        // Фигура БОРДА заперта в рамке зоны (clamp). Фигура Поля — не в boardZones → не клампится.
        const bz = this.drag ? this.boardZoneOf(this.drag.lead.id) : null;
        const p = bz ? bz.clamp(cp, { w: this.cardW / 2, h: this.cardH / 2 }) : cp;
        this.drag?.move(p);
        this.grabbedMarker?.followTo(p);
        if (this.drag) {
          // грид: над ним → «брось» + фон + ДЫРА под падающую; при смене индекса раздвигаем карты.
          const fld = this.fieldForCard(this.drag.lead.id);
          if (fld) {
            if (fld.hover(p, this.drag.lead.id)) {
              this.applyFieldHomes(fld, this.drag.lead.id);
              this.wake();
            }
          } else if (!(this.drag instanceof GroupDrag)) {
            // одиночная карта стопки → над своей стопкой карты РАСТУПАЮТСЯ под падающую.
            const stk = this.stackForCard(this.drag.lead.id);
            if (stk?.stack.hover(p, this.drag.lead.id)) {
              this.applyStackHomes(stk, this.drag.lead.id);
              this.wake();
            }
          }
        }
        // подсветка зоны под грузом — ТОЛЬКО если груз реально способен на её действие (иначе зона
        // «обещает» глаголом то, что после дропа не сделает, см. registerZone).
        for (const z of this.zones) {
          const eligible = this.drag !== null && z.accepts(this.drag);
          z.zone.setHot(eligible && z.zone.contains(p.x, p.y), eligible && z.textFor ? z.textFor(this.drag!).hot : undefined);
        }
      },
      onCardDrop: (card, cp) => {
        this.cancelLongPress(); // отпустили раньше 500мс — это обычный тап/драг, не удержание
        if (this.drag) {
          this.resolveGrabbedPeeks(); // держали «показанную» карту → вернуть скрытость до диспатча дропа
          if (this.selDragging && this.selZone) {
            const dragged = Math.hypot(cp.x - this.selGrabCp.x, cp.y - this.selGrabCp.y) > 8; // тап vs драг
            if (dragged) {
              // Набор в целевой слот в УЖЕ решённом на грабе порядке (selDragging, issue #56). Дроп
              // В ЗОНУ (moved) гасит выбор и остаётся как был. Дроп МИМО зон — по политике selDropOutside
              // (issue #61, dropPolicy.ts): домой (вернуть на исходные места), остаться (осадить там, где
              // отпущено, набор сохранить) или распустить (осадить там же И снять выделение).
              const { moved } = this.selZone.dropSetAt(this.selDragging, cp.x, cp.y);
              if (moved) {
                this.refreshZoneHomes(this.selZone);
                this.drag.release();
                this.sel = begin("sel"); // очистить набор, остаться в режиме
              } else if (returnsHome(this.selDropOutside)) {
                this.refreshZoneHomes(this.selZone);
                this.drag.release(); // домой — прежнее поведение
              } else {
                // остаться / распустить — осадить набор на текущих (перетащенных) местах, не домой.
                for (const id of this.selDragging) {
                  const el = this.byId.get(id);
                  if (el) this.restElementInPlace(el);
                }
                if (clearsSet(this.selDropOutside)) this.sel = begin("sel"); // распустить — снять выделение
                this.wake();
              }
            } else {
              this.drag.release(); // тап по выделенной — снять её из набора
              this.toggleSelectFigure(card.id);
            }
            this.refreshSel();
            this.selDragging = null;
            this.drag = null;
            for (const z of this.zones) z.zone.setHot(false);
            return;
          }
          const fld = this.fieldForCard(this.drag.lead.id);
          const bz = fld ? null : this.boardZoneOf(this.drag.lead.id);
          if (fld) {
            // ПОЛЕ: делегируем модулю (стопка→грид → раскрыть; в гриде + реордер → переставить; мимо → назад).
            const { flip } = fld.place(this.drag.lead.id, cp);
            if (flip) {
              const el = this.byId.get(this.drag.lead.id);
              if (el && "requestFlip" in el) (el as { requestFlip(): boolean }).requestFlip(); // раскрыть в гриде
            }
            fld.endDrag(); // СНАЧАЛА закрыть дыру (иначе дома лягут в раздвинутые позиции)
            this.applyFieldHomes(fld);
            this.drag.release(); // тащимая едет в свой (возможно новый) home
          } else if (bz) {
            // Борд: резолвим целевой слот, исход по onOccupied; вытесненных (capture) уводим.
            const res = bz.dropAt(this.drag.lead.id, cp.x, cp.y);
            if (res.captured) this.exileFigures(res.captured);
            this.refreshZoneHomes(bz);
            this.drag.release(); // летит в (возможно новый) home
          } else {
            // Стопка: ОДИНОЧНый драг, упавший НА свою стопку → реордер по позиции. Пачка (GroupDrag)
            // и дропы мимо стопки — не реордер, идут дальше в зоны (переворот/сжечь/вернуть домой).
            const stk = this.drag instanceof GroupDrag ? null : this.stackForCard(this.drag.lead.id);
            stk?.stack.clearGap(); // закрыть дыру перед применением домов
            if (stk && stk.stack.place(this.drag.lead.id, cp).moved) {
              this.applyStackHomes(stk);
              this.drag.release();
            } else {
              const zone = this.zones.find((z) => z.zone.contains(cp.x, cp.y));
              zone?.onDrop(this.drag); // зона реагирует на СПОСОБНОСТИ груза (flip/burn), не на тип
              if (!this.drag.consumed) this.drag.release(); // не поглощён (не горит) → вернуть на место
              if (stk) this.applyStackHomes(stk); // дыру закрыли — вернуть раздвинутые карты на место
            }
          }
          this.drag = null;
        }
        this.grabbedMarker?.endFollow();
        this.grabbedMarker = null;
        for (const z of this.zones) z.zone.setHot(false);
      },
      onCardCancel: () => {
        this.cancelLongPress(); // драг прерван (второй палец) — взвод удержания снимаем
        if (this.drag) this.resolveGrabbedPeeks(); // отмена драга «показанной» карты — тоже вернуть скрытость
        const fld = this.drag ? this.fieldForCard(this.drag.lead.id) : null;
        if (fld) {
          fld.endDrag(); // закрыть дыру
          this.applyFieldHomes(fld); // и вернуть раздвинутые карты на место
        } else if (this.drag) {
          const stk = this.stackForCard(this.drag.lead.id);
          if (stk) {
            stk.stack.clearGap();
            this.applyStackHomes(stk);
          }
        }
        this.drag?.release();
        this.drag = null;
        this.grabbedMarker?.endFollow();
        this.grabbedMarker = null;
      },
      onCardBlocked: (card) => {
        if (this.selMode && this.selZone?.locate(card.id)) this.toggleSelectFigure(card.id); // тап-выбор
        else card.blockNudge();
      },
      onButtonDown: (b) => b.setPressed(true),
      onButtonMove: (b, inside) => b.setPressed(inside),
      onButtonUp: (b, inside) => {
        if (inside) b.click();
        b.setPressed(false);
      },
      onPanStart: () => {
        this.viewport.stopFling();
        this.panVel = { x: 0, y: 0 };
        this.lastPanT = 0;
      },
      onPan: (dx, dy) => {
        // Копим сглаженную скорость пана (px/сек) для инерции после отпускания.
        const t = performance.now();
        if (this.lastPanT) {
          const dtp = Math.min(0.1, (t - this.lastPanT) / 1000);
          if (dtp > 0) this.panVel = { x: 0.5 * this.panVel.x + 0.5 * (dx / dtp), y: 0.5 * this.panVel.y + 0.5 * (dy / dtp) };
        }
        this.lastPanT = t;
        this.syncVp();
        this.viewport.panBy(dx, dy);
        this.applyView();
        this.emitView();
      },
      onPanEnd: () => {
        this.viewport.startFling(this.panVel.x, this.panVel.y);
        this.wake();
      },
      onPinchStart: (mx, my, dist) => {
        const c = this.screenToContent(mx, my);
        this.pinch = { dist, zoom: this.viewport.zoom, midContentX: c.x, midContentY: c.y };
      },
      onPinch: (mx, my, dist) => {
        this.viewport.zoom = clamp((this.pinch.zoom * dist) / this.pinch.dist, MIN_ZOOM, MAX_ZOOM);
        this.viewport.x = mx - this.pinch.midContentX * this.viewport.zoom;
        this.viewport.y = my - this.pinch.midContentY * this.viewport.zoom;
        this.clampView();
        this.applyView();
        this.emitView();
      },
      onHover: (b) => {
        // Трогаем ТОЛЬКО две сменившиеся кнопки (снятую и наведённую), а не перебираем весь
        // список каждый раз: на ПК с десятками кнопок цикл-по-всем при быстром ховере ронял FPS
        // (issue #48 баг №4). Роутер и так шлёт onHover лишь при смене цели, так что b ≠ hoveredBtn.
        if (b === this.hoveredBtn) return;
        if (this.hoveredBtn) {
          this.hoveredBtn.hover(false);
          this.hoverRerenders++;
        }
        if (b) {
          b.hover(true);
          this.hoverRerenders++;
        }
        this.hoveredBtn = b;
        this.wake();
      },
      afterAny: () => this.wake(),
    };
  }

  // Авто-скролл у кромки: пока держишь элемент (карту) у края экрана, вид панится в ту сторону —
  // скорость растёт с глубиной захода в кромку. Карта остаётся ПОД пальцем (пересчёт по экранной
  // точке при новом виде), так что она «уезжает» на открывшуюся область стола.
  private edgeScroll(dt: number): void {
    if (this.input.gesture !== "drag" || !this.drag) return;
    const margin = Math.max(48, Math.min(this.W, this.H) * 0.12);
    const SPEED = 780; // экранных px/сек на самой кромке
    const { x: sx, y: sy } = this.dragScreen;
    const ramp = (d: number): number => {
      const r = clamp(d / margin, 0, 1);
      return r * r; // мягче у границы зоны, резче у самого края
    };
    let dx = 0;
    let dy = 0;
    if (sx < margin) dx = ramp(margin - sx);
    else if (sx > this.W - margin) dx = -ramp(sx - (this.W - margin));
    if (sy < margin) dy = ramp(margin - sy);
    else if (sy > this.H - margin) dy = -ramp(sy - (this.H - margin));
    if (dx === 0 && dy === 0) return;

    const bx = this.viewport.x;
    const by = this.viewport.y;
    this.viewport.x += dx * SPEED * dt;
    this.viewport.y += dy * SPEED * dt;
    this.clampView();
    if (this.viewport.x === bx && this.viewport.y === by) return; // упёрлись в край — двигать нечего
    this.applyView();
    const p = this.screenToContent(sx, sy);
    this.drag.move(p); // груз (карта/пачка) остаётся под пальцем на открывшейся области
    for (const z of this.zones) {
      const eligible = z.accepts(this.drag);
      z.zone.setHot(eligible && z.zone.contains(p.x, p.y), eligible && z.textFor ? z.textFor(this.drag).hot : undefined);
    }
    this.emitView();
  }

  // Сдвиги пачки относительно пальца: «в руку» — тесная центрированная стопка (номинал задних
  // скрыт, ширина видна); «врассыпную» — сохранить исходную форму стопки.
  private wholeOffsets(cards: Elem[], cp: { x: number; y: number }): Array<{ dx: number; dy: number }> {
    if (this.dragSqueeze) return squeezeOffsets(cards.length, this.cardW, this.cardH);
    return cards.map((c) => ({ dx: c.body.px - cp.x, dy: c.body.py - cp.y }));
  }

  // Перевернуть пачку ЦЕЛИКОМ: карта i уезжает в зеркальный слот (n-1-i), z реверсится, и каждая
  // делает СИНХРОННЫЙ флип (requestFlip разом) — пачка переворачивается как одна плоскость вокруг
  // центральной карты (её слот=центр не меняется). Лицо↔рубашка меняет сам flip. В новые слоты
  // карты уезжают через release (вызывается после в onCardDrop). Порядок ids тоже реверсим.
  private flipGroup(els: readonly TableElement[]): void {
    const n = els.length;
    const placeds = els.map((el) => this.cards.find((c) => c.card === el)).filter((p): p is Placed => !!p);
    if (placeds.length !== n) return;
    const homes = placeds.map((p) => ({ ...p.home }));
    const depths = placeds.map((p) => p.depth);
    placeds.forEach((p, i) => {
      const j = n - 1 - i;
      p.home = homes[j]!;
      p.depth = depths[j]!;
      p.card.root.zIndex = depths[j]!;
      p.card.requestFlip();
    });
    const st = this.stacks.find((s) => els.every((el) => s.stack.owns(el.id)));
    st?.stack.reverse();
    this.wake();
  }

  // Дом элемента (позиция покоя + глубина) — среди карт или фишек/фигур.
  private homeOf(el: Elem): { home: { x: number; y: number }; depth: number } | null {
    const c = this.cards.find((p) => p.card === el);
    if (c) return { home: c.home, depth: c.depth };
    const p = this.pieces.find((q) => q.el === el);
    return p ? { home: p.home, depth: p.depth } : null;
  }

  // Вернуть ЛЮБОЙ элемент (карта/фишка/фигура) домой — той же пружиной, что и обычный релиз.
  private releaseElement(el: Elem): void {
    const h = this.homeOf(el);
    if (!h) return;
    el.setState(el.rest); // возврат в СВОЙ план покоя (стол / левитация / удержание)
    el.root.zIndex = h.depth; // и на свою глубину — не поверх соседей по стопке
    this.placeCard(el);
    el.body.setTarget({ x: h.home.x, y: h.home.y, rot: 0 });
  }

  // «Оставить где отпущено» (onDropOutside: stay/dissolve, issue #61): осадить элемент в его план покоя
  // прямо на ТЕКУЩЕЙ позиции, не гоня домой. Цель = текущая точка → пружина осядет там же, цикл уснёт
  // (в отличие от releaseElement, что целит в home). Дом в состоянии зоны не меняем — это дисплей-жест.
  private restElementInPlace(el: Elem): void {
    el.setState(el.rest);
    el.root.zIndex = this.homeOf(el)?.depth ?? el.root.zIndex; // снять драг-слой (1e6), лечь на плоскость стола
    this.placeCard(el);
    el.body.setTarget({ x: el.body.px, y: el.body.py, rot: 0 });
  }

  // Есть ли у карты что подглядеть (чистый предикат Peekable.canPeek) — зона ПОДГЛЯДЕТЬ читает его
  // для armed-текста: уже видно (не скрыта И лицом вверх) → «зачем?»/«нет.» и дроп ничего не
  // запускает (peekReveal вернёт null). КАК показать/вернуть — знает сам элемент, не движок.
  private needsPeek(el: TableElement): boolean {
    return "canPeek" in el ? (el as unknown as Peekable).canPeek : false;
  }

  // Возвращает true, если хоть один элемент реально ушёл в подглядывание — это и есть consumed
  // для SingleDrag/GroupDrag (см. drag.ts): не начали ни одного → карта(ы) летят домой как обычно.
  // КАК раскрывать и как вернуть — знает сам элемент (peekReveal → undo); движок лишь держит undo.
  private startPeek(els: readonly TableElement[]): boolean {
    let any = false;
    for (const el of els) {
      const undo = "peekReveal" in el ? (el as unknown as Peekable).peekReveal() : null;
      if (!undo) continue; // раскрывать нечего (уже видно) — карта не поглощена, полетит домой
      this.peeking.set(el.id, { el: el as Elem, undo, t: 0, grabbed: false });
      any = true;
    }
    if (any) this.wake();
    return any;
  }

  // Вернуть карту КАК БЫЛО и закрыть сессию показа. releaseHome — отпустить домой (истёк таймер и
  // карту НЕ держат). Под пальцем (grabbed) домой не гоним — restore лишь возвращает скрытость,
  // карта остаётся в драге; домой её увезёт обычный release по концу драга.
  private endPeek(id: string, releaseHome: boolean): void {
    const p = this.peeking.get(id);
    if (!p) return;
    this.peeking.delete(id);
    p.undo();
    if (releaseHome) this.releaseElement(p.el);
  }

  // Конец драга: карту(ы), что держали в «поглядеть», вернуть КАК БЫЛО (скрытость), НЕ отпуская
  // домой — домой их увезёт обычный release/дроп. Зовётся ДО диспатча дропа, чтобы повторный дроп
  // на ПОДГЛЯДЕТЬ раскрыл с уже восстановленного базового вида (иначе поймал бы «раскрытое»).
  private resolveGrabbedPeeks(): void {
    for (const [id, p] of this.peeking) if (p.grabbed) this.endPeek(id, false);
  }

  // ——— цикл ———

  protected frame(dt: number): boolean {
    this.edgeScroll(dt);
    if (this.viewport.flinging) {
      this.syncVp();
      this.viewport.stepFling(dt);
      this.applyView();
      this.emitView();
    }
    let moving = this.input.gesture !== "none" || this.viewport.flinging;
    for (const el of this.everyElement()) {
      el.step(dt);
      if (!el.resting) moving = true;
    }
    this.reapDead();
    for (const b of this.buttons) {
      b.step(dt);
      if (!b.resting) moving = true;
    }
    if (this.peeking.size > 0) {
      moving = true; // держим тикер живым, иначе на успокоившейся сцене отсчёт «поглядеть» замрёт
      for (const [id, p] of this.peeking) {
        p.t += dt;
        // Истёк показ: вернуть КАК БЫЛО. Держат карту (grabbed) — restore лишь возвращает скрытость,
        // карта остаётся в драге; не держат — отпускаем домой обычным releaseElement.
        if (p.t >= PEEK_DUR) this.endPeek(id, !p.grabbed);
      }
    }
    // armed: перечитываем каждый кадр из this.drag, а не разбросанными вызовами по местам, где
    // драг стартует/кончается — так короче и не пропустит ни один выход (early return и т.п.).
    for (const z of this.zones) {
      const eligible = this.drag !== null && z.accepts(this.drag);
      z.zone.setArmed(eligible, eligible && z.textFor ? z.textFor(this.drag!).armed : undefined);
      z.zone.step(dt, this.reduceMotion); // покачивание armed/hot-текста
    }
    this.render();
    return moving;
  }

  // Убрать догоревшие элементы (dead) — уничтожить узлы и вычистить из списков + byId (метки
  // увидят total--). Карты и фишки/фигуры реапаются одинаково.
  private reapDead(): void {
    if (this.cards.some((p) => p.card.dead)) {
      for (const p of this.cards) if (p.card.dead) { p.card.destroy(); this.byId.delete(p.card.id); }
      this.cards = this.cards.filter((p) => !p.card.dead);
    }
    if (this.pieces.some((p) => p.el.dead)) {
      for (const p of this.pieces) if (p.el.dead) { p.el.destroy(); this.byId.delete(p.el.id); }
      this.pieces = this.pieces.filter((p) => !p.el.dead);
    }
  }

  // Снести весь контент песочницы (карты + мебель), оставив сами слои — для рестарта песочницы.
  private clearContent(): void {
    for (const p of this.cards) p.card.destroy();
    for (const p of this.pieces) p.el.destroy();
    for (const c of this.controlCards) c.destroy();
    this.cards = [];
    this.pieces = [];
    this.cardSpecs = [];
    this.controlCards = [];
    this.byId.clear();
    this.stackMove = null;
    for (const m of this.markers) m.destroy();
    this.markers = [];
    this.stacks = [];
    this.solos = [];
    this.chipPile = null;
    this.boardZones = [];
    this.boardTitles = [];
    this.fields = [];
    this.selMode = false;
    this.sel = EMPTY;
    this.selZone = null;
    this.selDragging = null;
    this.cancelLongPress();
    this.hoveredBtn = null;
    this.faceOf.clear();
    this.selButtons = [];
    this.grabbers = [];
    this.grabbedMarker = null;
    this.pendingHost = null;
    this.drag = null;
    this.buttons = [];
    this.zones = [];
    this.peeking.clear();
    this.input.reset();
    this.scene.surface.removeChildren().forEach((c) => c.destroy());
    this.scene.verb.removeChildren().forEach((c) => c.destroy());
    this.scene.clearCards(this.contentW, this.contentH);
  }

  // Все живые элементы сцены: перетаскиваемые карты (this.cards) + фишки/фигуры (this.pieces) +
  // управляемые API карты (control). Для шага/рендера/теней; хит-тест — только по draggables().
  private everyElement(): TableElement[] {
    const out: TableElement[] = this.controlCards.slice();
    for (const p of this.cards) out.push(p.card);
    for (const p of this.pieces) out.push(p.el);
    return out;
  }

  // Пробросить reduce-motion в каждую живую Card (Piece decorативных циклов не имеет — нечего
  // гасить). Новые карты получают флаг на спавне (addControlCard/spawnCards), не только тут.
  protected onReduceMotionChange(v: boolean): void {
    for (const el of this.everyElement()) if (el instanceof Card) el.reduceMotion = v;
  }

  private render(): void {
    const els = this.everyElement();
    for (const el of els) el.sync();
    for (const b of this.buttons) b.sync();
    for (const m of this.markers) m.update(); // видимость (свап драггер↔якорь) + позиция дома

    // Слитые тени по уровням: силуэты элементов уровня → одна маска+заливка (без потемнения наложений).
    const shadows = els
      .filter((c) => c.shadowRect)
      .map((c) => ({ level: levelOf(c.state), rect: c.shadowRect! }));
    this.scene.paintShadows(shadows, this.contentW, this.contentH);
  }

  // Снести Pixi-app и живые узлы (для рестарта канваса и окончательного destroy). Логические
  // спеки не сохраняем — при рестарте канваса состояние берётся из снимка ДО вызова.
  // Отвязать слушатели и почистить свои узлы/состояние перед сносом app (Host снимет тикер+app).
  protected onTeardown(app: Application): void {
    app.canvas.removeEventListener("wheel", this.onWheel);
    for (const p of this.cards) p.card.destroy();
    for (const p of this.pieces) p.el.destroy();
    for (const c of this.controlCards) c.destroy();
    this.cards = [];
    this.pieces = [];
    this.cardSpecs = [];
    this.controlCards = [];
    this.byId.clear();
    this.stackMove = null;
    for (const m of this.markers) m.destroy();
    this.markers = [];
    this.stacks = [];
    this.solos = [];
    this.chipPile = null;
    this.boardZones = [];
    this.boardTitles = [];
    this.fields = [];
    this.selMode = false;
    this.sel = EMPTY;
    this.selZone = null;
    this.selDragging = null;
    this.cancelLongPress();
    this.hoveredBtn = null;
    this.faceOf.clear();
    this.selButtons = [];
    this.grabbers = [];
    this.grabbedMarker = null;
    this.pendingHost = null;
    this.drag = null;
    this.buttons = [];
    this.zones = [];
    this.peeking.clear();
    this.input.reset();
    this.tex?.destroy();
  }
}
