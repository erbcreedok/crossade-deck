import { Application, Container, Graphics, Rectangle, Text } from "pixi.js";
import { CardTextureCache } from "../ui/CardTextureCache";
import { Card, type CardOptions, type CardState, type RestState, type ShadowShape } from "../ui/Card";
import { Piece, drawChip, drawChessPiece } from "../ui/Piece";
import { BoardZone, type OnOccupied, type AcceptCtx } from "../board/boardZone";
import type { Board } from "../board/board";
import { gridSlots, ringSlots, type PositionedSlot } from "../board/layout/slots";
import { BOARD_PRESETS, type BoardPreset } from "../board/boardPresets";
import { begin, toggle, clear as clearSel, has as hasSel, EMPTY, type Selection } from "../board/selection";
import { DropZone } from "../ui/DropZone";
import { Button, type ButtonOptions } from "../ui/Button";
import { SceneLayers, levelOf } from "./sceneLayers";
import type { Draggable, TableElement } from "./element";
import { SingleDrag, GroupDrag, type DragPayload, type DragContext } from "./drag";
import { Marker, withAnchor, withDragger, showAlways, showAway, showEmpty, type MarkerHost, type MarkerState, type ShowWhen } from "./marker";
import { fitBlock, squeezeOffsets } from "./sandboxLayout";
import { Viewport, type ViewState } from "./viewport";
import { createPixiApp, ensureFonts } from "./canvasHost";
import { InputRouter, type InputHandlers } from "./inputRouter";
import { topmostAt, type HitBox } from "./cardHit";
import { PIXEL_FONT, TEX_H, TEX_W } from "./constants";

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
  { caption: "скрытая 🖕", opts: { hidden: true, faceUp: false } },
  { caption: "рубашка: изумруд", opts: { faceUp: false, back: "emerald" } },
  { caption: "лицо: символ", opts: { card: "K♥", faceStyle: "symbol" } },
  { caption: "4-цветная", opts: { card: "Q♦", fourColor: true } },
  { caption: "порванная", opts: { card: "10♦", torn: true } },
  { caption: "меньше ×0.7", opts: { size: 0.7 } },
  { caption: "нельзя тащить", opts: { card: "7♣", draggable: false } },
  { caption: "удерживаемая", opts: { card: "8♦", rest: "held" } },
  { caption: "приподнятая (в руке)", opts: { card: "9♠", rest: "floating" } },
  { caption: "джокер", opts: { joker: true } },
];

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

// Стопка песочницы: состав (ids), host для меток и её драггер-метка (для хит-теста захвата пачки).
// Драггер/якорь — generic Marker'ы (см. marker.ts), навешенные на host; хранятся в this.markers.
interface SandboxStack {
  ids: string[];
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

export class FreeDeskEngine {
  private app: Application | null = null;
  private destroyed = false;
  private tex!: CardTextureCache;
  private content!: Container;

  private scene!: SceneLayers;

  private W = 1;
  private H = 1;
  private baseScale = 1;
  private cardW = 1;
  private cardH = 1;
  private contentW = 1;
  private contentH = 1;

  private container!: HTMLElement;
  private viewport = new Viewport(MIN_ZOOM, MAX_ZOOM);
  private cards: Placed[] = [];
  private pieces: PiecePlaced[] = []; // не-карточные элементы (фишки, фигуры) — тот же драг/тени
  private cardSpecs: CardSpec[] = [];
  private controlCards: Card[] = []; // карты раздела «Управление» — двигаются API, не драгом
  private byId = new Map<string, Elem>(); // реестр по id (карты + фишки + фигуры) для API/меток
  private stackMove: { a: string[]; b: string[]; ax: number; bx: number; y: number; toB: boolean } | null = null;
  private stacks: SandboxStack[] = [];
  private solos: SoloTarget[] = []; // одиночные цели с метками (соло-карта, соло-фигура)
  private chipPile: { ids: string[]; dragger: Marker } | null = null; // стопка фишек (для e2e-грипа)
  private boardZones: BoardZone[] = []; // игровые зоны (борды): фигуры в слотах, драг между слотами
  private selMode = false; // режим изолированного мультиселекта (демо-борд)
  private sel: Selection = EMPTY; // выделенный набор, замкнут на selZone
  private selZone: BoardZone | null = null; // зона демо-выделения
  private selButtons: { label: string; btn: Button }[] = []; // кнопки «выделение»/«снять» (для e2e)
  private markers: Marker[] = []; // все метки слотов (драггеры + якоря), generic
  private grabbers: Grabber[] = []; // всё, за что тянут через метку (стопки + соло) — для хит-теста
  private grabbedMarker: Marker | null = null; // за какую метку сейчас тянут (для follow/endFollow)
  private pendingHost: MarkerHost | null = null; // host захватываемой цели (между pickCard и grab)
  private stackMode: "one" | "whole" = "one"; // режим драга карты стопки: одна карта / вся пачка
  private dragSqueeze = false; // плейсмент пачки при драге: false — врассыпную, true — сжать в руку
  private buttons: Button[] = [];
  private zones: Array<{ zone: DropZone; onDrop: (p: DragPayload) => void }> = [];

  private input = new InputRouter<Elem, Button>(this.inputHandlers());
  private drag: DragPayload | null = null; // текущий груз драга (одна карта или пачка)
  // Контекст драга: поднять элемент в слой драга / вернуть домой (движок-специфика для payload).
  private dragCtx: DragContext = {
    raise: (el) => {
      el.setState("drag");
      el.root.zIndex = 1e6;
      this.placeCard(el);
    },
    returnHome: (el) => this.releaseElement(el as Elem),
    flipGroup: (els) => this.flipGroup(els),
  };
  private dragScreen = { x: 0, y: 0 }; // экранная позиция пальца при драге — для авто-скролла у кромки
  private panVel = { x: 0, y: 0 }; // сглаженная скорость пана (px/сек) — для инерции
  private lastPanT = 0;
  private pinch = { dist: 1, zoom: 1, midContentX: 0, midContentY: 0 };
  private onView: ((v: ViewState) => void) | null = null;

  async mount(container: HTMLElement, width: number, height: number): Promise<void> {
    if (this.destroyed) return;
    this.container = container;
    this.W = Math.max(1, Math.round(width));
    this.H = Math.max(1, Math.round(height));
    this.cardH = Math.max(48, Math.min(140, Math.min(this.W, this.H) * 0.16));
    this.baseScale = this.cardH / TEX_H;
    this.cardW = TEX_W * this.baseScale;
    await this.bootApp();
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

  // Поднять новый Pixi-канвас и собрать сцену. restore — снимок состояния карт (для рестарта
  // канваса); без него песочница строится в исходном виде. Шрифты ждём до отрисовки (canvasHost).
  private async bootApp(restore?: Map<number, CardRuntime>): Promise<void> {
    await ensureFonts();
    if (this.destroyed) return;
    const app = await createPixiApp(this.W, this.H);
    if (!app) return;
    if (this.destroyed) {
      app.destroy({ removeView: true }, { children: true, texture: true });
      return;
    }
    this.container.appendChild(app.canvas);
    this.app = app;
    this.tex = new CardTextureCache(app);

    this.content = new Container();
    app.stage.addChild(this.content);
    this.buildLayers();
    this.buildContent(restore);
    this.wire(app);

    this.clampView();
    this.applyView();
    app.ticker.add(this.tick);
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
    const snap = this.snapshotCards();
    const savedView = { x: this.viewport.x, y: this.viewport.y, zoom: this.viewport.zoom };
    this.teardownApp();
    await this.bootApp(snap);
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

  // Собрать песочницу: мебель (тексты, дропзоны, кнопки) — всегда заново; карты — из спеков,
  // при restore восстанавливая их положение/лицо (рестарт канваса), иначе в исходном виде.
  private buildContent(restore?: Map<number, CardRuntime>): void {
    const pad = 40;
    const gap = this.cardW * 1.15;
    const cellW = this.cardW + gap;
    const capH = 40;
    const titleH = 40;
    const cardCY = pad + titleH + this.cardH / 2;

    // Ряд «Карты — варианты»: копим спеки (позиция+пропсы), рисуем подписи.
    STORIES.forEach((s, i) => {
      const cx = pad + this.cardW / 2 + i * cellW;
      this.cardSpecs.push({ opts: s.opts, home: { x: cx, y: cardCY }, depth: i, bobPhase: i * 0.9 });
      this.scene.surface.addChild(this.label(s.caption, cx, cardCY + this.cardH / 2 + 8, 14, 0x9aa89f, cellW * 0.9));
    });

    const rightEdge = pad + this.cardW / 2 + (STORIES.length - 1) * cellW + this.cardW / 2;
    this.contentW = rightEdge + pad;

    this.scene.surface.addChild(this.label("Карты — варианты", pad, pad, 26, 0xcdb98f, undefined, 0));

    // Стопки (ряд под картами). Первая — левитирующая: 6 карт внахлёст, верхняя справа.
    const stacksBottom = this.buildStacks(pad, cardCY + this.cardH / 2 + capH + 16);

    // Ряд «Фишки и фигуры» — НЕ карты (Piece), но тот же драг/тени/метки. Доказательство generic.
    const piecesBottom = this.buildPieces(pad, stacksBottom + 6);

    // Игровые зоны (борды): ряд пресетов, драг между слотами, заперты в рамке, тоглер исхода.
    const boardBottom = this.buildBoardZones(pad, piecesBottom + 6);

    // Ряд «Дропзоны»: перевернуть и сжечь. Фон+название — на поверхности, глагол — над картами.
    const dzTitleY = boardBottom + 6;
    this.scene.surface.addChild(this.label("Дропзоны", pad, dzTitleY, 26, 0xcdb98f, undefined, 0));
    const zoneY = dzTitleY + 44;
    const zoneW = this.cardW * 2.4;
    const zoneGap = this.cardW * 0.5;
    this.registerZone(new DropZone({ name: "ПЕРЕВОРОТ", verb: "перевернуть", rect: { x: pad, y: zoneY, w: zoneW, h: this.cardH } }), (p) => p.flip?.());
    this.registerZone(new DropZone({ name: "СЖЕЧЬ", verb: "сжечь", rect: { x: pad + zoneW + zoneGap, y: zoneY, w: zoneW, h: this.cardH } }), (p) => p.burn?.());

    const buttonsBottom = this.buildButtons(pad, zoneY + this.cardH + 30);

    // Раздел «Управление» — демонстрация публичного API (карты двигает движок, не палец).
    const controlBottom = this.buildControls(pad, buttonsBottom + 24);
    this.contentH = controlBottom + pad;

    // Карты рождаем ПОСЛЕ мебели — чтобы легли поверх подписей/зон.
    this.spawnCards(restore);
  }

  // Только для e2e: экранные точки зон + состояние первой карты + число карт. Дёшево, безвредно.
  testHooks(): {
    zones: Record<string, { x: number; y: number }>;
    firstCard: { x: number; y: number; faceUp: boolean } | null;
    cardCount: number;
    grips: ({ x: number; y: number } | null)[];
    stackCards: { x: number; y: number }[][];
    markerVis: { dragger: boolean; anchor: boolean }[];
    pieces: { id: string; x: number; y: number }[];
    pieceCount: number;
    soloVis: { label: string; dragger: boolean; anchor: boolean; x: number; y: number }[];
    pileGrip: { x: number; y: number } | null;
    boardFigures: { id: string; key: string; x: number; y: number }[];
    boardSlots: { key: string; x: number; y: number }[];
    selMode: boolean;
    selection: string[];
    selButtons: { label: string; x: number; y: number }[];
    selFigures: { id: string; x: number; y: number }[];
    boards: { figures: { id: string; key: string; x: number; y: number }[]; slots: { key: string; x: number; y: number }[] }[];
    cardW: number;
    draggingId: string | null;
  } {
    const toScreen = (cx: number, cy: number) => ({ x: this.viewport.x + cx * this.viewport.zoom, y: this.viewport.y + cy * this.viewport.zoom });
    const zones: Record<string, { x: number; y: number }> = {};
    for (const z of this.zones) {
      const r = z.zone.rect;
      zones[z.zone.label] = toScreen(r.x + r.w / 2, r.y + r.h / 2);
    }
    const first = this.cards[0]?.card;
    return {
      zones,
      firstCard: first ? { ...toScreen(first.body.px, first.body.py), faceUp: first.faceUp } : null,
      cardCount: this.cards.length,
      grips: this.stacks.map((st) => toScreen(st.dragger.gfx.position.x, st.dragger.gfx.position.y)),
      stackCards: this.stacks.map((st) => st.ids.map((id) => this.byId.get(id)).filter((c): c is Elem => !!c).map((c) => toScreen(c.body.px, c.body.py))),
      markerVis: this.stacks.map((st) => ({ dragger: st.dragger.cfg.showWhen(st.host.state()), anchor: st.anchor.cfg.showWhen(st.host.state()) })),
      pieces: this.pieces.map((p) => ({ id: p.el.id, ...toScreen(p.el.body.px, p.el.body.py) })),
      pieceCount: this.pieces.length,
      pileGrip: this.chipPile ? toScreen(this.chipPile.dragger.gfx.position.x, this.chipPile.dragger.gfx.position.y) : null,
      soloVis: this.solos.map((s) => ({
        label: s.label,
        dragger: s.dragger.cfg.showWhen(s.host.state()),
        anchor: s.anchor.cfg.showWhen(s.host.state()),
        ...toScreen(s.dragger.gfx.position.x, s.dragger.gfx.position.y),
      })),
      boardFigures: this.boardFiguresHook(toScreen),
      boardSlots: this.boardZones[0]?.slotRects().map(({ key, rect }) => ({ key, ...toScreen(rect.x + rect.w / 2, rect.y + rect.h / 2) })) ?? [],
      selMode: this.selMode,
      selection: [...this.sel.ids],
      selButtons: this.selButtons.map(({ label, btn }) => ({ label, ...toScreen(btn.x, btn.y) })),
      selFigures: this.selZone
        ? Object.values(this.selZone.board.slots)
            .flatMap((c) => c.members)
            .map((id) => ({ id, el: this.byId.get(id) }))
            .filter((o): o is { id: string; el: Elem } => !!o.el)
            .map(({ id, el }) => ({ id, ...toScreen(el.body.px, el.body.py) }))
        : [],
      boards: this.boardZones.map((z) => ({
        figures: Object.entries(z.board.slots).flatMap(([key, c]) =>
          c.members.map((id) => ({ id, key, el: this.byId.get(id) })).filter((o): o is { id: string; key: string; el: Elem } => !!o.el).map(({ id, key, el }) => ({ id, key, ...toScreen(el.body.px, el.body.py) })),
        ),
        slots: z.slotRects().map(({ key, rect }) => ({ key, ...toScreen(rect.x + rect.w / 2, rect.y + rect.h / 2) })),
      })),
      cardW: this.cardW * this.viewport.zoom,
      draggingId: this.drag?.lead.id ?? null,
    };
  }

  // Экранные позиции фигур первой зоны + их ЛОГИЧЕСКИЙ слот (для e2e: проверить переезд).
  private boardFiguresHook(toScreen: (x: number, y: number) => { x: number; y: number }): { id: string; key: string; x: number; y: number }[] {
    const z = this.boardZones[0];
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

  // ——— публичное API доски (то, чем СЕРВЕР или скрытая логика юзера двигает карты) ———
  // Все движения — та же пружина, что и при драге. Одиночные вызовы или пачкой (см. doStackMove).

  /** Перевернуть карту по id (напр. «игрок открыл карту»). Не-Flippable элемент игнорируем. */
  flipCard(id: string): void {
    const el = this.byId.get(id);
    if (el && "requestFlip" in el && (el as { requestFlip(): boolean }).requestFlip()) this.wake();
  }

  /** Плавно (пружиной) переместить карту по id в точку контента (напр. «перенёс в дропзону»). */
  moveCard(id: string, x: number, y: number): void {
    const c = this.byId.get(id);
    if (!c) return;
    c.body.setTarget({ x, y, rot: 0 });
    this.wake();
  }

  // ——— раздел «Управление» (демо API) ———

  private buildControls(left: number, top: number): number {
    this.scene.surface.addChild(this.label("Управление", left, top, 26, 0xcdb98f, undefined, 0));
    let y = top + 46;
    y = this.buildFlipBlock(left, y) + 22;
    y = this.buildMoveBlock(left, y);
    return y;
  }

  // Блок 1: текст-кнопка «перевернуть карту» — по тапу переворачивает карту внутри блока.
  // Бокс подгоняется под контент (fit): ширина = max(кнопка, карта) + отступы.
  private buildFlipBlock(left: number, top: number): number {
    const btn = this.textButton("перевернуть карту", () => this.flipCard("ctl-flip"));
    const box = fitBlock(btn.w, this.cardW, btn.h, this.cardH);
    this.blockFrame(left, top, box.boxW, box.boxH);
    const cx = left + box.boxW / 2;
    btn.place(cx, top + box.btnCY);
    this.registerButton(btn);
    const card = new Card({ id: "ctl-flip", card: "A♥", rest: "idle" }, this.tex, this.baseScale);
    card.body.snapTo({ x: cx, y: top + box.cardCY, rot: 0, scale: card.restScale });
    this.addControlCard(card);
    return top + box.boxH;
  }

  // Блок 2: две стопки (5 и 4). Тап — случайная карта летит из одной в другую и остаётся там;
  // следующий тап — случайная летит обратно. Направление чередуется. Бокс подгоняется под контент.
  private buildMoveBlock(left: number, top: number): number {
    const step = this.cardW * 0.4;
    const footprint = this.cardW + 4 * step; // до 5 карт внахлёст
    const stacksGap = this.cardW * 0.7;
    const stacksW = footprint * 2 + stacksGap;
    const btn = this.textButton("перенос из стопки в стопку", () => this.doStackMove());
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
    return top + box.boxH;
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
  private registerZone(zone: DropZone, onDrop: (p: DragPayload) => void): void {
    this.zones.push({ zone, onDrop });
    this.scene.surface.addChild(zone.base);
    this.scene.verb.addChild(zone.verb);
  }

  // Живые Card из накопленных спеков. restore — снимок (положение/лицо), сгоревшие пропускаем.
  private spawnCards(restore?: Map<number, CardRuntime>): void {
    this.cardSpecs.forEach((spec, i) => {
      const r = restore?.get(i);
      if (restore && !r) return; // сгоревшую карту при рестарте канваса не воскрешаем
      const card = new Card(r ? { ...spec.opts, faceUp: r.faceUp } : spec.opts, this.tex, this.baseScale);
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
    this.scene.surface.addChild(this.label("Стопки", left, top, 26, 0xcdb98f, undefined, 0));
    const cy = top + 44 + this.cardH / 2;
    const step = this.cardW * 0.4; // сдвиг соседа вправо (перекрытие)
    const ranks = ["6♦", "7♦", "8♦", "9♦", "10♦"];
    const footprint = this.cardW + (ranks.length - 1) * step;
    const gap = this.cardW * 0.9;
    // Демо якорей: у трёх стопок РАЗНЫЕ политики видимости и разные иконки. Драггер у всех
    // одинаковый (грип, летит с пачкой). Драггер↔якорь свапаются по состоянию (см. marker.ts).
    const anchors = [
      { draw: drawAnchorIcon, showWhen: showAway, cap: "якорь: когда унесли" },
      { draw: drawRingIcon, showWhen: showEmpty, cap: "кольцо: когда пусто" },
      { draw: drawPinIcon, showWhen: showAlways, cap: "метка: всегда" },
    ];
    anchors.forEach((a, s) => {
      const ox = left + s * (footprint + gap);
      const ids = ranks.map((r, i) => {
        const id = `stk${s}c${i}`;
        const cx = ox + this.cardW / 2 + i * step;
        this.cardSpecs.push({ opts: { id, card: r, rest: "floating" }, home: { x: cx, y: cy }, depth: i, bobPhase: i * 0.6 + s });
        return id;
      });
      const slot = { x: ox + footprint / 2, y: cy }; // центр стопки — дом для меток
      const host: MarkerHost = {
        slotPos: () => slot,
        state: () => this.stackState(ids),
        makePayload: (cp) => this.makeStackPayload(ids, cp),
      };
      const dragger = withDragger(host, this.scene.verb, this.scene.cards.drag, {
        draw: drawGrip,
        offset: { x: 0, y: this.cardH / 2 + 9 }, // грип под стопкой
        hit: { w: 44, h: 22 },
        follow: true,
        followOffset: { x: 0, y: this.cardH * 0.62 }, // едет под пачкой у пальца
      });
      const anchor = withAnchor(host, this.scene.surface, { draw: a.draw, showWhen: a.showWhen }); // якорь в центре, под картами
      this.markers.push(dragger, anchor);
      this.stacks.push({ ids, host, dragger, anchor });
      this.grabbers.push({ marker: dragger, host, lead: () => this.byId.get(ids[ids.length - 1]!) ?? null });
      this.scene.surface.addChild(this.label(a.cap, ox, cy + this.cardH / 2 + 26, 12, 0x9aa89f, footprint));
    });
    const toggleY = cy + this.cardH / 2 + 50;
    this.segToggle(left, toggleY, "режим драга карты:", ["по карте", "всю стопку"], this.stackMode === "one" ? 0 : 1, (i) => (this.stackMode = i === 0 ? "one" : "whole"));
    this.segToggle(left, toggleY + 28, "при драге стопки:", ["рассыпью", "в руку"], this.dragSqueeze ? 1 : 0, (i) => (this.dragSqueeze = i === 1));
    return toggleY + 70;
  }

  // Ряд НЕ-карточных элементов: соло-карта с меткой + фишки номиналов + шахматы. Все — тот же
  // драг/тени/метки, что и карты (Piece реализует те же способности). Конь тоже носит метку —
  // withDragger/withAnchor generic по элементу, не только по стопке.
  private buildPieces(left: number, top: number): number {
    this.scene.surface.addChild(this.label("Фишки и фигуры", left, top, 26, 0xcdb98f, undefined, 0));
    const cy = top + 44 + this.cardH / 2;
    const r = this.cardH * 0.34; // радиус фишки/подставки
    const slotW = this.cardW * 1.05;
    let x = left + this.cardW / 2;
    const cap = (text: string, w = slotW) => this.scene.surface.addChild(this.label(text, x, cy + this.cardH / 2 + 8, 12, 0x9aa89f, w));

    // 1) СОЛО-КАРТА с меткой (доказательство: withDragger/withAnchor на одиночной карте, не стопке).
    const soloId = "solo-card";
    this.cardSpecs.push({ opts: { id: soloId, card: "A♠", rest: "idle" }, home: { x, y: cy }, depth: 100, bobPhase: 0 });
    this.attachSolo(soloId, { x, y: cy }, drawAnchorIcon, showAway, "карта"); // якорь «когда унесли»
    cap("карта + метка");
    x += slotW;

    // 2) ФИШКИ разных номиналов (Piece, круглые). Draggable + Burnable, но НЕ Flippable — значит
    // «перевернуть» их проигнорирует, а «сжечь» сработает (зона реагирует на способности).
    const chips = [
      { v: "5", c: 0xb23b34 },
      { v: "25", c: 0x2f6b34 },
      { v: "100", c: 0x24242a },
      { v: "500", c: 0x6c4bb0 },
    ];
    const chipShadow = { rx: r * 0.98, ry: r * 0.86, dy: r * 0.12 }; // фишка лежит — тень почти круглая под ней
    for (const ch of chips) {
      this.spawnPiece(`chip-${ch.v}`, { x, y: cy }, r * 2, r * 2, (root) => drawChip(root, r, ch.c, ch.v), chipShadow);
      cap(`фишка ${ch.v}`, slotW * 0.78);
      x += slotW * 0.78;
    }

    // 3) ШАХМАТЫ: сплошные силуэты (чёрный набор глифов), тень — плоский овал у ножки. Конь тоже
    // с меткой — метка не про карты. Пешка тоже глиф чёрного набора, крашенный в «белую» команду.
    const pieceShadow = { rx: r * 0.58, ry: r * 0.18, dy: r * 0.72 }; // стоящая фигура — узкий овал у основания
    this.spawnPiece("chess-knight", { x, y: cy }, r * 2, r * 2, (root) => drawChessPiece(root, r * 2, true, "♞"), pieceShadow);
    this.attachSolo("chess-knight", { x, y: cy }, drawRingIcon, showEmpty, "конь"); // якорь «когда пусто» (сожжёшь → покажется)
    cap("чёрный конь", slotW * 0.9);
    x += slotW * 0.9;

    this.spawnPiece("chess-pawn", { x, y: cy }, r * 2, r * 2, (root) => drawChessPiece(root, r * 2, false, "♟"), pieceShadow);
    cap("белая пешка", slotW * 0.9);
    x += slotW * 0.9;

    // 4) СТОПКА ФИШЕК — тянется целиком за грип (GroupDrag на фишках, как пачка карт).
    this.buildChipStack(x, cy, r);
    cap("стопка фишек", slotW);
    x += slotW;

    this.contentW = Math.max(this.contentW, x + left);
    return cy + this.cardH / 2 + 34;
  }

  // Живой не-карточный элемент: расставляем как карту (snapTo → слой → реестр byId → список pieces).
  private spawnPiece(id: string, home: { x: number; y: number }, w: number, h: number, build: (root: Container) => void, shadow: { rx: number; ry: number; dy: number }): void {
    const piece = new Piece({ id, w, h, build, shadow });
    piece.root.zIndex = 100 + this.pieces.length;
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
  private mountMarkers(host: MarkerHost, lead: () => Elem | null, anchorDraw: (g: Graphics) => void, anchorWhen: ShowWhen): { dragger: Marker; anchor: Marker } {
    const dragger = withDragger(host, this.scene.verb, this.scene.cards.drag, {
      draw: drawGrip,
      offset: { x: 0, y: this.cardH / 2 + 9 },
      hit: { w: 44, h: 22 },
      follow: true,
      followOffset: { x: 0, y: this.cardH * 0.62 },
    });
    const anchor = withAnchor(host, this.scene.surface, { draw: anchorDraw, showWhen: anchorWhen });
    this.markers.push(dragger, anchor);
    this.grabbers.push({ marker: dragger, host, lead });
    return { dragger, anchor };
  }

  // Метки на ОДИНОЧНЫЙ элемент по id (host отдаёт SingleDrag). Соло-карта и соло-фигура одинаково.
  private attachSolo(id: string, slot: { x: number; y: number }, anchorDraw: (g: Graphics) => void, anchorWhen: ShowWhen, label: string): void {
    const lead = () => this.byId.get(id) ?? null;
    const host: MarkerHost = {
      slotPos: () => slot,
      state: () => this.soloState(id),
      makePayload: (cp) => {
        const el = this.byId.get(id);
        return el ? new SingleDrag(el, this.dragCtx, cp) : null;
      },
    };
    const { dragger, anchor } = this.mountMarkers(host, lead, anchorDraw, anchorWhen);
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
      this.spawnPiece(id, { x, y: cy - i * r * 0.28 }, r * 2, r * 2, (root) => drawChip(root, r, 0xc79a3e, ""), { rx: r * 0.98, ry: r * 0.86, dy: r * 0.12 }); // одинаковые, друг на друге
      ids.push(id);
    }
    const slot = { x, y: cy - ((n - 1) / 2) * r * 0.28 }; // центр столбика
    const host: MarkerHost = {
      slotPos: () => slot,
      state: () => this.stackState(ids),
      makePayload: (cp) => this.makeStackPayload(ids, cp),
    };
    const { dragger } = this.mountMarkers(host, () => this.byId.get(ids[ids.length - 1]!) ?? null, drawAnchorIcon, showAway);
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
  private segToggle(left: number, y: number, caption: string, labels: string[], initial: number, onPick: (i: number) => void): void {
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
    labels.forEach((lab, i) => {
      const b = this.textButton(lab, () => {
        onPick(i);
        setMark(i);
      });
      b.place(x + b.w / 2, y + b.h / 2);
      this.registerButton(b);
      btns.push(b);
      x += b.w + 10;
    });
    this.scene.surface.addChild(mark);
    setMark(initial);
  }

  // Игровые зоны (борды): РЯД пресетов (data-driven). Каждый борд — сетка слотов + фигуры-карты,
  // драг между слотами через BoardZone (логика в board/boardZone.ts), фигуры заперты в рамке.
  // Тоглер под каждым меняет исход дропа на занятый слот (merge/swap/capture/reject). Демо-полигон
  // будущего BoardFactory: разные борды = разные ДАННЫЕ, один движок.
  private buildBoardZones(left: number, top: number): number {
    this.scene.surface.addChild(this.label("Игровые зоны (борды)", left, top, 26, 0xcdb98f, undefined, 0));
    let y = top + 44;
    BOARD_PRESETS.forEach((preset, pi) => {
      y = this.buildOneBoard(left, y, preset, pi) + 20;
    });
    y = this.buildSelectDemo(left, y, BOARD_PRESETS.length) + 20;
    return y;
  }

  // Родить зону из пресета-данных + отрисовать рамку/слоты/фигуры. Возвращает зону и нижний край
  // (без тоглера/кнопок — их вешает вызывающий). Переиспользуется борд-пресетами и демо выделения.
  private spawnBoard(preset: BoardPreset, pi: number, left: number, top: number): { zone: BoardZone; bottom: number } {
    const gap = 8;
    const gy = top + 22;
    // Раскладка — подключаемая стратегия (grid/ring). BoardZone её лишь потребляет.
    let positioned: PositionedSlot[];
    let bounds: { x: number; y: number; w: number; h: number };
    if (preset.layout === "ring") {
      const cell = { w: this.cardW * 0.82, h: this.cardH * 0.82 };
      const radius = this.cardH * 1.35;
      const cx = left + radius + cell.w / 2;
      const cy = gy + radius + cell.h / 2;
      positioned = ringSlots(preset.ringCount ?? 8, { cx, cy, radius, cell });
      const d = 2 * radius + cell.w;
      bounds = { x: left, y: gy, w: d, h: d };
    } else {
      const cell = { w: this.cardW * 1.15, h: this.cardH * 1.02 };
      positioned = gridSlots({ cols: preset.cols, cell, gap, origin: { x: left, y: gy } }, preset.rows);
      bounds = { x: left, y: gy, w: preset.cols * cell.w + (preset.cols - 1) * gap, h: preset.rows * cell.h + (preset.rows - 1) * gap };
    }

    const slots: Board["slots"] = {};
    const faces: Record<string, string> = {};
    let n = 0;
    for (const [key, arr] of Object.entries(preset.slots)) {
      const ids = arr.map((face) => {
        const id = `bz${pi}-${n++}`;
        faces[id] = face;
        return id;
      });
      slots[key] = { members: ids, maxSize: preset.maxSize };
    }
    // Value-правило: оборачиваем preset.rule (по лицам) в AcceptRule (по ids/слотам) через faces.
    const rule = preset.rule
      ? (ctx: AcceptCtx): boolean => {
          const c = ctx.board.slots[ctx.toKey];
          const topId = c && c.members[c.members.length - 1];
          return preset.rule!(faces[ctx.figureId] ?? "", topId ? (faces[topId] ?? null) : null);
        }
      : undefined;
    const zone = new BoardZone({ slots: positioned, board: { slots, onEmpty: "keep" }, bounds, onOccupied: preset.onOccupied, rule });
    this.boardZones.push(zone);

    this.scene.surface.addChild(this.label(preset.title, left, top, 13, 0xcdb98f, undefined, 0));
    const frame = new Graphics();
    frame.roundRect(bounds.x - 5, bounds.y - 5, bounds.w + 10, bounds.h + 10, 10).fill({ color: 0x000000, alpha: 0.12 }).stroke({ width: 2, color: 0x4a5b50 });
    for (const { rect } of zone.slotRects()) frame.roundRect(rect.x, rect.y, rect.w, rect.h, 6).stroke({ width: 1, color: 0x5d6b64 });
    this.scene.surface.addChild(frame);

    let depth = 300 + pi * 100;
    for (const key of Object.keys(slots)) {
      for (const id of slots[key]!.members) {
        this.cardSpecs.push({ opts: { id, card: faces[id] ?? "A♠", rest: "idle", size: 0.86 }, home: zone.figureHome(id), depth: depth++, bobPhase: 0 });
      }
    }
    return { zone, bottom: bounds.y + bounds.h + 8 };
  }

  private buildOneBoard(left: number, top: number, preset: BoardPreset, pi: number): number {
    const { zone, bottom } = this.spawnBoard(preset, pi, left, top);
    const modes: OnOccupied[] = ["merge", "swap", "capture", "reject"];
    this.segToggle(left, bottom, "на занятый слот:", modes, modes.indexOf(zone.onOccupied), (i) => (zone.onOccupied = modes[i]!));
    return bottom + 26;
  }

  // Демо ИЗОЛИРОВАННОГО мультиселекта: борд + кнопки «выделение» / «снять». В режиме тап по фигуре
  // ЭТОЙ зоны тогглит выделение (лифт), фигуры ДРУГИХ зон выделить нельзя (изоляция по scope).
  private buildSelectDemo(left: number, top: number, pi: number): number {
    const preset: BoardPreset = { title: "выделение (изолировано, сорт по номиналу)", cols: 4, rows: 1, onOccupied: "merge", slots: { "0,0": ["A♦"], "0,1": ["7♣"], "0,2": ["Q♠"], "0,3": ["3♥"] } };
    const { zone, bottom } = this.spawnBoard(preset, pi, left, top);
    this.selZone = zone;
    const bMode = new Button({ label: "выделение", variant: "secondary", size: "sm", onClick: () => this.toggleSelectMode() });
    const bClear = new Button({ label: "снять", variant: "ghost", size: "sm", onClick: () => this.clearSelection() });
    bMode.place(left + bMode.w / 2, bottom + 12);
    bClear.place(left + bMode.w + 10 + bClear.w / 2, bottom + 12);
    this.registerButton(bMode);
    this.registerButton(bClear);
    this.selButtons = [{ label: "выделение", btn: bMode }, { label: "снять", btn: bClear }];
    return bottom + 30;
  }

  // ——— изолированный мультиселект (selection.ts) ———
  private toggleSelectMode(): void {
    this.selMode = !this.selMode;
    this.sel = this.selMode ? begin("sel") : clearSel();
    this.refreshSel();
    this.wake();
  }

  private clearSelection(): void {
    if (this.selMode) this.sel = begin("sel"); // остаёмся в режиме, гасим набор
    this.refreshSel();
    this.wake();
  }

  // Тап по фигуре демо-зоны в режиме → тоггл. owner="sel" всегда совпадает со scope (изоляция:
  // сюда доходят ТОЛЬКО фигуры selZone, чужие зоны остаются драгабельными и не выделяются).
  private toggleSelectFigure(id: string): void {
    this.sel = toggle(this.sel, id, "sel");
    this.refreshSel();
    this.wake();
  }

  // Подсветка: выделенные — приподняты (floating), остальные — на столе.
  private refreshSel(): void {
    if (!this.selZone) return;
    for (const key of Object.keys(this.selZone.board.slots)) {
      for (const id of this.selZone.board.slots[key]!.members) {
        this.byId.get(id)?.setState(hasSel(this.sel, id) ? "floating" : "idle");
      }
    }
  }

  // Зона, которой принадлежит фигура (или null).
  private boardZoneOf(id: string): BoardZone | null {
    for (const z of this.boardZones) if (z.locate(id)) return z;
    return null;
  }

  // Увести вытесненные (capture) фигуры с борда — сжечь (как «ушли из игры»).
  private exileFigures(ids: string[]): void {
    for (const id of ids) this.cards.find((p) => p.card.id === id)?.card.burn();
  }

  // Пересчитать home всех фигур зоны (после переезда стек-смещения меняются).
  private refreshZoneHomes(zone: BoardZone): void {
    for (const key of Object.keys(zone.board.slots)) {
      for (const id of zone.board.slots[key]!.members) {
        const placed = this.cards.find((p) => p.card.id === id);
        if (placed) placed.home = zone.figureHome(id);
      }
    }
  }

  // Витрина кнопок: варианты, размеры, состояние «недоступна» — рядами с подписями.
  private buildButtons(left: number, startY: number): number {
    this.scene.surface.addChild(this.label("Кнопки", left, startY, 26, 0xcdb98f, undefined, 0));
    let y = startY + 48;
    y = this.buttonRow(left, y, [
      { opts: { label: "Основная", variant: "primary" }, cap: "primary" },
      { opts: { label: "Вторичная", variant: "secondary" }, cap: "secondary" },
      { opts: { label: "Опасно", variant: "danger" }, cap: "danger" },
      { opts: { label: "Призрак", variant: "ghost" }, cap: "ghost" },
    ]);
    y = this.buttonRow(left, y, [
      { opts: { label: "Мелкая", size: "sm" }, cap: "sm" },
      { opts: { label: "Средняя", size: "md" }, cap: "md" },
      { opts: { label: "Крупная", size: "lg" }, cap: "lg" },
    ]);
    y = this.buttonRow(left, y, [{ opts: { label: "Недоступна", disabled: true }, cap: "disabled" }]);
    return y;
  }

  private buttonRow(left: number, y: number, items: Array<{ opts: ButtonOptions; cap: string }>): number {
    const gap = 26;
    const made = items.map((it) => ({ b: new Button(it.opts), cap: it.cap }));
    const rowH = Math.max(...made.map((m) => m.b.h));
    let x = left;
    for (const { b, cap } of made) {
      const cx = x + b.w / 2;
      b.place(cx, y + rowH / 2);
      this.scene.surface.addChild(b.root);
      this.buttons.push(b);
      this.scene.surface.addChild(this.label(cap, cx, y + rowH + 8, 13, 0x9aa89f));
      x += b.w + gap;
    }
    return y + rowH + 42;
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
          const owner = this.stacks.find((s) => el.id !== "" && s.ids.includes(el.id));
          if (owner) {
            this.pendingHost = owner.host;
            this.grabbedMarker = owner.dragger;
          }
        }
        return el;
      },
      // В режиме выделения фигуры демо-зоны не тащатся — тап по ним тогглит выделение (onCardBlocked).
      cardDraggable: (c) => (this.selMode && this.selZone?.locate(c.id) ? false : c.draggable),
      pickButton: (cx, cy) => this.hitButton(cx, cy),
      buttonContains: (b, cx, cy) => b.hitTest(cx, cy),
      onCardGrab: (card, cp, sp) => {
        this.dragScreen = { x: sp.x, y: sp.y };
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
      },
      onCardMove: (_card, cp, sp) => {
        this.dragScreen = { x: sp.x, y: sp.y };
        // Фигура борда заперта в рамке зоны — клампим точку драга по полурзмеру карты.
        const bz = this.drag ? this.boardZoneOf(this.drag.lead.id) : null;
        const p = bz ? bz.clamp(cp, { w: this.cardW / 2, h: this.cardH / 2 }) : cp;
        this.drag?.move(p);
        this.grabbedMarker?.followTo(p);
        for (const z of this.zones) z.zone.setHot(z.zone.contains(p.x, p.y)); // подсветка зоны под грузом
      },
      onCardDrop: (_card, cp) => {
        if (this.drag) {
          const bz = this.boardZoneOf(this.drag.lead.id);
          if (bz) {
            // Борд: резолвим целевой слот, исход по onOccupied; вытесненных (capture) уводим с борда.
            const res = bz.dropAt(this.drag.lead.id, cp.x, cp.y);
            if (res.captured) this.exileFigures(res.captured);
            this.refreshZoneHomes(bz);
            this.drag.release(); // летит в (возможно новый) home
          } else {
            const zone = this.zones.find((z) => z.zone.contains(cp.x, cp.y));
            zone?.onDrop(this.drag); // зона реагирует на СПОСОБНОСТИ груза (flip/burn), не на тип
            if (!this.drag.consumed) this.drag.release(); // не поглощён (не горит) → вернуть на место
          }
          this.drag = null;
        }
        this.grabbedMarker?.endFollow();
        this.grabbedMarker = null;
        for (const z of this.zones) z.zone.setHot(false);
      },
      onCardCancel: () => {
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
        for (const btn of this.buttons) btn.hover(btn === b);
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
    for (const z of this.zones) z.zone.setHot(z.zone.contains(p.x, p.y));
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
    const st = this.stacks.find((s) => els.every((el) => s.ids.includes(el.id)));
    st?.ids.reverse();
    this.wake();
  }

  // Дом элемента (позиция покоя + глубина) — среди карт или фишек/фигур.
  private homeOf(el: Elem): { home: { x: number; y: number }; depth: number } | null {
    const c = this.cards.find((p) => p.card === el);
    if (c) return { home: c.home, depth: c.depth };
    const p = this.pieces.find((q) => q.el === el);
    return p ? { home: p.home, depth: p.depth } : null;
  }

  // Вернуть ЛЮБОЙ элемент (карта/фишка/фигура) домой.
  private releaseElement(el: Elem): void {
    const h = this.homeOf(el);
    if (!h) return;
    el.setState(el.rest); // возврат в СВОЙ план покоя (стол / левитация / удержание)
    el.root.zIndex = h.depth; // и на свою глубину — не поверх соседей по стопке
    this.placeCard(el);
    el.body.setTarget({ x: h.home.x, y: h.home.y, rot: 0 });
  }

  // ——— цикл ———

  private wake(): void {
    if (this.app && !this.app.ticker.started) this.app.ticker.start();
  }

  private tick = (): void => {
    if (!this.app) return;
    const dt = Math.min(this.app.ticker.deltaMS / 1000, 0.05);
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
    this.render();
    if (!moving) this.app.ticker.stop();
  };

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
    this.selMode = false;
    this.sel = EMPTY;
    this.selZone = null;
    this.selButtons = [];
    this.grabbers = [];
    this.grabbedMarker = null;
    this.pendingHost = null;
    this.drag = null;
    this.buttons = [];
    this.zones = [];
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
  private teardownApp(): void {
    if (!this.app) return;
    this.app.canvas.removeEventListener("wheel", this.onWheel);
    this.app.ticker.remove(this.tick);
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
    this.selMode = false;
    this.sel = EMPTY;
    this.selZone = null;
    this.selButtons = [];
    this.grabbers = [];
    this.grabbedMarker = null;
    this.pendingHost = null;
    this.drag = null;
    this.buttons = [];
    this.zones = [];
    this.input.reset();
    this.tex?.destroy();
    this.app.destroy({ removeView: true }, { children: true, texture: true });
    this.app = null;
  }

  destroy(): void {
    this.destroyed = true;
    this.teardownApp();
  }
}
