// ОБЩАЯ СЦЕНА СЕТЕВОГО СТОЛА — то, что у Crossade и у дебаг-стола Multiplayer совпадало дословно.
// Сама она почти ничего не делает руками: держит снимок, дерево и порт, а работу ведут владельцы —
// узлы карт (boardSync.ts), жест (tableDrag.ts), подписи мест (seatLabels.ts), надпись отказа
// (notice.ts). Здесь остаются только проводка, швы столов и то, что обязано быть в одном месте.
//
// Доктрина, которую база обязана сохранять: снимок сети — единственная правда (ход уходит в порт,
// правил сцена не проверяет и не дублирует — они данные, moveRules.ts), а дифф снимков ЛЕНИВЫЙ
// (diff.ts#sameZones): colyseus зовёт onStateChange на КАЖДЫЙ патч, включая те, что доски не
// касаются (чьё-то «готов»), и перекладывать карты нужно только когда зоны реально изменились.
//
// Наследование здесь ровно одно и по делу: база ↔ стол — это один и тот же стол с другим составом
// слотов, а не два объекта с общей утилитой. Всё, что можно было отдать композиции, отдано.

import { Application, Graphics } from "pixi.js";
import type { SceneElement } from "../engine/sceneEngine";
import { SceneRuntime, type SceneApi, type SceneDelegate } from "../engine/sceneRuntime";
import { TEX_H } from "../engine/constants";
import type { Card } from "../ui/Card";
import { CardTextureCache } from "../ui/CardTextureCache";
import type { TableElement } from "../engine/element";
import type { Pt } from "../engine/sceneContract";
import { CARD } from "./tree";
import type { NetTree } from "./netTree";
import type { CrossadeSeat, CrossadeState } from "./state";
import { makePort, bindRoom, type BindableRoom, type CrossadePort, type CrossadeSignal, type SendableRoom } from "./net";
import { sameZones } from "./diff";
import type { ServerMove } from "./moveIntent";
import { fitZoom } from "../engine/fitBoard";
import { SceneBoardSync } from "./boardSync";
import { SceneTableDrag, type DragHints, type OwnGesture } from "./tableDrag";
import { SceneNotice } from "./notice";
import { SceneSeatLabels, type SeatStyle } from "./seatLabels";

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

export interface NetTableOptions {
  /** Комната приходит duck-типом: в стори это локальный мастер, на проде — colyseus. Сцена разницы
   *  не видит (см. multiplayer/localTable.ts). */
  room: SendableRoom & BindableRoom;
  selfSessionId: string;
}

export abstract class NetTableScene<T extends NetTree = NetTree> implements SceneDelegate {
  /** Движок-рантайм (композиция): камера/ввод/кадр — его; сцена — делегат его швов. */
  readonly rt: SceneRuntime;
  protected readonly api: SceneApi;
  protected tex: CardTextureCache | null = null;
  protected readonly slotLayer = new Graphics();
  /** Надпись живёт в слое ХРОМА, а слои появляются только на mount — потому собирается в buildScene,
   *  и до него её нет: каждый вызов через `?.`. */
  protected notice: SceneNotice | null = null;
  protected readonly seatLabels: SceneSeatLabels;
  private readonly board: SceneBoardSync;
  private readonly dragger: SceneTableDrag;

  protected state: CrossadeState;
  protected tree: T;
  protected readonly port: CrossadePort;
  private readonly room: NetTableOptions;
  private disposeRoom: (() => void) | null = null;

  constructor(opts: NetTableOptions, initial: CrossadeState) {
    this.rt = new SceneRuntime({ minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, margin: 0, align: "center" });
    this.rt.attach(this);
    this.api = this.rt.api;
    this.state = initial;
    this.tree = this.buildTree(initial);
    this.port = makePort(opts.room);
    this.seatLabels = new SceneSeatLabels({
      surfaceAdd: (c) => this.api.surfaceAdd(c),
      origin: (id) => this.tree.origins[id],
      style: () => this.seatStyle(),
    });
    this.board = new SceneBoardSync({
      tree: () => this.tree,
      tex: () => this.tex!,
      placeCards: (state, place) => this.placeCards(state, place),
      faceUpFor: (id, slot) => this.faceUpFor(id, slot),
      cardScaleFor: (id) => this.cardScaleFor(id),
      heldOutOfHome: (id) => this.heldOutOfHome(id),
      placeCard: (node) => this.api.placeCard(node),
      register: (id, node) => this.api.byId.set(id, node),
      unregister: (id) => this.api.byId.delete(id),
    });
    this.dragger = new SceneTableDrag({
      tree: () => this.tree,
      state: () => this.state,
      port: () => this.port,
      held: (id) => this.heldOutOfHome(id),
      repaint: () => this.repaint(),
      wake: () => this.api.wake(),
      drag: () => this.api.drag(),
      defaultBeginDrag: (el, cp, sp) => this.api.defaultBeginDrag(el, cp, sp),
      hold: (move, el, cp) => this.holdForAnswer(move, el, cp),
      hand: () => this.state.selfHand,
      setHand: (next) => void (this.state.selfHand = next),
      rebuild: () => this.rebuildBoard(false),
      gesture: () => this.ownGesture(),
    });
    this.room = opts;
  }

  // ——— хост-API (тонкие двери в рантайм) ———

  /** Подписка на комнату — ЗДЕСЬ, а не в конструкторе: onStateChange отдаёт снимок СИНХРОННО при
   *  подписке («как при джойне», см. multiplayer/localTable.ts), а конструктор базы выполняется
   *  раньше полей наследника — снимок застал бы стол недостроенным и уронил монтирование. Ничего не
   *  теряется: до mount и рисовать не на чем. */
  mount(host: HTMLElement, width: number, height: number): Promise<void> {
    this.disposeRoom ??= bindRoom(this.room.room, {
      self: this.room.selfSessionId,
      onState: this.applyState,
      onSignal: this.applySignal,
    }).dispose;
    return this.rt.mount(host, width, height);
  }

  destroy(): void {
    this.rt.destroy();
  }

  /** Узлы карт: читают наследники (live-надстройка водит их сама) и дев-хуки. Владелец — boardSync. */
  protected get nodes(): ReadonlyMap<string, Card> {
    return this.board.nodes;
  }

  // ——— Швы столов ———

  /** Какое дерево слотов строит этот стол. Зовётся и из КОНСТРУКТОРА БАЗЫ — поля наследника в этот
   *  момент ещё не инициализированы, переопределение обязано это переживать. */
  protected abstract buildTree(state: CrossadeState): T;

  /** Раздать place() все карты доски — порядок вызовов задаёт z между зонами (см. boardSync.ts). */
  protected abstract placeCards(state: CrossadeState, place: (cardId: string, indexInPile: number) => void): void;

  /** Нарисовать контуры слотов и подписи зон: состав слотов у столов разный. Подсказки жеста
   *  приходят параметром — у стола нет своего мнения о том, что сейчас зажжено. */
  protected abstract paintBoard(hints: DragHints): void;

  /** Хром стола (HUD, топбар) — у дебаг-стола его нет. Зовётся из buildScene до первой раздачи. */
  protected buildChrome(): void {}

  /** Лицом или рубашкой создаётся карта. Слот нужен, чтобы не заводить поле снимка на структурное
   *  правило: номинал колоды не виден никому, пока карта её не покинула (CLAUDE.md, «Dealing is
   *  always on»). */
  protected faceUpFor(_cardId: string, slot: string): boolean {
    return slot !== "deck";
  }

  /** Масштаб карты по id — рубашки чужих рук у live-стола мельче стольных. */
  protected cardScaleFor(_cardId: string): number {
    return CARD.h / TEX_H;
  }

  /** Карта, которую по дому НЕ разводят: её держит кто-то другой (ожидание ответа сервера на
   *  дебаг-столе). Живой она при этом считается — сносить её нельзя. */
  protected heldOutOfHome(_cardId: string): boolean {
    return false;
  }

  /** Как этот стол подписывает места (состав, текст, цвет, ячейка) — см. seatLabels.ts#SeatStyle. */
  protected abstract seatStyle(): SeatStyle;

  /** Снимок применён, зоны ещё не сведены: место для того, что от зон не зависит (HUD, снятие
   *  ожиданий). Зовётся на КАЖДЫЙ патч, в том числе когда доску пересобирать не будут. */
  protected onSnapshot(_prev: CrossadeState, _next: CrossadeState): void {}

  /** Сигнал комнаты (кроме action_rejected — его надпись база показывает сама). */
  protected onSignal(_signal: CrossadeSignal): void {}

  /** Куда уходит свой жест (tableDrag.ts#OwnGesture). null — никуда: стол его не транслирует. */
  protected ownGesture(): OwnGesture | null {
    return null;
  }

  /** Задержать карту в точке дропа до ответа сервера. true — домой её НЕ отпускают. */
  protected holdForAnswer(_move: ServerMove, _el: SceneElement, _cp: Pt): boolean {
    return false;
  }

  protected onTeardownExtra(): void {}

  // ——— Сборка и камера ———

  buildScene(app: Application): void {
    this.tex = new CardTextureCache(app);
    this.api.surfaceAdd(this.slotLayer);
    this.notice = new SceneNotice(this.api);
    this.buildChrome();
    this.rebuildBoard(true);
  }

  /** Сколько сверху занято хромом (у стола без хрома — ноль): вписывание считает fitBoard.ts. */
  chromeInsetTop(): number {
    return 0;
  }

  onBooted(): void {
    this.fitBoard();
  }

  onSceneResize(): void {
    this.fitBoard();
  }

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

  // ——— Сеть → доска ———

  private applyState = (next: CrossadeState): void => {
    const prev = this.state;
    this.state = next;
    this.onSnapshot(prev, next);
    if (sameZones(prev, next)) return; // ленивый дифф — см. заголовок файла
    this.rebuildBoard(false);
  };

  private applySignal = (signal: CrossadeSignal): void => {
    if (signal.kind === "action_rejected") this.notice?.show(signal.reason || signal.action || "нельзя");
    this.onSignal(signal);
  };

  /** Свести доску со снимком: дерево → узлы → подписи → контуры → камера. */
  protected rebuildBoard(snap: boolean): void {
    this.tree = this.buildTree(this.state);
    if (!this.tex) return; // сцена ещё не собрана — дерево уже актуально, рисовать не на чем
    this.board.sync(this.state, snap);
    this.api.setContentSize(this.tree.size.w, this.tree.size.h);
    this.seatLabels.sync();
    this.repaint();
    this.showView();
    this.api.wake();
  }

  private repaint(): void {
    this.paintBoard({ armed: this.dragger.armed, hot: this.dragger.hot });
  }

  // ——— Швы домена: реестры и жест ———

  draggables(): SceneElement[] {
    return [...this.board.nodes.values()];
  }

  everyElement(): TableElement[] {
    return [...this.board.nodes.values()];
  }

  homeOf(el: SceneElement): { home: Pt; depth: number } | null {
    const home = this.tree.homeOf(el.id);
    return home ? { home, depth: this.board.depth(el.id) } : null;
  }

  canDrag(el: SceneElement): boolean {
    return this.dragger.canDrag(el);
  }

  beginDrag(el: SceneElement, cp: Pt, sp: Pt): boolean {
    return this.dragger.begin(el, cp, sp);
  }

  onDragMoved(p: Pt): void {
    this.dragger.moved(p);
  }

  resolveDrop(el: SceneElement, cp: Pt): void {
    this.dragger.resolve(el, cp);
  }

  onDragCancel(): void {
    this.dragger.end();
  }

  afterDragEnd(): void {
    this.dragger.end();
  }

  onTeardown(_app: Application): void {
    this.disposeRoom?.(); // сцену могли снести, ни разу не смонтировав
    this.disposeRoom = null;
    this.onTeardownExtra();
    this.board.destroy();
    this.seatLabels.destroy();
    this.tex?.destroy();
    this.tex = null;
  }
}
