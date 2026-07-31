import { Application, Graphics } from "pixi.js";
import { SceneEngine, type SceneElement } from "../engine/sceneEngine";
import { GroupDrag } from "../engine/drag";
import { TEX_H } from "../engine/constants";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { CardTextureCache } from "../ui/CardTextureCache";
import { TopBar, TOPBAR_H } from "../ui/TopBar";
import type { TableElement } from "../engine/element";
import { SolitaireGameEngine } from "./engine";
import { buildSolitaireTree, CARD, type SolitaireTree } from "./tree";
import { paintSlots } from "./slotPaint";

// СЦЕНА «Косынки» поверх общего слоя. Всё, что есть у любого стола, берётся из SceneEngine и здесь
// НЕ пишется: ввод (InputRouter с хит-тестом и ховером), камера (пан/зум/пинч/колесо/инерция/
// клампы/авто-скролл у кромки), драг (подъём, пружина, тень, возврат домой), цикл кадра, слитые
// тени, экранный слой HUD. Первый заход написал всё это заново «под себя» и разошёлся с песочницей
// в жестах — доктрина client2 главнее текста тикета (SOLITAIRE-REBUILD-HANDOFF §2).
//
// Своего у пасьянса ровно четыре вещи:
//   1. геометрия — дерево слотов (tree.ts), одно на рендер и на дроп;
//   2. что можно тащить — открытая карта, из колонки тянется весь пробег под ней;
//   3. что значит дроп — слот под пальцем спрашивается у дерева, ход отдаётся движку правил;
//   4. сток — тапается, а не тащится.
//
// ПРАВИЛА И СОСТОЯНИЕ — за SolitaireGameEngine (E1/E2), сцена их не дублирует и не чинит: доска
// это ВИД состояния (вид = f(state)), любое изменение пересобирает дерево и разводит карты по домам.

const MIN_ZOOM = 0.25; // доска целиком обязана влезать даже в узкое окно телефона
const MAX_ZOOM = 2.5;

export interface SolitaireSceneOptions {
  /** Уйти из игры (навигация — дело хоста, сцена только зовёт). */
  onBack?: () => void;
}

export class SolitaireScene extends SceneEngine {
  readonly engine = new SolitaireGameEngine();

  private tex: CardTextureCache | null = null;
  private readonly nodes = new Map<string, Card>();
  private tree: SolitaireTree = buildSolitaireTree(this.engine.getState());
  private readonly slotLayer = new Graphics();
  private topbar: TopBar | null = null;
  private recycle: Button | null = null;

  // Текущий груз в терминах партии: откуда и какие карты. Держим отдельно от DragPayload —
  // payload знает про визуалы, а ход отдаётся движку правил в терминах слотов и id.
  private dragFrom = "";
  private dragIds: string[] = [];
  private hotSlot: string | null = null;
  private armedSlots: ReadonlySet<string> = new Set();

  constructor(private readonly opts: SolitaireSceneOptions = {}) {
    super({ minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, margin: 0, align: "center" });
    // Подписка на движок — на весь жизненный цикл сцены, а не на build(): канвас может
    // пересобираться, и слушатель задваивался бы на каждой пересборке.
    this.engine.on("move", this.onEngineMove);
  }

  // ——————————————————————————————————————————————————————————————————————
  // Сборка
  // ——————————————————————————————————————————————————————————————————————

  protected buildScene(app: Application): void {
    this.tex = new CardTextureCache(app);
    this.scene.surface.addChild(this.slotLayer);
    this.buildTopBar();
    this.recycle = new Button({ label: "⟲", variant: "ghost", size: "sm", onClick: () => this.engine.dealStock() });
    this.scene.surface.addChild(this.recycle.root);
    this.refresh(true);
  }

  private buildTopBar(): void {
    this.topbar = new TopBar([
      { key: "back", label: "← в меню", onClick: () => this.opts.onBack?.() },
      { key: "new-game", label: "⟲ новая", onClick: () => this.newGame() },
    ]);
    this.chrome.addChild(this.topbar.root);
    this.chromeButtons = this.topbar.buttons;
  }

  protected layoutChrome(w: number, _h: number): void {
    this.topbar?.layout(w);
  }

  // Стол начинается ПОД панелью: иначе верх доски навсегда уезжает под непрозрачный HUD и
  // доскроллить до него нечем (кламп упирается в 0).
  protected chromeInsetTop(): number {
    return TOPBAR_H;
  }

  protected onBooted(): void {
    this.fitBoard();
    super.onBooted();
  }

  // Раскладка доски от экрана НЕ зависит (размер карты — константа, issue #68): ресайз только
  // заново вписывает доску камерой, пересобирать сцену не нужно.
  protected onSceneResize(): void {
    this.fitBoard();
  }

  /** Вписать доску в свободную часть экрана. Зум не задираем выше 1: на большом мониторе доска
   *  рисуется в своём размере, а ужимается только когда реально не влезает. */
  private fitBoard(): void {
    this.syncVp();
    const usableH = Math.max(1, this.height - this.chromeInsetTop());
    this.viewport.setZoom(Math.min(1, this.width / this.tree.size.w, usableH / this.tree.size.h));
    this.clampView();
    this.applyView();
    this.emitView();
  }

  // ——————————————————————————————————————————————————————————————————————
  // Партия ↔ доска
  // ——————————————————————————————————————————————————————————————————————

  /** Раздать новую партию и пересобрать доску.
   *
   *  Через этот путь, а не engine.resetGame() напрямую: resetGame молча подменяет состояние и НЕ
   *  эмиттит ничего (шина знает только move/win/lose), так что доска осталась бы от прошлой партии
   *  (ловушка §5.6). Визуалы сносим целиком: у новой раздачи другие лица, а «перевернуть» 52 карты
   *  анимацией — это не сдача, а фокус. */
  newGame(seed?: number): void {
    this.engine.resetGame(seed);
    for (const node of this.nodes.values()) node.destroy();
    this.nodes.clear();
    this.byId.clear();
    if (!this.tex) return; // ещё не смонтированы — buildScene и так возьмёт свежее состояние
    this.refresh(true);
    this.fitBoard();
  }

  private onEngineMove = (): void => {
    this.refresh();
  };

  /** Свести доску с состоянием партии: дерево → дома → карты. snap — поставить сразу (раздача),
   *  иначе карта ДОЛЕТАЕТ пружиной, как всё в проекте. */
  private refresh(snap = false): void {
    const state = this.engine.getState();
    this.tree = buildSolitaireTree(state);
    if (!this.tex) return; // сцена ещё не собрана: рисовать не на чем, дерево уже актуально

    const alive = new Set<string>();
    for (const members of Object.values(state.board.slots)) {
      for (const cardId of members.members) {
        alive.add(cardId);
        const node = this.nodeFor(cardId, state.faceUp[cardId] === true);
        // Переворот — только через requestFlip(): присваивание node.faceUp меняет поле, но текстуру
        // кладёт приватный paint() из шага анимации, и карта продолжала лежать рубашкой (§5.4).
        if (node.faceUp !== (state.faceUp[cardId] === true)) node.requestFlip();
        const home = this.tree.homeOf(cardId);
        if (!home) continue;
        node.root.zIndex = this.tree.depthOf(cardId);
        node.setState(node.rest);
        this.placeCard(node);
        const target = { x: home.x, y: home.y, rot: 0, scale: node.restScale };
        if (snap) node.body.snapTo(target);
        else node.body.setTarget(target);
      }
    }
    for (const [cardId, node] of this.nodes) {
      if (alive.has(cardId)) continue;
      node.destroy();
      this.nodes.delete(cardId);
      this.byId.delete(cardId);
    }

    this.contentW = this.tree.size.w;
    this.contentH = this.tree.size.h;
    this.topbar?.setStatus(`Ходов: ${state.movesCount}`);
    this.syncRecycle();
    this.paintBoard();
    this.clampView();
    this.applyView();
    this.emitView();
    this.wake();
  }

  private nodeFor(cardId: string, faceUp: boolean): Card {
    const existing = this.nodes.get(cardId);
    if (existing) return existing;
    // baseScale — переходник между текстурой карты (TEX_W×TEX_H) и ячейкой доски. При baseScale=1
    // карта была бы втрое больше слота (этот баг гейты не видят: Pixi в node не исполняется).
    const node = new Card({ id: cardId, card: cardId, faceUp, flippable: true }, this.tex!, CARD.h / TEX_H);
    this.nodes.set(cardId, node);
    this.byId.set(cardId, node);
    return node;
  }

  // Пустой сток = кнопка «переработать сброс»: карты под пальцем там уже нет, а ход есть. Прячем
  // её, когда перерабатывать нечего, и убираем из списка кнопок — иначе невидимая кнопка ловила бы
  // тапы по пустому месту.
  private syncRecycle(): void {
    const b = this.recycle;
    if (!b) return;
    const state = this.engine.getState();
    const show = (state.board.slots.stock?.members.length ?? 0) === 0 && (state.board.slots.waste?.members.length ?? 0) > 0;
    const at = this.tree.origins.stock!;
    b.place(at.x + CARD.w / 2, at.y + CARD.h / 2);
    b.root.visible = show;
    this.buttons = show ? [b] : [];
  }

  private paintBoard(): void {
    paintSlots(this.slotLayer, { origins: this.tree.origins, cell: CARD, armed: this.armedSlots, hot: this.hotSlot });
  }

  // ——————————————————————————————————————————————————————————————————————
  // Швы домена: только то, чего у голой сцены со столом нет
  // ——————————————————————————————————————————————————————————————————————

  protected draggables(): SceneElement[] {
    return [...this.nodes.values()];
  }

  protected everyElement(): TableElement[] {
    return [...this.nodes.values()];
  }

  protected homeOf(el: SceneElement): { home: { x: number; y: number }; depth: number } | null {
    const home = this.tree.homeOf(el.id);
    return home ? { home, depth: this.tree.depthOf(el.id) } : null;
  }

  /** Тащить можно только открытую карту и только не из стока: сток сдаёт по тапу. */
  protected canDrag(el: SceneElement): boolean {
    const slot = this.tree.slotOf(el.id);
    return slot !== null && slot !== "stock" && this.engine.isFaceUp(el.id);
  }

  /** Тап по недрагабельной карте: в стоке это ХОД (сдать), в остальном — «стоп»-кивок. */
  protected onElementBlocked(el: SceneElement): void {
    if (this.tree.slotOf(el.id) === "stock") {
      this.engine.dealStock();
      return;
    }
    super.onElementBlocked(el);
  }

  protected beginDrag(el: SceneElement, cp: { x: number; y: number }, sp: { x: number; y: number }): boolean {
    const from = this.tree.slotOf(el.id) ?? "";
    const members = this.engine.getState().board.slots[from]?.members ?? [];
    const index = members.indexOf(el.id);
    // Из колонки тянется весь пробег ОТ схваченной карты до верхней (в Клондайк открытый пробег
    // всегда легален: карты попадают в колонку только валидным ходом). Из сброса/фундамента —
    // ровно одна: там физически не ухватить ничего, кроме верха.
    this.dragFrom = from;
    this.dragIds = from.startsWith("tab:") && index >= 0 ? members.slice(index) : [el.id];
    this.armedSlots = this.legalTargets(this.dragIds, from);
    this.paintBoard();

    if (this.dragIds.length > 1) {
      const els = this.dragIds.map((id) => this.nodes.get(id)).filter((n): n is Card => !!n);
      const offsets = els.map((n) => ({ dx: n.body.px - cp.x, dy: n.body.py - cp.y }));
      this.drag = new GroupDrag(els, offsets, this.dragCtx);
      this.drag.move(cp);
      return true;
    }
    return super.beginDrag(el, cp, sp);
  }

  protected onDragMoved(p: { x: number; y: number }): void {
    const under = this.tree.slotAt(p);
    const hot = under && this.armedSlots.has(under) ? under : null;
    if (hot === this.hotSlot) return;
    this.hotSlot = hot;
    this.paintBoard();
    this.wake();
  }

  /** Что значит дроп: слот под пальцем спрашивается у ТОГО ЖЕ дерева, что рисует карты, и ход
   *  отдаётся движку правил. Он же и решает, легален ли ход — сцена правила не дублирует. */
  protected resolveDrop(_el: SceneElement, cp: { x: number; y: number }): void {
    const drag = this.drag;
    if (!drag) return;
    const to = this.tree.slotAt(cp);
    const from = this.dragFrom;
    const ids = this.dragIds;
    if (to && from && to !== from) {
      if (ids.length > 1) this.engine.moveStack(from, to, ids);
      else this.engine.moveCard(from, to, ids[0]!);
    }
    // Успешный ход уже пересобрал дерево (событие "move"), неуспешный оставил прежнее — в обоих
    // случаях карты едут ДОМОЙ по актуальному дереву той же пружиной.
    drag.release();
  }

  protected onDragCancel(): void {
    this.clearDragHints();
  }

  protected afterDragEnd(): void {
    this.clearDragHints();
  }

  private clearDragHints(): void {
    this.dragFrom = "";
    this.dragIds = [];
    this.hotSlot = null;
    this.armedSlots = new Set();
    this.paintBoard();
  }

  /** Зоны, готовые принять этот груз, — спрашиваем сами зоны (caps.drop.accept), а не повторяем
   *  правила: подсветка и легальность хода тогда не могут разойтись. Пачку (пробег колонки) берёт
   *  только другая колонка — в фундамент карты кладут по одной, и подсвечивать его было бы обманом. */
  private legalTargets(ids: readonly string[], from: string): ReadonlySet<string> {
    const out = new Set<string>();
    const stack = ids.length > 1;
    for (const id of Object.keys(this.tree.origins)) {
      if (id === from || (stack && !id.startsWith("tab:"))) continue;
      if (this.tree.accepts(id, ids[0]!)) out.add(id);
    }
    return out;
  }

  /** Дев-хук для e2e и ручной проверки: ЭКРАННАЯ геометрия доски. Канвас не отдаёт ни DOM-узлов,
   *  ни ролей, поэтому без него «проверено» означает «посмотрел на картинку» — а ровно так уже
   *  прошёл незамеченным неработающий драг (§6 хендоффа). Тот же приём, что `__fd` у песочницы. */
  testHooks(): {
    slots: Record<string, { x: number; y: number; w: number; h: number }>;
    cards: Record<string, { x: number; y: number; faceUp: boolean; scale: number; rot: number; state: string }>;
    topbar: Record<string, { x: number; y: number; w: number; h: number }>;
    zoom: number;
  } {
    const z = this.viewport.zoom;
    const slots: Record<string, { x: number; y: number; w: number; h: number }> = {};
    for (const [id, at] of Object.entries(this.tree.origins)) {
      const tl = this.contentToScreen(at.x, at.y);
      slots[id] = { x: tl.x, y: tl.y, w: CARD.w * z, h: CARD.h * z };
    }
    const cards: Record<string, { x: number; y: number; faceUp: boolean; scale: number; rot: number; state: string }> = {};
    for (const [id, node] of this.nodes) {
      const p = this.contentToScreen(node.body.px, node.body.py);
      // scaleVal — «подъём» плана (покой 1, драг больше): по нему тест отличает живой драг с
      // пружиной от статичного перетаскивания, которым был первый заход.
      cards[id] = { x: p.x, y: p.y, faceUp: node.faceUp, scale: node.body.scaleVal, rot: node.body.rotation, state: node.state };
    }
    return { slots, cards, topbar: this.topbar?.rects() ?? {}, zoom: z };
  }

  protected onTeardown(app: Application): void {
    for (const node of this.nodes.values()) node.destroy();
    this.nodes.clear();
    this.tex?.destroy();
    this.tex = null;
    this.topbar = null;
    this.recycle = null;
    super.onTeardown(app);
  }
}
