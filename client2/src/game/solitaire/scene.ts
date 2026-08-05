import type { Application } from "pixi.js";
import type { SceneElement } from "../engine/sceneEngine";
import { SceneRuntime, type SceneApi, type SceneDelegate } from "../engine/sceneRuntime";
import { TEX_H } from "../engine/constants";
import { type Card, makeCard } from "../ui/Card";
import { CardTextureCache } from "../ui/CardTextureCache";
import type { TableElement } from "../engine/element";
import { SolitaireGameEngine } from "./engine";
import { buildSolitaireTree, CARD, type SolitaireTree } from "./tree";
import { fitZoom } from "../engine/fitBoard";
import { SolitaireGesture } from "./gesture";
import { SolitaireChrome } from "./chrome";
import { solitaireHooks, type SolitaireHooks } from "./hooks";

// СЦЕНА «Косынки» поверх общего слоя. Всё, что есть у любого стола, берётся из SceneEngine и здесь
// НЕ пишется: ввод (InputRouter с хит-тестом и ховером), камера (пан/зум/пинч/колесо/инерция/
// клампы/авто-скролл у кромки), драг (подъём, пружина, тень, возврат домой), цикл кадра, слитые
// тени, экранный слой HUD. Первый заход написал всё это заново «под себя» и разошёлся с песочницей
// в жестах — доктрина client2 главнее текста тикета (разбор: issue #78).
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

export class SolitaireScene implements SceneDelegate {
  /** Движок-рантайм (композиция): камера/ввод/кадр — его; сцена — делегат его швов. */
  readonly rt: SceneRuntime;
  private readonly api: SceneApi;
  readonly engine = new SolitaireGameEngine();

  private tex: CardTextureCache | null = null;
  private readonly nodes = new Map<string, Card>();
  private tree: SolitaireTree = buildSolitaireTree(this.engine.getState());
  /** Жест (что берётся, что зажигается, что значит дроп) и хром (полоса, экран фазы, переработка) —
   *  свои владельцы: gesture.ts и chrome.ts. */
  private readonly gesture: SolitaireGesture;
  private readonly chrome: SolitaireChrome;

  constructor(private readonly opts: SolitaireSceneOptions = {}) {
    this.rt = new SceneRuntime({ minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, margin: 0, align: "center" });
    this.rt.attach(this);
    this.api = this.rt.api;
    // Подписка на движок — на весь жизненный цикл сцены, а не на build(): канвас может
    // пересобираться, и слушатель задваивался бы на каждой пересборке.
    this.engine.on("move", this.onEngineMove);
    this.engine.on("win", this.onEngineWin);
    this.engine.on("lose", this.onEngineLose);
    this.gesture = new SolitaireGesture({
      engine: this.engine,
      tree: () => this.tree,
      node: (id) => this.nodes.get(id),
      wake: () => this.api.wake(),
      drag: () => this.api.drag(),
      dragCtx: () => this.api.dragCtx(),
      setDrag: (d) => this.api.setDrag(d),
      defaultBeginDrag: (el, cp, sp) => this.api.defaultBeginDrag(el, cp, sp),
      defaultElementTapped: (el) => this.api.defaultElementTapped(el),
    });
    this.chrome = new SolitaireChrome({
      chromeAdd: (node) => this.api.chromeAdd(node),
      surfaceAdd: (node) => this.api.surfaceAdd(node),
      setChromeButtons: (btns) => this.api.setChromeButtons(btns),
      setTableButtons: (btns) => this.api.setButtons(btns),
      onBack: () => this.opts.onBack?.(),
      newGame: () => this.newGame(),
      dealStock: () => this.engine.dealStock(),
    });
  }

  // ——— хост-API (тонкие двери в рантайм): интерфейс хоста не изменился ———

  mount(host: HTMLElement, width: number, height: number): Promise<void> {
    return this.rt.mount(host, width, height);
  }

  destroy(): void {
    this.rt.destroy();
  }

  // ——————————————————————————————————————————————————————————————————————
  // Сборка
  // ——————————————————————————————————————————————————————————————————————

  buildScene(app: Application): void {
    this.tex = new CardTextureCache(app);
    this.api.surfaceAdd(this.gesture.slotLayer);
    this.chrome.build();
    this.refresh(true);
  }

  layoutChrome(w: number, h: number): void {
    this.chrome.layout(w, h);
  }

  chromeInsetTop(): number {
    return this.chrome.insetTop();
  }

  onBooted(): void {
    this.fitBoard();
  }

  // Раскладка доски от экрана НЕ зависит (размер карты — константа, issue #68): ресайз только
  // заново вписывает доску камерой, пересобирать сцену не нужно.
  onSceneResize(): void {
    this.fitBoard();
  }

  /** Вписать доску в свободную часть экрана. Зум не задираем выше 1: на большом мониторе доска
   *  рисуется в своём размере, а ужимается только когда реально не влезает. */
  private fitBoard(): void {
    this.api.syncVp();
    const fit = { viewW: this.api.width(), viewH: this.api.height(), insetTop: this.chromeInsetTop(), size: this.tree.size };
    this.api.viewport().setZoom(fitZoom(fit));
    this.showView();
  }

  /** Показать текущий вид: пределы, трансформ, оповещение подписчиков — всегда этой тройкой. */
  private showView(): void {
    this.api.clampView();
    this.api.applyView();
    this.api.emitView();
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
    this.api.byId.clear();
    if (!this.tex) return; // ещё не смонтированы — buildScene и так возьмёт свежее состояние
    this.refresh(true);
    this.fitBoard();
  }

  private onEngineMove = (): void => {
    this.refresh();
  };

  // Победа/поражение приходят из движка правил — сцена только показывает итог, сама его не считает.
  private onEngineWin = (): void => this.onEngineEnd();
  private onEngineLose = (): void => this.onEngineEnd();

  private onEngineEnd(): void {
    this.chrome.sync(this.engine.getState(), this.tree);
    this.api.wake();
  }

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
        node.setState(node.pose);
        this.api.placeCard(node);
        const target = { x: home.x, y: home.y, rot: 0, scale: node.restScale };
        if (snap) node.body.snapTo(target);
        else node.body.setTarget(target);
      }
    }
    for (const [cardId, node] of this.nodes) {
      if (alive.has(cardId)) continue;
      node.destroy();
      this.nodes.delete(cardId);
      this.api.byId.delete(cardId);
    }

    this.api.setContentSize(this.tree.size.w, this.tree.size.h);
    this.chrome.sync(state, this.tree);
    this.gesture.paint();
    this.showView();
    this.api.wake();
  }

  private nodeFor(cardId: string, faceUp: boolean): Card {
    const existing = this.nodes.get(cardId);
    if (existing) return existing;
    // baseScale — переходник между текстурой карты (TEX_W×TEX_H) и ячейкой доски. При baseScale=1
    // карта была бы втрое больше слота (этот баг гейты не видят: Pixi в node не исполняется).
    const node = makeCard({ id: cardId, card: cardId, faceUp, flippable: true }, this.tex!, CARD.h / TEX_H);
    this.nodes.set(cardId, node);
    this.api.byId.set(cardId, node);
    return node;
  }

  // ——————————————————————————————————————————————————————————————————————
  // Швы домена: только то, чего у голой сцены со столом нет
  // ——————————————————————————————————————————————————————————————————————

  draggables(): SceneElement[] {
    return [...this.nodes.values()];
  }

  pickElement(cx: number, cy: number): SceneElement | null {
    return this.chrome.overlayVisible ? null : this.api.defaultPickElement(cx, cy);
  }

  everyElement(): TableElement[] {
    return [...this.nodes.values()];
  }

  homeOf(el: SceneElement): { home: { x: number; y: number }; depth: number } | null {
    const home = this.tree.homeOf(el.id);
    return home ? { home, depth: this.tree.depthOf(el.id) } : null;
  }

  canDrag(el: SceneElement): boolean {
    return this.gesture.canDrag(el);
  }

  onElementTapped(el: SceneElement): void {
    this.gesture.tapped(el);
  }

  beginDrag(el: SceneElement, cp: { x: number; y: number }, sp: { x: number; y: number }): boolean {
    return this.gesture.begin(el, cp, sp);
  }

  onDragMoved(p: { x: number; y: number }): void {
    this.gesture.moved(p);
  }

  resolveDrop(_el: SceneElement, cp: { x: number; y: number }): void {
    this.gesture.resolve(cp);
  }

  onDragCancel(): void {
    this.gesture.end();
  }

  afterDragEnd(): void {
    this.gesture.end();
  }

  /** Дев-хук для e2e и ручной проверки (hooks.ts). */
  testHooks(): SolitaireHooks {
    const z = this.api.viewport().zoom;
    return solitaireHooks(this.tree, this.nodes, this.chrome.rects(), z, (x, y) => this.api.contentToScreen(x, y));
  }

  onTeardown(_app: Application): void {
    for (const node of this.nodes.values()) node.destroy();
    this.nodes.clear();
    this.tex?.destroy();
    this.tex = null;
    this.chrome.destroy();
  }
}
