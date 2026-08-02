import { Application, Container, Graphics, Text } from "pixi.js";
import { CardTextureCache } from "../ui/CardTextureCache";
import { Card, type CardOptions, type CardState, type Pose } from "../ui/Card";
import { Piece } from "../ui/Piece";
import { pieceVisual, type PieceSpec } from "../ui/pieceKinds";
import { BoardZone, type AcceptRule, type OnOccupied } from "../board/boardZone";
import type { Board } from "../board/board";
import { gridSlots, ringSlots, type PositionedSlot } from "../board/layout/slots";
import { Field, NORMAL_FIELD } from "../board/field";
import type { Stack } from "../board/stack";
import { attachControls, type Configurable } from "../ui/controls";
import type { Toggle } from "../ui/Toggle";
import type { Stepper } from "../ui/Stepper";
import type { Segmented } from "../ui/Segmented";
import { wrapRule } from "../board/boardModel";
import { BOARD_PRESETS, type BoardPreset } from "../board/boardPresets";
import { begin, toggle, has as hasSel, EMPTY, type Selection } from "../board/selection";
import type { CollectItem } from "../board/collectOrder";
import {
  anchorIndexFor,
  assemble,
  ASSEMBLY_PRESETS,
  DEFAULT_PRESET,
  isValidGatherAnchor,
  reanchorOffsets,
  validAnchorsFor,
  type AssemblyConfig,
  type Anchor,
  type Form,
  type GatherOn,
  type NaturalOrder,
  type SortOverride,
} from "../board/assembly";
import { canSelect, ELIGIBLE, shouldLift, shouldOutline, type EligibleName, type Mark, type SelectVisualConfig } from "../board/selectVisual";
import { DEFAULT_DROP_POLICY, resolveMode, type DropMode, type DropOutsidePolicy } from "../board/dropPolicy";
import { hasTag } from "../board/tagQuery";
import { pileIdentity } from "../board/pileIdentity";
import type { PileIdentity } from "../board/pileIdentity";
import { namedSuits } from "../board/suitNames";

// Демо-предикаты custom-осей дропа (issue #63): игра задаёт СВОИ, тут — примеры для песочницы.
const MERGE_CUSTOM = hasTag("suit:♣"); // «сшиваются только трефы» (остальные — домой)
const KEEP_CUSTOM = hasTag("suit:♦"); // «выделение остаётся лишь у бубён»
import { makeSelectOutline } from "./selectOutline";
import { asDraggable } from "./capabilities";
import { makeLabel, type PiecePlan, type SectionContext } from "../kit/context";
import { buttonsSection } from "../kit/buttons";
import { dropzonesSection } from "../kit/dropzones";
import { dropIndicatorSection } from "../kit/dropIndicator";
import { CARD_VARIANTS, cardVariantsSection } from "../kit/cardVariants";
import { makeWidgetDemoState, widgetsSection } from "../kit/widgets";
import { DropZone } from "../ui/DropZone";
import { Button } from "../ui/Button";
import { TopBar, TOPBAR_H } from "../ui/TopBar";
import type { TableElement } from "./element";
import { GroupDrag, SingleDrag, type DragPayload } from "./drag";
import type { Command } from "./command";
import type { Marker, MarkerHost, MarkerState, ShowPolicy } from "./marker";
import { fitBlock, squeezeOffsets, fitSection, SB_BOX_PAD, SB_HEADER_GAP, SB_SECTION_GAP, SB_ITEM_GAP, SB_MARGIN, BLOCK_PAD } from "./sandboxLayout";
import { wrapRow, wrapFlow } from "./sandboxWrap";
import type { ViewState } from "./viewport";
import { SceneEngine, clamp, type SceneElement } from "./sceneEngine";
import type { AnimPreset } from "../anim/presets";
import { drawAnchorIcon, drawPinIcon, drawRingIcon, gripConfig } from "../kit/markerIcons";
import { piecesSection } from "../kit/pieces";
import { stacksSection } from "../kit/stacks";
import { commandPortSection } from "../kit/commandPort";
import { SANDBOX_CARD_H, TEX_H, TEX_W } from "./constants";

export type { ViewState };

// UI-kit «/playground» — сторибук на канвасе. Один горизонтальный ряд карт-вариантов с
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

interface Placed {
  card: Card;
  home: { x: number; y: number };
  depth: number; // z-индекс глубины в своём слое; после драга карта возвращается на него
  specIndex: number; // из какого CardSpec рождена — для снимка/восстановления при рестарте канваса
}

// Элемент стола, которым можно ДВИГАТЬ пальцем: карта, фишка, фигура. Контракт общий (SceneElement
// из sceneEngine) — системы движка (тени/слои/цикл/хит-тест/драг) конкретный класс не знают.
type Elem = SceneElement;

// Не-карточный элемент на столе (фишка/фигура) с домом и глубиной (как Placed для карт).
interface PiecePlaced {
  el: Piece;
  home: { x: number; y: number };
  depth: number;
}

// Элемент борда КАК ДАННЫЕ: карта (лицо) ЛИБО фигура (PieceSpec: chip/chess). Основа BoardFactory.
type ElementDef = { kind: "card"; face: string; size?: number; custom?: string } | PieceSpec;

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
  requiresCapability?: keyof PileIdentity["capabilities"]; // зона-слой цепочки (§6, issue #73): слепая
  // зона — принимает набор, только если ВСЕ его члены несут эту способность (BoardZoneOpts, dropPolicy.ts)
}

// Одиночная цель с меткой (соло-карта, соло-фигура): host + драггер/якорь + как достать лид.
interface SoloTarget {
  host: MarkerHost;
  dragger: Marker;
  anchor: Marker;
  lead: () => Elem | null;
  label: string;
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

// Полная колода 52 (лица карт закрытой стопки Поля).
const DECK52: string[] = ["♠", "♥", "♦", "♣"].flatMap((s) => ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"].map((r) => r + s));

// Песочница: СТЕНД, а не игра. Общая обвязка стола (полотно, слои, камера, ввод, драг, дроп-зоны,
// цикл и тени) живёт в SceneEngine и одинакова для всех сцен; здесь — только разделы стенда:
// сторис карт, витрины кнопок/виджетов, борды-примеры, демо выделения и дроп-индикатора.
export class PlaygroundEngine extends SceneEngine {
  private tex!: CardTextureCache;
  private pendingRestore?: Map<number, CardRuntime>; // снимок для рестарта канваса (build читает его)

  private baseScale = 1;
  private cardW = 1;
  private cardH = 1;
  private lastSectionRight = 0; // правый край последней sectionFrame — для пар секций БОК О БОК (см. buildContent)
  // reduceMotion — поле базового CanvasApp (issue #7): гасит покачивание armed/hot-текста дропзон
  // (DropZone.step) и, через onReduceMotionChange, bob/пыль каждой Card.
  private cards: Placed[] = [];

  /** Высота карты — конфиг сцены (issue #68). Дефолт SANDBOX_CARD_H; параметром удобно поднимать
   *  песочницу с другим размером карты, не трогая движок. onBack — куда уводит кнопка «в меню»:
   *  движок не знает про роутинг приложения, его подаёт хост. */
  constructor(
    private readonly cardHeight: number = SANDBOX_CARD_H,
    private readonly onBack: () => void = () => {},
  ) {
    // alignX: "left" — контент песочницы прижат к постоянной левой опоре, а не центрируется, когда
    // он уже экрана (issue #49): иначе раскладка прыгала вбок при каждом изменении ширины окна.
    super({ align: "left" });
  }
  private pieces: PiecePlaced[] = []; // не-карточные элементы (фишки, фигуры) — тот же драг/тени
  private cardSpecs: CardSpec[] = [];
  private controlCards: Card[] = []; // карты раздела «Управление» — двигаются API, не драгом
  private controlButtons: { cap: string; b: Button }[] = []; // flip/conceal/reveal/move — для e2e
  private widgetDemo = makeWidgetDemoState(); // витрина «виджеты контролов» — тривиальное состояние
  private widgetControls: { toggles: Toggle[]; steppers: Stepper[]; segments: Segmented[] } | null = null;
  private stackMove: { a: string[]; b: string[] } | null = null; // состав стопок «переноса» — для e2e-хука
  private stacks: SandboxStack[] = [];
  private solos: SoloTarget[] = []; // одиночные цели с метками (соло-карта, соло-фигура)
  private chipPile: { ids: readonly string[]; dragger: Marker } | null = null; // столбик фишек (для e2e-грипа)
  private boardZones: BoardZone[] = []; // игровые зоны (борды): фигуры в слотах, драг между слотами
  private boardTitles: string[] = []; // заголовки бордов (align с boardZones), для e2e
  // ПОЛЕ (обособленный модуль board/field.ts): владелец с закрытой стопкой + flow-гридом.
  private fields: Field[] = [];
  private fieldReorderToggle: Toggle | null = null;
  private fieldSteppers: Stepper[] = []; // мин/макс колонок/строк — для e2e-хука координат +/-
  private selMode = false; // сессия выделения активна ⇔ набор непуст (#66); синхронизируется в setSelection
  private selTrigger: "off" | "hold" | "tap" = "off"; // способ входа в выделение (#66): выкл / по зажатию / по нажатию
  // Кандидат на ВХОД в выделение по карте (#66) вне сессии: tap-mode входит на тап-релизе, hold-mode —
  // по таймеру удержания; сдвиг пальца (onCardMove) отменяет вход — карта тащится как обычная.
  private selEntry: { id: string; grabCp: { x: number; y: number }; timer: ReturnType<typeof setTimeout> | null } | null = null;
  private sel: Selection = EMPTY; // выделенный набор, замкнут на selZone
  private selZone: BoardZone | null = null; // зона демо-выделения
  private selDragging: string[] | null = null; // набор, который сейчас тащат целиком
  private selGrabCp = { x: 0, y: 0 }; // точка захвата набора (тап vs драг)
  // Отложенный драг набора (#65): на касании выделенной карты запоминаем состав/смещения/лид, но
  // GroupDrag НЕ создаём — иначе тап-снятие успевает стянуть набор к пальцу и вернуть. Промоушен в
  // GroupDrag — только когда палец реально вышел за порог тапа (onCardMove).
  private selPending: { cards: Elem[]; offsets: { dx: number; dy: number; rot?: number }[]; leadId: string } | null = null;
  // Сборка набора — рычаги как ДАННЫЕ (issue #56, SELECTION-DESIGN §4–5). Одна конфигурация вместо
  // прежних «сорт набора»/«сборка» тумблеров; песочница крутит её рычаги, дефолт — пресет grab-to-hand.
  private selAssembly: AssemblyConfig = { ...ASSEMBLY_PRESETS[DEFAULT_PRESET]! };
  private selPresetName: string = DEFAULT_PRESET; // последний выбранный пресет (для e2e-хука; манипуляции рычагами его не сбрасывают)
  private faceOf = new Map<string, string>(); // id фигуры → лицо карты (для сорта набора по номиналу)
  private selResetButton: Button | null = null; // primary-кнопка сброса под боксом «называю масть» (#64), видна при ≥1 в наборе
  private selMultiButtons: Button[] = []; // тумблер «выделение:» вкл/выкл (единый гейт режима, #64) — для e2e
  private selPresetButtons: Button[] = []; // тумблер «пресет:» — для e2e
  private selFormButtons: Button[] = []; // тумблер «форма:» — для e2e
  private selOrderButtons: Button[] = []; // тумблер «порядок:» — для e2e
  private selSortButtons: Button[] = []; // тумблер «сорт:» (override) — для e2e
  private selGatherButtons: Button[] = []; // тумблер «собирать:» (gatherOn) — для e2e (issue #71)
  private selAnchorButtons: Button[] = []; // тумблер «якорь:» (anchor) — для e2e (issue #71); невалидные под gatherOn — disabled
  // Отбор-визуал набора как ДАННЫЕ (issue #60, SELECTION-DESIGN §4.A): что можно выбрать (eligible),
  // подсветка выбираемых (hintEligible), как метить выбранное (mark). Дефолт как в примере: только
  // карты, без подсказки, метка «оба» (подъём + контур).
  private selVisual: SelectVisualConfig = { eligible: ELIGIBLE.cards!, hintEligible: false, mark: "both" };
  private selEligibleName: EligibleName = "cards"; // имя eligible-предиката рядом с ним самим — для e2e-хука
  private selOutlines = new Map<string, { g: Graphics; kind: "select" | "hint" }>(); // контур-атомы по id фигуры
  private selEligibleButtons: Button[] = []; // тумблер «выбор:» (карты/буби/любые) — для e2e
  private selHintButtons: Button[] = []; // тумблер «подсказка:» (выкл/вкл) — для e2e
  private selMarkButtons: Button[] = []; // тумблер «метка:» (подъём/контур/оба) — для e2e
  // Дроп набора МИМО зон как ПОЛИТИКА-ДАННЫЕ — ДВЕ ортогональные оси (issue #63, dropPolicy.ts):
  // merge (сшивать: off/on/custom) + keepSelection (выделение после: on/off/custom) + якорь (primary).
  private selDropPolicy: DropOutsidePolicy = { ...DEFAULT_DROP_POLICY };
  private selMergeButtons: Button[] = []; // тумблер «сшивать:» — для e2e
  private selKeepButtons: Button[] = []; // тумблер «выделение после:» — для e2e
  // Лог-дропбокс «называю масть» (issue #62) — ТЕСТ-обвязка #61: чисто лог мастей набора, без
  // политики хранения/возврата. selNameZone — сам бокс (для hit-теста дропа набора), lastNamedSuits —
  // последний выписанный список (дедуп + «???») для e2e.
  private selNameZone: DropZone | null = null;
  private lastNamedSuits: string[] = [];
  private boardOnOccupiedSegments: Segmented[] = []; // тумблер «на занятый слот» каждого из 7 пресетов — для e2e
  private stackMode: "one" | "whole" = "one"; // режим драга карты стопки: одна карта / вся пачка
  private dragSqueeze = false; // плейсмент пачки при драге: false — врассыпную, true — сжать в руку
  private stackModeButtons: Button[] = []; // «режим драга карты» — для e2e-хука
  private stackSqueezeButtons: Button[] = []; // «при драге стопки» — для e2e-хука
  private stackReorderToggle: Toggle | null = null; // «реордер стопок» — для e2e-хука
  private buttonShowcase: { cap: string; b: Button }[] = []; // раздел «Кнопки» — для e2e-хука
  private topbar: TopBar | null = null; // верхняя панель — на канвасе, не в HTML (см. ui/TopBar.ts)

  // Размер экрана меняется (mount + ресайз окна), размер КАРТЫ — нет: она приходит из конфига
  // (issue #68). Пока карта считалась от вьюпорта, а кегли были константами, текст относительно
  // карты выходил вдвое крупнее на телефоне. Не возвращать сюда зависимость от размеров экрана.
  protected onLayout(_width: number, _height: number): void {
    this.cardH = this.cardHeight;
    this.baseScale = this.cardH / TEX_H;
    this.cardW = TEX_W * this.baseScale;
  }

  // Собрать разделы стенда в свежем канвасе (полотно, слои и ввод завёл SceneEngine).
  // pendingRestore — снимок карт для рестарта канваса; без него песочница строится в исходном виде.
  protected buildScene(app: Application): void {
    this.tex = new CardTextureCache(app);
    this.buildTopBar();
    this.buildContent(this.pendingRestore);
    this.pendingRestore = undefined;
  }

  // Верхняя панель — на КАНВАСЕ (общий ui/TopBar), а не в HTML: приложение целиком рисует движок.
  // Живёт в экранном слое chrome, поэтому не ездит с паном и не растёт от зума.
  private buildTopBar(): void {
    this.topbar = new TopBar([
      { key: "back", label: "← в меню", onClick: () => this.onBack() },
      { key: "restart-sandbox", label: "⟲ песочница", onClick: () => this.restartSandbox() },
      { key: "restart-canvas", label: "⟳ канвас", onClick: () => void this.restartCanvas() },
    ]);
    this.chrome.addChild(this.topbar.root);
    this.chromeButtons = this.topbar.buttons;
  }

  protected layoutChrome(w: number, _h: number): void {
    this.topbar?.layout(w);
  }

  // Стол начинается ПОД панелью: камера должна оставлять её полосу свободной, иначе верх контента
  // навсегда уезжает под непрозрачный HUD и до него не доскроллить.
  protected chromeInsetTop(): number {
    return TOPBAR_H;
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

  // ——— контент ———

  // Подпись стенда. Сама реализация — общая с витриной каталога (kit/context.makeLabel): подписи
  // обоих стендов обязаны ужиматься и якориться ОДИНАКОВО, иначе каталог показывал бы не то, что
  // песочница. Здесь остаётся только «создать, не добавляя» — этой формой пользуются места, где
  // узел кладётся в конкретный индекс слоя (см. sectionFrame).
  private label(text: string, x: number, y: number, size: number, fill: number, wrap?: number, anchorX = 0.5): Text {
    return makeLabel(text, x, y, size, fill, wrap, anchorX);
  }

  // Контракт секции стенда (kit/context.ts) в исполнении ПЕСОЧНИЦЫ. Витрина каталога отдаёт свой,
  // и одна и та же секция строится на обоих. Ключевое отличие хозяев — card(): песочница копит
  // спеки и рождает карты ПОСЛЕ мебели (иначе подписи легли бы поверх карт), витрина ставит сразу.
  private sectionCtx(): SectionContext {
    return {
      tex: this.tex,
      baseScale: this.baseScale,
      cardW: this.cardW,
      cardH: this.cardH,
      label: (text, x, y, size, fill, wrap, anchorX, layer) => {
        const t = makeLabel(text, x, y, size, fill, wrap, anchorX);
        (layer === "verb" ? this.scene.verb : this.scene.surface).addChild(t);
        return t;
      },
      decor: (node, layer = "surface") => void (layer === "verb" ? this.scene.verb : this.scene.surface).addChild(node),
      card: (opts, home, depth = 0, bobPhase = 0) => void this.cardSpecs.push({ opts, home: { ...home }, depth, bobPhase }),
      piece: (id, home, spec, r, depth, plan) => this.spawnPiece(id, home, spec, r, depth, plan),
      apiCard: (opts, home) => {
        const c = new Card({ ...opts, pose: opts.pose ?? "rest" }, this.tex, this.baseScale);
        c.body.snapTo({ x: home.x, y: home.y, rot: home.rot ?? 0, scale: c.restScale });
        this.addControlCard(c);
      },
      flipStack: (ids) => {
        const els = ids.map((id) => this.byId.get(id)).filter((e): e is Elem => !!e);
        if (els.length === ids.length) this.flipGroup(els);
      },
      dispatch: (cmd) => this.dispatch(cmd),
      solo: (id, slot, anchor, label) => this.attachSolo(id, slot, anchor.draw, anchor.show, label ?? id),
      pile: (ids, slot, anchor) => {
        const host: MarkerHost = {
          slotPos: () => slot,
          state: () => this.stackState(ids),
          makePayload: (cp) => this.makeStackPayload(ids, cp),
        };
        return { ...this.attachGrip(host, () => this.byId.get(ids[ids.length - 1] ?? "") ?? null, anchor.draw, anchor.show), host };
      },
      button: (b, at) => {
        if (at) b.place(at.x, at.y);
        this.registerButton(b);
        return b;
      },
      zone: (z, onDrop, accepts, textFor) => {
        this.registerZone(z, onDrop, accepts, textFor);
        return z;
      },
      needsPeek: (el) => this.needsPeek(el),
      element: (id) => this.byId.get(id),
      controls: (cfg, at, onChange) =>
        attachControls(cfg, { layer: this.scene.surface, register: (b) => this.registerButton(b), onChange: onChange ?? (() => this.wake()) }, at),
      setAnimPreset: (ids, preset) => {
        for (const id of ids) (this.byId.get(id) as unknown as { setAnimPreset?: (a: AnimPreset) => void } | undefined)?.setAnimPreset?.(preset);
        this.wake();
      },
      appear: (ids) => {
        for (const id of ids) (this.byId.get(id) as unknown as { appear?: () => void } | undefined)?.appear?.();
        this.wake();
      },
      after: (delay, fn) => this.after(delay, fn),
      moveDuration: (id) => this.moveDuration(id),
      wake: () => this.wake(),
    };
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

  // Ряд «Карты — варианты» — общая секция каталога (kit/cardVariants.ts).
  private buildCardsRow(left: number, top: number): { bottom: number; width: number } {
    return cardVariantsSection(this.sectionCtx(), { x: left, y: top });
  }

  // Ряд «Дропзоны» — общая секция каталога (kit/dropzones.ts).
  private buildDropzonesBlock(left: number, top: number): { bottom: number; width: number } {
    return dropzonesSection(this.sectionCtx(), { x: left, y: top });
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
    y = this.sectionFrame(SB_MARGIN, y, "Дроп-индикатор: варианты подписи", (cl, ct) => dropIndicatorSection(this.sectionCtx(), { x: cl, y: ct }));
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
      trigger: "off" | "hold" | "tap"; // способ входа в выделение (#66)
      selected: string[];
      resetButtonAt: { x: number; y: number } | null; // primary-кнопка сброса под боксом (#64); null, пока набор пуст
      // Конфиг сборки набора как ДАННЫЕ (issue #56): рычаги form/order/sortOverride + последний пресет.
      assembly: { preset?: string; form: Form; order: NaturalOrder; sortOverride: SortOverride; gatherOn: GatherOn; anchor: Anchor };
      // Отбор-визуал как ДАННЫЕ (issue #60): eligible по ИМЕНИ, подсветка выбираемых, метка выбранного.
      visual: { eligible: EligibleName; hintEligible: boolean; mark: Mark };
      // Дроп мимо зон как ДАННЫЕ (issue #63): две оси merge/keepSelection + якорь сшивки.
      policy: { merge: DropMode; keepSelection: DropMode; mergeAnchor: "primary" };
    };
    perf: { hoverRerenders: number }; // сколько кнопок перерисовалось от ховера — для замера отсутствия лагов (баг №4)
    selFigures: { id: string; key: string; x: number; y: number; selected: boolean; outlined: boolean; hinted: boolean }[];
    boards: { title: string; figures: { id: string; key: string; x: number; y: number }[]; slots: { key: string; x: number; y: number }[]; onOccupied: OnOccupied; onOccupiedAt: { x: number; y: number }[] }[];
    field: { stack: number; grid: number; colsMin: number; colsMax: number | undefined; rowsMin: number; rowsMax: number | undefined; reorder: boolean; reorderToggleAt: { x: number; y: number } | null; stackAt: { x: number; y: number }; gridRect: { x: number; y: number; w: number; h: number }; gridCards: { id: string; x: number; y: number }[] } | null;
    buttonShowcase: { cap: string; x: number; y: number; disabled: boolean }[];
    stackModeAt: { x: number; y: number }[];
    stackSqueezeAt: { x: number; y: number }[];
    stackReorderAt: { x: number; y: number } | null;
    selMultiAt: { x: number; y: number }[];
    selPresetAt: { x: number; y: number }[]; // тумблер «пресет:»
    selFormAt: { x: number; y: number }[]; // тумблер «форма:» (стопка/раскрыт/ряд/веер)
    selOrderAt: { x: number; y: number }[]; // тумблер «порядок:» (расположение/выбор)
    selSortAt: { x: number; y: number }[]; // тумблер «сорт:» (—/номинал/масть/центр — override)
    selGatherAt: { x: number; y: number }[]; // тумблер «собирать:» (gatherOn, issue #71)
    selAnchorAt: { x: number; y: number; disabled: boolean }[]; // тумблер «якорь:» (anchor, issue #71) — disabled под невалидные при текущем gatherOn
    selEligibleAt: { x: number; y: number }[]; // тумблер «выбор:» (карты/буби/любые)
    selHintAt: { x: number; y: number }[]; // тумблер «подсказка:» (выкл/вкл)
    selMarkAt: { x: number; y: number }[]; // тумблер «метка:» (подъём/контур/оба)
    selMergeAt: { x: number; y: number }[]; // тумблер «сшивать:» (нет/да/custom — #63)
    selKeepAt: { x: number; y: number }[]; // тумблер «выделение после:» (да/нет/custom — #63)
    controls: {
      buttons: { cap: string; x: number; y: number }[];
      flipFaceUp: boolean | null;
      concealed: boolean | null;
      revealValue: string | null;
      moveCounts: { a: number; b: number } | null;
      widgets: { flag: boolean; level: number; mode: number; toggleAt: { x: number; y: number } | null; stepperMinusAt: { x: number; y: number } | null; stepperPlusAt: { x: number; y: number } | null; segmentedAt: { x: number; y: number }[] } | null;
    };
    cardW: number;
    topbar: Record<string, { x: number; y: number; w: number; h: number }>; // канвасный топбар — DOM-узлов у него нет
    draggingId: string | null;
    lastNamedSuits: string[]; // последний лог бокса «называю масть» (#62) — дедуп мастей + «???»
    storyCards: { caption: string; x: number; y: number; card: string; faceUp: boolean; draggable: boolean; back: string; faceStyle: string; fourColor: boolean; torn: boolean; size: number; custom: string; pose: string; concealed: boolean; censored: boolean }[];
  } {
    // Перевод контент→экран берём у общего слоя: он один знает про инсет HUD (топбар), и своя
    // формула тут разъехалась бы с реальным положением карт ровно на высоту панели.
    const toScreen = (cx: number, cy: number) => this.contentToScreen(cx, cy);
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
        trigger: this.selTrigger,
        selected: [...this.sel.ids],
        resetButtonAt: this.selResetButton && this.sel.ids.length >= 1 ? toScreen(this.selResetButton.x, this.selResetButton.y) : null,
        assembly: {
          preset: this.selPresetName,
          form: this.selAssembly.form,
          order: this.selAssembly.order,
          sortOverride: this.selAssembly.sortOverride,
          gatherOn: this.selAssembly.gatherOn,
          anchor: this.selAssembly.anchor,
        },
        visual: { eligible: this.selEligibleName, hintEligible: this.selVisual.hintEligible, mark: this.selVisual.mark },
        policy: { merge: this.selDropPolicy.merge, keepSelection: this.selDropPolicy.keepSelection, mergeAnchor: this.selDropPolicy.mergeAnchor },
      },
      perf: { hoverRerenders: this.hoverRerenders },
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
      selGatherAt: this.selGatherButtons.map((b) => toScreen(b.x, b.y)),
      selAnchorAt: this.selAnchorButtons.map((b) => ({ ...toScreen(b.x, b.y), disabled: b.disabled })),
      selEligibleAt: this.selEligibleButtons.map((b) => toScreen(b.x, b.y)),
      selHintAt: this.selHintButtons.map((b) => toScreen(b.x, b.y)),
      selMarkAt: this.selMarkButtons.map((b) => toScreen(b.x, b.y)),
      selMergeAt: this.selMergeButtons.map((b) => toScreen(b.x, b.y)),
      selKeepAt: this.selKeepButtons.map((b) => toScreen(b.x, b.y)),
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
      topbar: this.topbar?.rects() ?? {},
      draggingId: this.drag?.lead.id ?? null,
      lastNamedSuits: [...this.lastNamedSuits],
      // «Карты — варианты» всегда спавнятся ПЕРВЫМИ (buildCardsRow — первая секция buildContent),
      // так что this.cards[i] для i < CARD_VARIANTS.length — тот же элемент, что и CARD_VARIANTS[i]
      // (как уже делает firstCard = this.cards[0] выше).
      storyCards: CARD_VARIANTS.map((s, i) => {
        const c = this.cards[i]?.card;
        if (!c) return null;
        return { caption: s.caption, ...toScreen(c.body.px, c.body.py), card: c.card, faceUp: c.faceUp, draggable: c.draggable, back: c.back, faceStyle: c.faceStyle, fourColor: c.fourColor, torn: c.torn, size: c.size, custom: c.custom, pose: c.pose, concealed: c.concealed, censored: c.censored };
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
          // Через СТИЛЬ (anim/moveStyles.ts): «как элемент летит» — свойство фила, а не места
          // вызова. spring отдаёт движение пружинам, то есть прежнее поведение стенда.
          c.body.travelTo({ x: cmd.x, y: cmd.y }, ((c as unknown as { animPreset?: AnimPreset }).animPreset ?? this.preset).move.style, this.preset.speed);
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
      // Командные блоки — общая секция каталога (kit/commandPort.ts): раздел про ПОРТ КОМАНД, а он
      // одинаков для песочницы и витрины. Витрина виджетов идёт ниже отдельной секцией.
      const r = commandPortSection(this.sectionCtx(), { x: contentLeft, y: contentTop });
      this.controlButtons = r.buttons;
      this.stackMove = r.move;
      const w = this.buildWidgetsBlock(contentLeft, r.bottom + SB_ITEM_GAP);
      return { bottom: w.bottom, width: Math.max(r.width, w.width) };
    });
  }

  // Витрина «виджеты контролов» — общая секция каталога (kit/widgets.ts). Состояние тривиальное и
  // локальное: секция доказывает, что Toggle/Stepper/Segmented — переиспользуемые атомы, а не
  // что-то, «прикрученное только к Полю и бордам».
  private buildWidgetsBlock(left: number, top: number): { bottom: number; width: number } {
    const r = widgetsSection(this.sectionCtx(), { x: left, y: top }, this.widgetDemo);
    this.widgetControls = r.controls;
    return { bottom: r.bottom, width: r.width };
  }

  private addControlCard(card: Card): void {
    card.reduceMotion = this.reduceMotion;
    card.flashOff = this.flashOff;
    card.lowFx = this.lowFx;
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

  // Живые Card из накопленных спеков. restore — снимок (положение/лицо), сгоревшие пропускаем.
  private spawnCards(restore?: Map<number, CardRuntime>): void {
    this.cardSpecs.forEach((spec, i) => {
      const r = restore?.get(i);
      if (restore && !r) return; // сгоревшую карту при рестарте канваса не воскрешаем
      const card = new Card(r ? { ...spec.opts, faceUp: r.faceUp } : spec.opts, this.tex, this.baseScale);
      card.reduceMotion = this.reduceMotion;
      card.flashOff = this.flashOff;
      card.lowFx = this.lowFx;
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
      // Сами стопки с метками — общая секция каталога (kit/stacks.ts). Ниже — рычаги, которые
      // принадлежат ИМЕННО песочнице: это флаги демо самого движка, а не свойства стопки.
      const r0 = stacksSection(this.sectionCtx(), { x: contentLeft, y: contentTop });
      this.stacks = r0.stacks.map(({ stack, host, dragger, anchor }) => ({ stack, host, dragger, anchor }));
      let y = r0.bottom;
      let width = r0.width;
      const r1 = this.segToggle(contentLeft, y, "режим драга карты:", ["по карте", "всю стопку"], this.stackMode === "one" ? 0 : 1, (i) => (this.stackMode = i === 0 ? "one" : "whole"));
      this.stackModeButtons = r1.buttons;
      y = r1.bottom + SB_ITEM_GAP;
      width = Math.max(width, r1.width);
      const r2 = this.segToggle(contentLeft, y, "при драге стопки:", ["рассыпью", "в руку"], this.dragSqueeze ? 1 : 0, (i) => (this.dragSqueeze = i === 1));
      this.stackSqueezeButtons = r2.buttons;
      y = r2.bottom + SB_ITEM_GAP;
      width = Math.max(width, r2.width);
      // «реордер стопок:» — общий тумблер на ВСЕ три демо-стопки разом (Stack.Configurable сам по
      // себе — про ОДНУ стопку; адаптер сверху даёт attachControls+Toggle, не меняя поведение
      // «один переключатель — все стопки»).
      const reorderAll: Configurable = {
        params: () => [{ kind: "bool", id: "reorderAll", label: "реордер стопок:", get: () => this.stacks[0]?.stack.reorder ?? true, set: (v) => this.stacks.forEach((st) => (st.stack.reorder = v)) }],
      };
      const rc = this.sectionCtx().controls(reorderAll, { x: contentLeft, y });
      this.stackReorderToggle = rc.toggles[0] ?? null;
      return { bottom: rc.bottom, width: Math.max(width, rc.toggles[0]?.w ?? 0) };
    });
  }

  // Ряд «Фишки и фигуры» — общая секция каталога (kit/pieces.ts).
  private buildPieces(left: number, top: number): number {
    return this.sectionFrame(left, top, "Фишки и фигуры", (contentLeft, contentTop) => {
      const r = piecesSection(this.sectionCtx(), { x: contentLeft, y: contentTop });
      this.chipPile = r.pile; // грип столбика фишек — для e2e-хука pileGrip
      return r;
    });
  }

  // Живой не-карточный элемент: визуал берём из реестра по спеке (pieceKinds), дальше как карту
  // (snapTo → слой → реестр byId → список pieces). r — радиус; размер элемента r*2.
  private spawnPiece(id: string, home: { x: number; y: number }, spec: PieceSpec, r: number, depth?: number, plan: PiecePlan = {}): void {
    const { build, shadow, flatten } = pieceVisual(spec, r);
    const piece = new Piece({ id, w: r * 2, h: r * 2, build, shadow, flatten, ...plan });
    // Тень — СНИМОК самого визуала (см. Piece.setSilhouette): рисовать контур по типу значит
    // однажды дать коню тень пешки.
    if (this.app) piece.setSilhouette(this.app.renderer.generateTexture({ target: piece.root, resolution: 2 }));
    piece.flashOff = this.flashOff;
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

  // Навесить стандартный грип стенда + якорь на ЛЮБОЙ host. Механизм — в SceneEngine; здесь
  // только «как это выглядит у нас» (иконки и геометрия грипа общие с каталогом, kit/markerIcons).
  private attachGrip(host: MarkerHost, lead: () => Elem | null, anchorDraw: (g: Graphics) => void, anchorShow: ShowPolicy): { dragger: Marker; anchor: Marker } {
    return this.mountMarkers(host, lead, gripConfig(this.cardH), { draw: anchorDraw, show: anchorShow });
  }

  // Метки на ОДИНОЧНЫЙ элемент по id (host отдаёт SingleDrag). Соло-карта и соло-фигура одинаково.
  private attachSolo(id: string, slot: { x: number; y: number }, anchorDraw: (g: Graphics) => void, anchorShow: ShowPolicy, label: string): { dragger: Marker; anchor: Marker; host: MarkerHost } {
    const lead = () => this.byId.get(id) ?? null;
    const host: MarkerHost = {
      slotPos: () => slot,
      state: () => this.soloState(id),
      makePayload: (cp) => {
        const el = this.byId.get(id);
        return el ? new SingleDrag(el, this.dragCtx, cp) : null;
      },
    };
    const { dragger, anchor } = this.attachGrip(host, lead, anchorDraw, anchorShow);
    this.solos.push({ host, dragger, anchor, lead, label });
    return { dragger, anchor, host };
  }

  // «Ручка» стопки: еле видна (аффорданс, не мусор). grip — три точки, tab — пилюля; обе под низом
  // стопки. Возвращает прямоугольник хит-зоны (в координатах контента) или null (без ручки).
  // Состояние стопки для меток: сколько карт живо (в byId) и сколько стоит дома (не в драге).
  private stackState(ids: readonly string[]): MarkerState {
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
  private makeStackPayload(ids: readonly string[], cp: { x: number; y: number }): DragPayload | null {
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
      // fit: "content" — подпись длиннее пресетной ширины, и по умолчанию её ужимало до 59% кегля:
      // рядом с соседями того же уровня это читается как поломка, а не как кнопка. Пусть коробка
      // растёт под текст, а не текст сжимается под коробку.
      const cfg = new Button({ label: "конфиг поля (скоро)", variant: "secondary", size: "sm", fit: "content", disabled: true });
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
        this.cardSpecs.push({ opts: { id, card: DECK52[i]!, faceUp: false, pose: "rest", size: 0.85 }, home: field.homeOf(id), depth: 700 + i, bobPhase: 0 });
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
  private measureBoardConfig(cfg: BoardConfig, extraH: number, extraW = 0): { w: number; h: number } {
    const { bounds } = cfg.layout === "ring" ? this.ringBounds(0, 22, cfg.cell, cfg.ringCount ?? 8) : this.gridBounds(0, 22, cfg.cols, cfg.rows, cfg.cell, cfg.gap ?? 8);
    return { w: bounds.w + extraW, h: bounds.y + bounds.h + 8 + extraH };
  }

  // Ширина лог-бокса «называю масть» (issue #62) — он живёт СПРАВА от select-демо, на уровне верха
  // борда (в зоне видимости), поэтому footprint демо-айтема шире борда на бокс + зазор.
  private selNameBoxW(): number {
    return this.cardW * 2.4;
  }

  // Ячейка select-демо — как у grid-пресетов (cellForPreset без ring). Отдельный хелпер: демо
  // строит BoardConfig напрямую (несёт джокер-custom, чего string-слоты BoardPreset не умеют).
  private selectDemoCell(): { w: number; h: number } {
    return { w: this.cardW * 1.15, h: this.cardH * 1.02 };
  }

  private selectDemoConfig(idPrefix: string, cell: { w: number; h: number }): BoardConfig {
    // 6 карт + джокер в сетке 4×2 (слот 0,3 пуст — цель для драга набора; джокер в 1,3 — чтобы «???»
    // лог-бокса #62 было видно живьём). Ранги нарочно вразнобой (10/6/8/A/7/Q), в т.ч. 6/8/10 — чтобы
    // «сорт по номиналу» был виден и на 6+ фигурах помещался без overflow (issue #48, баги «6 карт»/«сорт»).
    const card = (face: string): ElementDef => ({ kind: "card", face });
    return {
      title: "выделение (изолир., тащи набор, сорт по номиналу)",
      cols: 4,
      rows: 2,
      cell,
      idPrefix,
      onOccupied: "merge",
      slots: {
        "0,0": [card("10♠")],
        "0,1": [card("6♣")],
        "0,2": [card("8♥")],
        "1,0": [card("A♦")],
        "1,1": [card("7♣")],
        "1,2": [card("Q♠")],
        "1,3": [{ kind: "card", face: "", custom: "joker" }], // джокер: card без масти → «???» в логе #62
      },
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
      const SELECT_EXTRA_H = 305; // кнопки выделение/снять + тумблеры сборки/отбора + 2 тумблера дропа мимо зон (#63)
      const CHROME_EXTRA_H = 50; // хинт-подсказка + отступ (шахматы/смешанный)

      interface BoardItem {
        size: { w: number; h: number };
        render: (x: number, y: number) => number;
      }
      const items: BoardItem[] = BOARD_PRESETS.map((preset, pi) => ({
        size: this.measureBoardConfig(this.presetToBoardConfig(preset, `bz${pi}`, this.cellForPreset(preset)), PRESET_EXTRA_H),
        render: (x, y) => this.buildOneBoard(x, y, preset, pi),
      }));
      items.push({
        size: this.measureBoardConfig(this.selectDemoConfig(`bz${BOARD_PRESETS.length}`, this.selectDemoCell()), SELECT_EXTRA_H, SB_ITEM_GAP + this.selNameBoxW()),
        render: (x, y) => this.buildSelectDemo(x, y, BOARD_PRESETS.length),
      });
      items.push({ size: this.measureBoardConfig(this.chessBoardConfig(), CHROME_EXTRA_H), render: (x, y) => this.buildChessBoard(x, y) });
      items.push({ size: this.measureBoardConfig(this.mixedBoardConfig(), CHROME_EXTRA_H), render: (x, y) => this.buildMixedBoard(x, y) });
      items.push({ size: this.measureBoardConfig(this.capabilityBoardConfig(), CHROME_EXTRA_H), render: (x, y) => this.buildCapabilityBoard(x, y) });

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
  private registerBoardZone(title: string, left: number, top: number, positioned: PositionedSlot[], bounds: { x: number; y: number; w: number; h: number }, slots: Board["slots"], onOccupied: OnOccupied, opts?: { rule?: AcceptRule; labelText?: string; requiresCapability?: keyof PileIdentity["capabilities"] }): BoardZone {
    const zone = new BoardZone({ slots: positioned, board: { slots, onEmpty: "keep" }, bounds, onOccupied, rule: opts?.rule, requiresCapability: opts?.requiresCapability });
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
      this.cardSpecs.push({ opts: { id, card: def.face, custom: def.custom, pose: "rest", size: def.size ?? 0.86 }, home, depth, bobPhase: 0 });
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
    const zone = this.registerBoardZone(cfg.title, left, top, positioned, bounds, slots, cfg.onOccupied, { labelText: cfg.labelText, rule, requiresCapability: cfg.requiresCapability });
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
    const cfg = this.selectDemoConfig(`bz${pi}`, this.selectDemoCell());
    const { zone, bottom } = this.mountBoard(cfg, left, top, 300 + pi * 100);
    this.selZone = zone;
    this.selMode = false; // сессия закрыта; активируется при первом выбранном (#66)
    this.selTrigger = "off"; // способ входа дефолтом ВЫКЛ — без явного действия выделения нет

    // Сборка набора — рычаги как ДАННЫЕ (issue #56, SELECTION-DESIGN §4–5). Один конфиг selAssembly
    // вместо прежних «сорт набора»/«сборка»: тестер крутит рычаги ПО отдельности или берёт готовый
    // пресет (тот пересинхронивает золотую черту form/order/sort). Дефолт — пресет grab-to-hand.
    this.selAssembly = { ...ASSEMBLY_PRESETS[DEFAULT_PRESET]! };
    this.selPresetName = "drag-start"; // = grab-to-hand (issue #74: имя схемы для UI, дефолт не меняется)
    // Отбор-визуал (issue #60) — дефолт как в примере: только карты, без подсказки, метка «оба».
    this.selVisual = { eligible: ELIGIBLE.cards!, hintEligible: false, mark: "both" };
    this.selEligibleName = "cards";
    this.selDropPolicy = { ...DEFAULT_DROP_POLICY }; // #63 — дефолты: merge off, keep on, anchor primary
    this.selOutlines.clear(); // контуры прежнего билда уничтожены вместе с root карт при пересборке контента
    const t1 = bottom + 34;
    // Три способа входа в выделение (#66): выкл / по зажатию (long-press) / по нажатию (tap). Тумблер
    // задаёт ТРИГГЕР, а не активность — сессия открывается выбором карты (см. selEntry). off чистит набор.
    const triggers: Array<"off" | "hold" | "tap"> = ["off", "hold", "tap"];
    this.selMultiButtons = this.segToggle(left, t1, "выделение:", ["выкл", "по зажатию", "по нажатию"], Math.max(0, triggers.indexOf(this.selTrigger)), (i) => {
      this.selTrigger = triggers[i]!;
      if (this.selTrigger === "off") this.setSelection(begin("sel")); // выкл → закрыть сессию и погасить набор
      this.refreshSel();
      this.wake();
    }).buttons;

    const forms: Form[] = ["stack-tight", "stack-open", "row", "fan"];
    const orders: NaturalOrder[] = ["proximity", "selection"];
    const overrides: SortOverride[] = ["none", "rank", "suit", "center"];
    // Три именованные схемы issue #74 (drag-start/follow-first/follow-last) — идут ПЕРВЫМИ, чтобы
    // анимацию сборки было легко переключить и сравнить глазами; tray-zone/sorted-row — старые демо
    // v1 остаются рядом (гибрид: пресет + отдельные рычаги поверх).
    const presets = ["drag-start", "follow-first", "follow-last", "tray-zone", "sorted-row"];
    const formIdx = (f: Form) => Math.max(0, forms.indexOf(f));
    const orderIdx = (o: NaturalOrder) => (o === "proximity" ? 0 : 1); // append ≈ selection (оба «по нажатию»)
    const overrideIdx = (s: SortOverride) => Math.max(0, overrides.indexOf(s));

    const form = this.segToggle(left, t1 + 26, "форма:", ["стопка", "раскрыт", "ряд", "веер"], formIdx(this.selAssembly.form), (i) => (this.selAssembly.form = forms[i]!));
    this.selFormButtons = form.buttons;
    const order = this.segToggle(left, t1 + 52, "порядок:", ["расположение", "выбор"], orderIdx(this.selAssembly.order), (i) => (this.selAssembly.order = orders[i]!));
    this.selOrderButtons = order.buttons;
    const sort = this.segToggle(left, t1 + 78, "сорт:", ["—", "номинал", "масть", "центр"], overrideIdx(this.selAssembly.sortOverride), (i) => (this.selAssembly.sortOverride = overrides[i]!));
    this.selSortButtons = sort.buttons;

    // gatherOn/anchor (issue #71, SELECTION-DESIGN §4.B/§4.C) — самостоятельные рычаги, а не только
    // поля внутри пресета. Связка валидируется ЧИСТОЙ функцией isValidGatherAnchor (assembly.ts):
    // невалидные варианты якоря БЛОКИРУЮТСЯ (disabled), а не молча принимаются. Пресет по-прежнему
    // выставляет оба рычага разом; после — гибрид (крутишь каждый рычаг отдельно поверх пресета).
    const gatherModes: GatherOn[] = ["drag-start", "select-each", "select-first", "never"];
    const anchors: Anchor[] = ["finger", "first", "latest", "zone"];
    const gatherIdx = (g: GatherOn) => Math.max(0, gatherModes.indexOf(g));
    const anchorIdx = (a: Anchor) => Math.max(0, anchors.indexOf(a));
    // Перекрасить disabled на кнопках якоря под ТЕКУЩИЙ gatherOn; если текущий anchor стал невалиден,
    // клампим на первый допустимый и подтягиваем золотую черту (не молчим — видимая перестройка).
    const refreshAnchorValidity = (anchorToggle: { buttons: Button[]; setMark: (i: number) => void }) => {
      const valid = validAnchorsFor(this.selAssembly.gatherOn);
      anchors.forEach((a, i) => anchorToggle.buttons[i]!.setDisabled(!valid.includes(a)));
      if (!isValidGatherAnchor(this.selAssembly.gatherOn, this.selAssembly.anchor)) {
        this.selAssembly.anchor = valid[0]!;
        anchorToggle.setMark(anchorIdx(this.selAssembly.anchor));
      }
      this.wake();
    };
    const gather = this.segToggle(left, t1 + 104, "собирать:", ["на драг", "на каждый выбор", "на первый выбор", "никогда"], gatherIdx(this.selAssembly.gatherOn), (i) => {
      this.selAssembly.gatherOn = gatherModes[i]!;
      refreshAnchorValidity(anchor);
    });
    this.selGatherButtons = gather.buttons;
    const anchor = this.segToggle(left, t1 + 130, "якорь:", ["палец", "первая", "последняя", "зона"], anchorIdx(this.selAssembly.anchor), (i) => {
      const picked = anchors[i]!;
      if (!isValidGatherAnchor(this.selAssembly.gatherOn, picked)) return; // невалидная связка — клик игнорируется (кнопка и так disabled)
      this.selAssembly.anchor = picked;
    });
    this.selAnchorButtons = anchor.buttons;
    refreshAnchorValidity(anchor); // применить disabled сразу при монтировании (дефолт-пресет валиден, но рычаг должен красить с первого кадра)

    // Пресет берёт ВЕСЬ конфиг из ASSEMBLY_PRESETS и пересинхронит черту остальных тумблеров (setMark
    // не дёргает их onPick). Отдельные рычаги после этого дают гибрид, но selPresetName не сбрасывают.
    const presetToggle = this.segToggle(left, t1 + 156, "пресет:", ["драг", "1-я", "послед.", "лоток", "ряд↑"], Math.max(0, presets.indexOf(this.selPresetName)), (i) => {
      const name = presets[i]!;
      this.selPresetName = name;
      this.selAssembly = { ...ASSEMBLY_PRESETS[name]! };
      form.setMark(formIdx(this.selAssembly.form));
      order.setMark(orderIdx(this.selAssembly.order));
      sort.setMark(overrideIdx(this.selAssembly.sortOverride));
      gather.setMark(gatherIdx(this.selAssembly.gatherOn));
      refreshAnchorValidity(anchor);
      anchor.setMark(anchorIdx(this.selAssembly.anchor));
    });
    this.selPresetButtons = presetToggle.buttons;

    // Отбор-визуал (issue #60, SELECTION-DESIGN §4.A) — три ортогональных рычага-ДАННЫХ рядом со сборкой.
    const eligibleNames: EligibleName[] = ["cards", "diamonds", "any"];
    const eligible = this.segToggle(left, t1 + 182, "выбор:", ["карты", "буби", "любые"], Math.max(0, eligibleNames.indexOf(this.selEligibleName)), (i) => {
      this.selEligibleName = eligibleNames[i]!;
      this.selVisual.eligible = ELIGIBLE[this.selEligibleName]!;
      this.refreshSel(); // пересчитать подсказку/убрать контуры того, что стало неподходящим (набор сам не трогаем)
      this.wake();
    });
    this.selEligibleButtons = eligible.buttons;
    const hint = this.segToggle(left, t1 + 208, "подсказка:", ["выкл", "вкл"], this.selVisual.hintEligible ? 1 : 0, (i) => {
      this.selVisual.hintEligible = i === 1;
      this.refreshSel();
      this.wake();
    });
    this.selHintButtons = hint.buttons;
    const marks: Mark[] = ["lift", "outline", "both"];
    const mark = this.segToggle(left, t1 + 234, "метка:", ["подъём", "контур", "оба"], Math.max(0, marks.indexOf(this.selVisual.mark)), (i) => {
      this.selVisual.mark = marks[i]!;
      this.refreshSel();
      this.wake();
    });
    this.selMarkButtons = mark.buttons;

    // Дроп набора МИМО зон (issue #63, dropPolicy.ts) — ДВЕ ортогональные оси-ДАННЫЕ. «сшивать»:
    // off домой / on сшить стопкой (якорь primary) / custom предикат (демо «только ♣»). «выделение
    // после»: on сохранить / off снять / custom (демо «только ♦»). Дефолты: сшивать=нет, выделение=да.
    const mergeModes: DropMode[] = ["off", "on", "custom"];
    const merge = this.segToggle(left, t1 + 260, "сшивать:", ["нет", "да", "только ♣"], Math.max(0, mergeModes.indexOf(this.selDropPolicy.merge)), (i) => {
      this.selDropPolicy.merge = mergeModes[i]!;
    });
    this.selMergeButtons = merge.buttons;
    const keepModes: DropMode[] = ["on", "off", "custom"];
    const keep = this.segToggle(left, t1 + 286, "выделение после:", ["да", "нет", "только ♦"], Math.max(0, keepModes.indexOf(this.selDropPolicy.keepSelection)), (i) => {
      this.selDropPolicy.keepSelection = keepModes[i]!;
    });
    this.selKeepButtons = keep.buttons;

    // Лог-дропбокс «называю масть» (issue #62) — ТЕСТ-обвязка #61 СПРАВА от борда, на уровне его верха
    // (в зоне видимости — набор можно вытащить сюда наружу, демо-борд анкламплен). Принимает ТОЛЬКО
    // карты (тег `card`, кастомные тоже), НИЧЕГО не хранит: на дропе набора выписывает уникальные масти
    // в консоль (и хук lastNamedSuits), карты летят домой.
    const boardW = 4 * this.selectDemoCell().w + 3 * 8; // cols=4, gap=8 (как в gridBounds)
    const box = new DropZone({ name: "называю масть", verb: "называю!", rect: { x: left + boardW + SB_ITEM_GAP, y: top + 22, w: this.selNameBoxW(), h: this.cardW * 1.1 } });
    this.selNameZone = box;
    this.registerZone(box, (p) => this.nameSuits([p.lead.id]), (p) => p.lead.tags.has("card"));

    // Primary-кнопка СБРОСА (issue #64) — под боксом «называю масть», по центру его rect. Клик гасит
    // набор (остаётся в режиме). Видна ТОЛЬКО когда в наборе ≥1 (syncResetButton по refreshSel).
    const reset = new Button({ label: "сбросить", variant: "primary", size: "sm", onClick: () => this.clearSelection() });
    const r = box.rect;
    reset.place(r.x + r.w / 2, r.y + r.h + 14 + reset.h / 2);
    this.registerButton(reset);
    this.selResetButton = reset;
    this.syncResetButton(); // исходно скрыта (набор пуст)
    return t1 + 312; // два тумблера дропа (#63): «сшивать» t1+260, «выделение после» t1+286
  }

  // Кнопка сброса (#64) видна лишь при непустом наборе — иначе гасить нечего, а висящая кнопка
  // читается как «застряла» (тот же довод, что был у ghost-«снять», issue #48 баг №6). Зовём из refreshSel.
  private syncResetButton(): void {
    if (this.selResetButton) this.selResetButton.root.visible = this.sel.ids.length >= 1;
  }

  // Выписать уникальные масти набора в консоль + хук (issue #62). Идентичность (теги) → pileIdentity,
  // подписи (дедуп, «???» для карт без масти) → suitNames. Чистый лог: состояние не трогаем.
  private nameSuits(ids: string[]): void {
    const els = ids.map((id) => this.byId.get(id)).filter((e): e is Elem => !!e);
    const names = namedSuits(pileIdentity(els).tagsAny, els.map((e) => e.tags));
    this.lastNamedSuits = names;
    // eslint-disable-next-line no-console
    console.log("называю масть:", names.join(", "));
  }

  // ——— изолированный мультиселект (selection.ts) ———
  // Единая запись набора (#66): сессия выделения активна ⇔ набор непуст. Все мутации идут сюда, чтобы
  // selMode не разъезжался с составом (пустой набор = выход из сессии, карты снова обычные).
  private setSelection(s: Selection): void {
    this.sel = s;
    this.selMode = s.ids.length > 0;
  }

  private clearSelection(): void {
    this.setSelection(begin("sel")); // «сбросить» — пустой набор → выход из сессии (#66)
    this.refreshSel();
    this.wake();
  }

  // Удержание доиграло (hold-mode, issue #66): обрываем начатый одиночный драг, входим в сессию,
  // берём карту. Если палец успел поехать или отпустить — selEntry уже снят, сюда не доходим.
  private fireHoldEntry(): void {
    const e = this.selEntry;
    if (!e || this.selMode) return;
    this.selEntry = null;
    this.drag?.release(); // карта возвращается домой (жест «съеден» удержанием)
    this.drag = null;
    this.input.reset(); // палец ещё на экране, но это уже не драг
    this.toggleSelectFigure(e.id); // выбрать + открыть сессию
    this.wake();
  }

  // Снять взвод входа-по-карте (issue #66): очистить таймер удержания и кандидата.
  private cancelSelEntry(): void {
    if (this.selEntry?.timer) clearTimeout(this.selEntry.timer);
    this.selEntry = null;
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
    // Вход-по-карте (#66) открывает сессию БЕЗ отдельной кнопки: если scope ещё не задан (sel.scope
    // null), begin его здесь — иначе toggle изоляции сделал бы no-op (см. selection.toggle).
    const base = this.sel.scope === null ? begin("sel") : this.sel;
    this.setSelection(toggle(base, id, "sel")); // тоггл + синк selMode (пустой → выход из сессии)
    this.refreshSel();
    // gather-на-селект (issue #74): при select-each набор летит в форму СРАЗУ на тапе, не ждёт драга.
    if (this.selAssembly.gatherOn === "select-each") this.gatherSelectEach();
    this.wake();
  }

  // Собрать выделенный набор В МЕСТЕ (без драга) для gatherOn=select-each (issue #74, follow-first/
  // follow-last): пересчитывает order+override+форму (assembleSelection — те же чистые атомы, что и
  // у drag-start), переносит офсеты на якорную карту (`reanchorOffsets`, first→сама не двигается,
  // latest→растущий хвост подтягивается к новейшей) и реально АНИМИРУЕТ каждую карту к цели через
  // `body.setTarget` — та же пружина, что у обычного возврата домой/мержа (releaseElement/
  // mergeStackOnto), никакой новой физики. Якорь берёт СВОЙ дом (homeOf) — он не сдвигается сам по
  // себе, вся стопка подстраивается ПОД него.
  private gatherSelectEach(): void {
    const { orderedIds, offsets } = this.assembleSelection();
    if (orderedIds.length === 0) return;
    const anchorIdx = anchorIndexFor(this.selAssembly.anchor, orderedIds.length);
    const anchored = reanchorOffsets(offsets, anchorIdx);
    const anchorEl = this.byId.get(orderedIds[anchorIdx]!);
    const h = anchorEl && this.homeOf(anchorEl);
    if (!h) return;
    orderedIds.forEach((id, i) => {
      const el = this.byId.get(id);
      const off = anchored[i];
      if (!el || !off) return;
      el.root.zIndex = h.depth + 1 + i; // порядок сборки сверху = порядок в orderedIds
      this.placeCard(el);
      el.body.setTarget({ x: h.home.x + off.dx, y: h.home.y + off.dy, rot: off.rot ?? 0 });
    });
  }

  // Подходит ли фигура под текущий eligible-предикат (по её тегам). Чужая/отсутствующая → нет.
  private canSelectId(id: string): boolean {
    const el = this.byId.get(id);
    return !!el && canSelect(el.tags, this.selVisual.eligible);
  }

  // Собрать текущий набор по конфигу selAssembly (issue #56): упорядочить (order+override) и разложить
  // по форме. press = позиция в sel.ids (порядок нажатия), x/y — позиция фигуры на столе (для proximity),
  // face — лицо (для override rank/suit). orderedIds и offsets выровнены индекс-в-индекс (см. assemble).
  private assembleSelection(): { orderedIds: string[]; offsets: { id: string; dx: number; dy: number; rot?: number }[] } {
    const items: CollectItem[] = this.sel.ids.map((id, press) => {
      const el = this.byId.get(id);
      return { id, press, x: el?.body.px ?? 0, y: el?.body.py ?? 0, face: this.faceOf.get(id) ?? "" };
    });
    return assemble(items, this.selAssembly, this.cardW);
  }

  // Подсветка: выделенные — приподняты (lifted), остальные — на столе. setState меняет УРОВЕНЬ
  // тени (levelOf → слой shadows.<level>), поэтому спрайт обязан переехать в ПАРНЫЙ слой того же
  // уровня (placeCard) — иначе тень lifted уедет выше спрайта, застрявшего в idle (issue #55).
  private refreshSel(): void {
    if (!this.selZone) return;
    const lift = shouldLift(this.selVisual.mark); // поднимать ли выбранное во lifted
    const outline = shouldOutline(this.selVisual.mark); // рисовать ли контур у выбранного
    const hintOn = this.selVisual.hintEligible && this.sel.ids.length > 0; // подсветка выбираемых — только когда в наборе ≥1
    for (const key of Object.keys(this.selZone.board.slots)) {
      for (const id of this.selZone.board.slots[key]!.members) {
        const el = this.byId.get(id);
        if (!el) continue;
        const selected = hasSel(this.sel, id);
        // Подъём — только если метка его разрешает (mark=outline держит карту на столе).
        el.setState(selected && lift ? "lifted" : "rest");
        this.placeCard(el); // держим спрайт и его тень в одном уровне
        // Контур: у выбранного при mark∈{outline,both}; иначе — подсказка выбираемым-невыбранным; иначе снять.
        const kind = selected && outline ? "select" : hintOn && !selected && this.canSelectId(id) ? "hint" : "none";
        this.setSelOutline(el, kind);
      }
    }
    this.syncResetButton(); // кнопка сброса (#64) следует за размером набора
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

  // Слепая capability-gated зона (SELECTION-DESIGN §6, issue #73 — follow-up к #72): та же цепочка
  // элемент→зона→engine, здесь ТОЛЬКО данные конфигурации. 0,0 — карта (Card реализует Peekable),
  // 0,1 — фишка (Piece её НЕ реализует), 0,2 — пустой capability-gated слот. Дроп карты в 0,2
  // принят, дроп фишки — отклонён (остаётся на месте), в точности как в boardZone.test.ts.
  private capabilityBoardConfig(): BoardConfig {
    return {
      title: "слепая зона: «подглядеть» (requiresCapability=peekable, §6)",
      cols: 3,
      rows: 1,
      cell: { w: this.cardW * 1.15, h: this.cardH * 1.02 },
      idPrefix: "capz",
      onOccupied: "merge",
      pieceRatio: 0.3,
      requiresCapability: "peekable",
      slots: {
        "0,0": [{ kind: "card", face: "Q♦" }],
        "0,1": [{ kind: "chip", denom: "10", color: 0x2f6b34 }],
      },
      hint: "карта (peekable) ложится в 0,2 — фишка (не peekable) зона не видит, отскакивает домой",
    };
  }

  // Демо слепой зоны: борд-фабрика та же, что у шахмат/смешанного борда — «новый борд = конфиг».
  private buildCapabilityBoard(left: number, top: number): number {
    const { bottom } = this.mountBoard(this.capabilityBoardConfig(), left, top, 520);
    return bottom + 22;
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

  // Витрина кнопок — общая секция каталога (kit/buttons.ts), песочница даёт ей рамку и хук.
  // Присваивание, а не push: при «⟲ песочница» контент пересобирается, и накопление оставляло бы
  // в хуке уничтоженные кнопки прошлой сборки вперемешку с новыми.
  private buildButtons(left: number, top: number): number {
    return this.sectionFrame(left, top, "Кнопки", (contentLeft, contentTop) => {
      const r = buttonsSection(this.sectionCtx(), { x: contentLeft, y: contentTop });
      this.buttonShowcase = r.showcase;
      return { bottom: r.bottom, width: r.width };
    });
  }


  // ——————————————————————————————————————————————————————————————————————
  // Домен песочницы поверх общего слоя. Жест, камеру, зоны и цикл ведёт SceneEngine; здесь —
  // только то, чего у голой сцены со столом нет: метки-драггеры, стопки, борды, Поле, выделение.
  // ——————————————————————————————————————————————————————————————————————

  // Все перетаскиваемые элементы (карты + фишки/фигуры) — единый хит-тест/список.
  protected draggables(): Elem[] {
    const out: Elem[] = this.cards.map((p) => p.card);
    for (const p of this.pieces) out.push(p.el);
    return out;
  }

  // Захват. Метку-драггер разбирает база (SceneEngine.pickElement); здесь — только то, чего у
  // голой сцены нет: в режиме «всю стопку» карта стопки цепляет ДРАГГЕР своей стопки.
  protected pickElement(cx: number, cy: number): Elem | null {
    const el = super.pickElement(cx, cy);
    if (this.pendingHost) return el; // взяли за метку — цель уже выбрана её host'ом
    if (el && this.stackMode === "whole") {
      const owner = this.stacks.find((s) => el.id !== "" && s.stack.owns(el.id));
      if (owner) {
        this.pendingHost = owner.host;
        this.grabbedMarker = owner.dragger;
      }
    }
    return el;
  }

  // В режиме выделения: ВЫДЕЛЕННУЮ фигуру демо-зоны можно тащить (тянется весь набор),
  // НЕвыделенную — нет (тап тогглит выбор через onElementBlocked). Вне режима — обычная драгабельность.
  protected canDrag(c: Elem): boolean {
    return this.selMode && this.selZone?.locate(c.id) ? hasSel(this.sel, c.id) : c.draggable;
  }

  protected beginDrag(el: Elem, cp: { x: number; y: number }, sp: { x: number; y: number }): boolean {
    // Касание выделенной карты в режиме: НЕ формируем GroupDrag сразу (issue #65) — иначе тап,
    // снимающий выделение, успел бы стянуть набор к пальцу и вернуть. Запоминаем состав/смещения
    // (по selAssembly, issue #56) в selPending; промоушен в GroupDrag — при реальном сдвиге пальца
    // (beforeDragMove). Тап без сдвига → beforeDrop снимет карту, соседей не трогая.
    if (this.selMode && this.selZone && hasSel(this.sel, el.id)) {
      const { orderedIds, offsets } = this.assembleSelection();
      const cards: Elem[] = [];
      const off: { dx: number; dy: number; rot?: number }[] = [];
      orderedIds.forEach((id, i) => {
        const e = this.byId.get(id);
        if (e) {
          cards.push(e);
          off.push({ dx: offsets[i]!.dx, dy: offsets[i]!.dy, rot: offsets[i]!.rot }); // индекс-в-индекс: пропускаем оба, если элемента нет
        }
      });
      this.selGrabCp = { x: cp.x, y: cp.y };
      this.selPending = { cards, offsets: off, leadId: el.id };
      this.pendingHost = null; // взвод метки снимаем: иначе он утёк бы в СЛЕДУЮЩИЙ драг
      return true; // груза пока нет: набор поедет только при реальном сдвиге пальца
    }
    // ВХОД в выделение по карте (issue #66) вне сессии: подходящую карту selZone помечаем кандидатом.
    // tap-mode — вход на тап-релизе (beforeDrop); hold-mode — по таймеру удержания; сдвиг пальца
    // (beforeDragMove) отменяет вход. Драг стартует ниже как обычно — жест тащит одну карту.
    if (!this.selMode && this.selTrigger !== "off" && this.selZone?.locate(el.id) && this.canSelectId(el.id)) {
      this.selEntry = { id: el.id, grabCp: { x: cp.x, y: cp.y }, timer: null };
      if (this.selTrigger === "hold") this.selEntry.timer = setTimeout(() => this.fireHoldEntry(), 500);
    }
    super.beginDrag(el, cp, sp); // груз пачки (host метки) либо одиночная карта — решает база
    this.fieldForCard(el.id)?.beginDrag(); // карта Поля — грид показывает дропзону + «наведи»
    return true;
  }

  protected beforeDragMove(_el: Elem, cp: { x: number; y: number }): boolean {
    // Отложенный драг набора (#65): пока палец в пределах порога тапа — набор НЕ трогаем (соседи
    // стоят). Вышел за порог → промоутим selPending в GroupDrag и с этого момента тащим.
    if (this.selPending) {
      if (Math.hypot(cp.x - this.selGrabCp.x, cp.y - this.selGrabCp.y) <= 8) return true;
      const p = this.selPending;
      this.selPending = null;
      this.selDragging = p.cards.map((e) => e.id);
      this.drag = new GroupDrag(p.cards, p.offsets, this.dragCtx);
    }
    // Палец поехал за порог → это обычный драг одной карты, а не вход в выделение (#66): снять взвод.
    if (this.selEntry && Math.hypot(cp.x - this.selEntry.grabCp.x, cp.y - this.selEntry.grabCp.y) > 8) this.cancelSelEntry();
    return false;
  }

  // Фигура БОРДА заперта в рамке своей зоны (clamp). Фигура Поля — не в boardZones → не клампится.
  // Демо-борд «Выделение» (selZone) — БЕЗ клампа (issue #62): набор нужно вытащить наружу к
  // лог-боксу «называю масть»; прочие борды клампятся как были.
  protected dragPoint(cp: { x: number; y: number }): { x: number; y: number } {
    const bz = this.drag ? this.boardZoneOf(this.drag.lead.id) : null;
    return bz && bz !== this.selZone ? bz.clamp(cp, { w: this.cardW / 2, h: this.cardH / 2 }) : cp;
  }

  protected onDragMoved(p: { x: number; y: number }): void {
    super.onDragMoved(p); // метка едет за пальцем — общее поведение стола
    if (!this.drag) return;
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

  protected beforeDrop(el: Elem, cp: { x: number; y: number }): boolean {
    // Тап по выделенной карте: набор так и не начал движение (палец не вышел за порог, selPending
    // жив, GroupDrag не создан) — просто снимаем карту из набора, соседей НЕ трогаем (issue #65).
    if (this.selPending) {
      this.selPending = null;
      this.toggleSelectFigure(el.id);
      return true;
    }
    // Вход-тап по карте (issue #66): в tap-mode тап (без сдвига) по подходящей карте открывает
    // сессию и выбирает её; обычный одиночный драг отменяем (карта домой). В hold-mode тап входа
    // не даёт — падаем в обычную обработку (карта домой). Драг (сдвиг) сюда не доходит: selEntry
    // снят в beforeDragMove, жест идёт как одиночный драг.
    if (this.selEntry) {
      const e = this.selEntry;
      this.cancelSelEntry();
      if (this.selTrigger === "tap" && Math.hypot(cp.x - e.grabCp.x, cp.y - e.grabCp.y) <= 8) {
        this.drag?.release();
        this.drag = null;
        this.toggleSelectFigure(e.id);
        return true; // метку и подсветку зон снимет база (afterDragEnd + setHot(false))
      }
    }
    return false;
  }

  protected resolveDrop(el: Elem, cp: { x: number; y: number }): void {
    const drag = this.drag;
    if (!drag) return;
    if (this.selDragging && this.selZone) {
      const dragged = Math.hypot(cp.x - this.selGrabCp.x, cp.y - this.selGrabCp.y) > 8; // тап vs драг
      if (dragged && this.selNameZone?.contains(cp.x, cp.y)) {
        // Лог-бокс «называю масть» (issue #62): чисто лог мастей набора, без хранения/политики —
        // карты летят домой, набор сохраняем (можно называть повторно). Проверяем ДО dropSetAt:
        // бокс живёт вне борда, куда набор теперь можно вытащить (демо-борд анкламплен).
        this.nameSuits(this.selDragging);
        this.refreshZoneHomes(this.selZone);
        drag.release();
      } else if (dragged) {
        // Набор в целевой слот в УЖЕ решённом на грабе порядке (selDragging, issue #56). Дроп
        // В ЗОНУ (moved) гасит выбор и остаётся как был. Дроп МИМО зон — по ДВУМ осям политики
        // (issue #63, dropPolicy.ts): merge (сшить/домой) + keepSelection (оставить/снять), per-card.
        // pile — идентичность ВСЕГО набора (issue #72): зона сама решает элемент→зона→engine,
        // слепая зона (requiresCapability, §6) без неё не отличит гибрид от однородного набора.
        const dragEls = this.selDragging.map((id) => this.byId.get(id)).filter((e): e is Elem => !!e);
        const { moved } = this.selZone.dropSetAt(this.selDragging, cp.x, cp.y, pileIdentity(dragEls));
        if (moved) {
          this.refreshZoneHomes(this.selZone);
          drag.release();
          this.setSelection(begin("sel")); // набор ушёл в зону → пусто → выход из сессии (#66)
        } else {
          this.applyDropOutside(this.selDragging); // мимо зон — две оси
        }
      } else {
        drag.release(); // тап по выделенной — снять её из набора
        this.toggleSelectFigure(el.id);
      }
      this.refreshSel();
      this.selDragging = null;
      return;
    }
    const fld = this.fieldForCard(drag.lead.id);
    const bz = fld ? null : this.boardZoneOf(drag.lead.id);
    if (fld) {
      // ПОЛЕ: делегируем модулю (стопка→грид → раскрыть; в гриде + реордер → переставить; мимо → назад).
      const { flip } = fld.place(drag.lead.id, cp);
      if (flip) {
        const e = this.byId.get(drag.lead.id);
        if (e && "requestFlip" in e) (e as { requestFlip(): boolean }).requestFlip(); // раскрыть в гриде
      }
      fld.endDrag(); // СНАЧАЛА закрыть дыру (иначе дома лягут в раздвинутые позиции)
      this.applyFieldHomes(fld);
      drag.release(); // тащимая едет в свой (возможно новый) home
    } else if (bz && this.selNameZone?.contains(cp.x, cp.y) && drag.lead.tags.has("card")) {
      // Лог-бокс «называю масть» (#62) принимает карты и ВНЕ селекта: одиночную карту БОРДА,
      // брошенную на бокс, логируем и отпускаем домой (бокс ничего не хранит). Ловим ДО bz.dropAt —
      // иначе карта борда ушла бы в резолв слота, минуя бокс (standalone-карты и стопки достигают
      // бокса через генерик-ветку зон ниже; у карты борда bz != null).
      this.nameSuits([drag.lead.id]);
      drag.release();
    } else if (bz) {
      // Борд: резолвим целевой слот, исход по onOccupied; вытесненных (capture) уводим. pile —
      // идентичность тащимого (issue #73): зона-слой (requiresCapability, §6) без него оставалась
      // бы всегда прозрачной для обычного одиночного драга — видимая слепая зона требует его тут же.
      const res = bz.dropAt(drag.lead.id, cp.x, cp.y, pileIdentity([drag.lead]));
      if (res.captured) this.exileFigures(res.captured);
      this.refreshZoneHomes(bz);
      drag.release(); // летит в (возможно новый) home
    } else {
      // Стопка: ОДИНОЧНЫЙ драг, упавший НА свою стопку → реордер по позиции. Пачка (GroupDrag) и
      // дропы мимо стопки — не реордер, идут в общий разбор зон (переворот/сжечь/вернуть домой).
      const stk = drag instanceof GroupDrag ? null : this.stackForCard(drag.lead.id);
      stk?.stack.clearGap(); // закрыть дыру перед применением домов
      if (stk && stk.stack.place(drag.lead.id, cp).moved) {
        this.applyStackHomes(stk);
        drag.release();
      } else {
        super.resolveDrop(el, cp); // зона реагирует на СПОСОБНОСТИ груза, не на его тип
        if (stk) this.applyStackHomes(stk); // дыру закрыли — вернуть раздвинутые карты на место
      }
    }
  }

  protected onDragCancel(): void {
    this.selPending = null; // отложенный драг набора (#65) отменён — соседи и так не двигались
    this.cancelSelEntry(); // взвод входа-по-карте (#66) снят
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
  }

  /** Палец поехал по тому, что тащить нельзя, — отказ качанием. */
  protected onElementBlocked(el: Elem): void {
    el.blockNudge();
  }

  /** Тап по невыделенной фигуре демо-зоны — это ВЫБОР, а не отказ (issue #48/#66). */
  protected onElementTapped(el: Elem): void {
    if (this.selMode && this.selZone?.locate(el.id)) this.toggleSelectFigure(el.id);
    else el.blockNudge();
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
  /**
   * Переставить дом элемента. Своей реализации переворота пачки у песочницы больше нет — она
   * общая (SceneEngine.flipGroup), и это тот же долг, что был у секций: одна сцена умела, вторая
   * нет. Здесь остаётся ровно то, чего общий движок знать не может, — свой реестр и своя `Stack`.
   */
  protected override setHome(el: Elem, home: { x: number; y: number }, depth: number): void {
    const p = this.cards.find((c) => c.card === el);
    if (!p) return;
    p.home = { ...home };
    p.depth = depth;
    el.root.zIndex = depth;
  }

  protected override flipGroup(els: readonly SceneElement[]): void {
    super.flipGroup(els);
    // Модель стопки о перевороте знать обязана: порядок карт — её данные, а не картинка.
    // Реверс домов уже сделан общим движком; здесь разворачивается сама модель.
    if (this.preset.stackFlip.reverse) {
      const st = this.stacks.find((s) => els.every((el) => s.stack.owns(el.id)));
      st?.stack.reverse();
    }
  }

  // Дом элемента (позиция покоя + глубина) — среди карт или фишек/фигур. Возврат домой пружиной
  // делает общий releaseElement (SceneEngine), ему нужен только этот ответ.
  protected homeOf(el: Elem): { home: { x: number; y: number }; depth: number } | null {
    const c = this.cards.find((p) => p.card === el);
    if (c) return { home: c.home, depth: c.depth };
    const p = this.pieces.find((q) => q.el === el);
    return p ? { home: p.home, depth: p.depth } : null;
  }

  // Дроп набора МИМО зон — ДВЕ ортогональные оси (issue #63, dropPolicy.ts), решаются per-card:
  //   merge — сшить (собрать в стопку на слот-дом primary, #67) или уйти домой;
  //   keepSelection — остаётся ли карта выделенной после дропа.
  // Якорь primary (дефолт): сшитые карты СОБИРАЮТСЯ на исходный слот ВЕДУЩЕЙ (правой/верхней по сборке)
  // карты кластера — не оседают в точке дропа. Релокация под иной якорь (first/latest/zone/point) —
  // задел на потом. custom-оси читают демо-предикаты MERGE/KEEP_CUSTOM.
  private applyDropOutside(ids: readonly string[]): void {
    const mergers: Elem[] = [];
    let kept = begin("sel");
    for (const id of ids) {
      const el = this.byId.get(id);
      if (!el) continue;
      if (resolveMode(this.selDropPolicy.merge, el.tags, MERGE_CUSTOM)) mergers.push(el); // сшивается
      else this.releaseElement(el); // не сшить — домой
      if (resolveMode(this.selDropPolicy.keepSelection, el.tags, KEEP_CUSTOM)) kept = toggle(kept, id, "sel"); // оставить выделенной
    }
    if (mergers.length) this.mergeStackOnto(mergers, mergers[mergers.length - 1]!); // primary = ведущая среди сшиваемых
    this.setSelection(kept); // выделение = карты keepSelection (пустое → распущен → выход из сессии #66)
    this.wake();
  }

  // Собрать сшитые карты стопкой на СЛОТ-ДОМ primary-карты (issue #67, mergeAnchor=primary). primary
  // ложится точно на свой дом (верх стопки), остальные — тесной стопкой под-влево от неё (геометрия
  // stack-tight). Дисплей-жест: слоты зоны не меняем, как и прежний merge.
  private mergeStackOnto(mergers: readonly Elem[], primary: Elem): void {
    const h = this.homeOf(primary);
    if (!h) return;
    const stepX = this.cardW * 0.04; // тот же шаг, что у сборки stack-tight (assembly.ts)
    const stepY = this.cardW * 0.05;
    const top = mergers.length - 1; // индекс primary (ведущая — верх стопки)
    mergers.forEach((el, k) => {
      const fromTop = top - k; // primary → 0 (на своём доме), нижние — под-влево
      el.setState(el.pose);
      el.root.zIndex = h.depth + 1 + k; // стопка над слотом, primary сверху
      this.placeCard(el);
      el.body.setTarget({ x: h.home.x - fromTop * stepX, y: h.home.y + fromTop * stepY, rot: 0 });
    });
  }

  // Убрать догоревшие элементы (dead) — уничтожить узлы и вычистить из списков + byId (метки
  // увидят total--). Карты и фишки/фигуры реапаются одинаково.
  protected reapDead(): void {
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
  // Снести СВОЁ содержимое стенда (карты, мебель, стопки, борды, состояние выделения). Общий сброс
  // ввода/драга/зон/реестра делает SceneEngine.resetSceneState — тут его не дублируем.
  private clearOwnContent(): void {
    for (const p of this.cards) p.card.destroy();
    for (const p of this.pieces) p.el.destroy();
    for (const c of this.controlCards) c.destroy();
    this.cards = [];
    this.pieces = [];
    this.cardSpecs = [];
    this.controlCards = [];
    this.stackMove = null;
    this.clearMarkers();
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
    this.selPending = null;
    this.cancelSelEntry();
    this.faceOf.clear();
    this.selResetButton = null;
    this.resetSceneState();
  }

  private clearContent(): void {
    this.clearOwnContent();
    this.scene.surface.removeChildren().forEach((c) => c.destroy());
    this.scene.verb.removeChildren().forEach((c) => c.destroy());
    this.scene.clearCards(this.contentW, this.contentH);
  }

  // Все живые элементы сцены: перетаскиваемые карты (this.cards) + фишки/фигуры (this.pieces) +
  // управляемые API карты (control). Для шага/рендера/теней; хит-тест — только по draggables().
  protected everyElement(): TableElement[] {
    const out: TableElement[] = this.controlCards.slice();
    for (const p of this.cards) out.push(p.card);
    for (const p of this.pieces) out.push(p.el);
    return out;
  }

  // Метки слотов — визуал, которого у голой сцены нет: видимость (свап драггер↔якорь) + позиция
  // дома. Синхронизируются перед теневым пассом, вместе с остальными элементами.
  // Отвязать слушатели и почистить свои узлы/состояние перед сносом app (Host снимет тикер+app).
  // Логические спеки не сохраняем — при рестарте канваса состояние берётся из снимка ДО вызова.
  protected onTeardown(app: Application): void {
    this.clearOwnContent();
    this.tex?.destroy();
    super.onTeardown(app); // колесо + общий сброс ввода/драга/зон
  }
}
