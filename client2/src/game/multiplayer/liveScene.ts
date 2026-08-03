import { Graphics } from "pixi.js";
import { TEX_H, TEX_W, COLORS } from "../engine/constants";
import type { SceneElement } from "../engine/sceneEngine";
import { CARD } from "../crossade/tree";
import type { CrossadeState } from "../crossade/state";
import { MultiplayerScene, type MultiplayerSceneOptions } from "./scene";
import type { MultiplayerTree } from "./tree";
import { buildLiveTree, isSharedPoint, othersInRing, LIVE_SEAT, LIVE_SEAT_CARD } from "./liveTree";
import type { GestureRelay, HandsMessage } from "./localTable";

// LIVE-СЦЕНА — тот же авторитетный стол (наследует MultiplayerScene: снимок, pending, дропы),
// плюс presence как в Figma/Miro (MULTIPLAYER-DESIGN.md, Live):
//   • сверху — остальные игроки рядами РУБАШЕК (alias-id из канала hands, порядок владельца:
//     реордер виден движением рубашек), себя сверху нет — своя рука снизу и есть индикатор;
//   • канал gesture: свои драги транслируются (grab/move/release), чужие проигрываются — карта
//     едет у всех, как её ведёт автор; над своей рукой координаты не уходят (мастер бы их и так
//     срезал — но не слать приватное вовсе честнее, чем полагаться на цензуру по пути);
//   • у каждого игрока свой цвет: карта под чьим-то пальцем носит обводку/glow цвета игрока —
//     и чужая, и своя.

/** Пауза между move-жестами в сеть: палец шлёт десятки точек в секунду, зрителям хватает ~20/с —
 *  пружина тела всё равно сглаживает путь между точками. */
const MOVE_WIRE_INTERVAL_MS = 50;

const ALIAS_RE = /^x\d+$/;

export interface LiveTableSceneOptions extends MultiplayerSceneOptions {
  /** Цвет каждого игрока (sessionId → цвет) — presence-палитра стори. */
  colors: Record<string, number>;
}

export class LiveTableScene extends MultiplayerScene {
  /** Чужие руки alias'ами (канал hands). До первого сообщения — пусто; guard ?? — поле ещё не
   *  инициализировано, когда КОНСТРУКТОР БАЗЫ строит первое дерево. */
  private aliasHands: Record<string, string[]> | undefined;
  /** Живые чужие драги: автор → карта и последняя публичная точка (null — увёл в приватную зону). */
  private remoteDrags: Map<string, { card: string; at: { x: number; y: number } | null }> | undefined;
  /** Обводки presence: карта → цвет и Graphics-ребёнок node.root. */
  private touches: Map<string, { color: number; g: Graphics }> | undefined;
  private lastMoveWireMs = 0;

  constructor(private readonly liveOpts: LiveTableSceneOptions) {
    super(liveOpts);
    this.aliasHands = {};
    this.remoteDrags = new Map();
    this.touches = new Map();
    liveOpts.room.onMessage<HandsMessage>("hands", (m) => this.applyHands(m));
    liveOpts.room.onMessage<GestureRelay>("gesture", (g) => this.applyRemoteGesture(g));
    // Свежий состав чужих рук для только что смонтированной сцены (мастер шлёт hands по мутациям).
    liveOpts.room.send("sync");
  }

  private colorOf(sessionId: string): number {
    return this.liveOpts.colors[sessionId] ?? COLORS.seatName;
  }

  // ——— дерево и карты: рубашки чужих рук поверх базового стола ———

  protected buildTree(state: CrossadeState): MultiplayerTree {
    const order = othersInRing(
      state.seats.map((s) => s.sessionId),
      state.selfSessionId,
    );
    return buildLiveTree(state, { order, hands: this.aliasHands ?? {} });
  }

  protected placeCards(state: CrossadeState, place: (cardId: string, indexInPile: number) => void): void {
    super.placeCards(state, place);
    const hands = this.aliasHands ?? {};
    for (const aliases of Object.values(hands)) aliases.forEach((a, i) => place(a, i));
  }

  protected faceUpFor(cardId: string): boolean {
    return !ALIAS_RE.test(cardId); // alias — чужая рубашка: номинала у зрителя просто нет
  }

  protected cardScaleFor(cardId: string): number {
    return ALIAS_RE.test(cardId) ? LIVE_SEAT_CARD.h / TEX_H : CARD.h / TEX_H;
  }

  /** Чужую рубашку не потащить: она вообще не элемент взаимодействия, только отражение. */
  protected canDrag(el: SceneElement): boolean {
    if (ALIAS_RE.test(el.id)) return false;
    return super.canDrag(el);
  }

  protected seatsToShow(): CrossadeState["seats"] {
    return this.state.seats.filter((s) => s.sessionId !== this.state.selfSessionId);
  }

  protected seatLabelFill(sessionId: string): number {
    return this.colorOf(sessionId);
  }

  protected seatCell(): { w: number; h: number } {
    return LIVE_SEAT;
  }

  protected seatLabelOffsetY(): number {
    return -22; // origin места указывает на РЯД РУБАШЕК; имя стоит строкой выше
  }

  /** После пересборки: вычистить осиротевший presence и вернуть чужим драгам их живые цели.
   *
   *  Сирота появляется законно: release-жест, ушедший ПОСЛЕ того как ход приняли, мастер
   *  транслирует уже под новым id (карта покинула руку — alias кончился), и clearTouch по нему
   *  не находит старую обводку. Узел рубашки rebuild уже снёс — тут дочищаются записи. */
  protected rebuildBoard(snap: boolean): void {
    super.rebuildBoard(snap);
    for (const [card] of this.touches ?? []) {
      if (!this.nodes.has(card)) this.touches!.delete(card);
    }
    for (const [from, drag] of this.remoteDrags ?? []) {
      if (!this.nodes.has(drag.card)) this.remoteDrags!.delete(from);
    }
    for (const drag of this.remoteDrags?.values() ?? []) {
      if (!drag.at) continue;
      const node = this.nodes.get(drag.card);
      if (!node) continue;
      node.setState("lifted");
      node.root.zIndex = 9e5;
      node.body.setTarget({ x: drag.at.x, y: drag.at.y, rot: 0 });
    }
  }

  // ——— presence: обводка цвета игрока ———

  private setTouch(cardId: string, color: number): void {
    const existing = this.touches?.get(cardId);
    if (existing?.color === color) return;
    if (existing) existing.g.destroy();
    const node = this.nodes.get(cardId);
    if (!node || !this.touches) return;
    // Glow + обводка цвета игрока — дети node.root (как спиннер/оверлей pending): наследуют все
    // трансформы карты, синхронизировать нечего.
    const g = new Graphics()
      .roundRect(-TEX_W / 2 - 8, -TEX_H / 2 - 8, TEX_W + 16, TEX_H + 16, 22)
      .stroke({ width: 16, color, alpha: 0.3 })
      .roundRect(-TEX_W / 2 - 2, -TEX_H / 2 - 2, TEX_W + 4, TEX_H + 4, 18)
      .stroke({ width: 5, color });
    node.root.addChild(g);
    this.touches.set(cardId, { color, g });
    this.wake();
  }

  private clearTouch(cardId: string): void {
    const t = this.touches?.get(cardId);
    if (!t) return;
    t.g.destroy();
    this.touches!.delete(cardId);
    this.wake();
  }

  // ——— свои жесты: в сеть + свой цвет на карте ———

  protected emitGesture(phase: "grab" | "move" | "release", cardId: string, cp: { x: number; y: number } | null): void {
    const room = this.liveOpts.room;
    if (phase === "release") {
      this.clearTouch(cardId);
      room.send("gesture", { kind: "release", card: cardId });
      return;
    }
    if (phase === "grab") this.setTouch(cardId, this.colorOf(this.state.selfSessionId));
    if (phase === "move") {
      const now = performance.now();
      if (now - this.lastMoveWireMs < MOVE_WIRE_INTERVAL_MS) return;
      this.lastMoveWireMs = now;
    }
    // Приватность: над своей рукой и в личной полосе мест координаты не уходят вовсе (мастер бы
    // их и так срезал — см. relayGesture, но не слать приватное честнее, чем верить цензуре).
    const shared = cp !== null && this.tree.slotAt(cp) !== "hand" && isSharedPoint(cp);
    room.send("gesture", {
      kind: phase,
      card: cardId,
      zone: shared ? "board" : "hand",
      ...(shared && cp ? { at: { x: cp.x, y: cp.y } } : {}),
    });
  }

  // ——— чужие жесты: проиграть, как сделал автор ———

  private applyRemoteGesture(g: GestureRelay): void {
    if (g.kind === "release") {
      this.remoteDrags?.delete(g.from);
      this.clearTouch(g.card);
      const node = this.nodes.get(g.card);
      // Домой пружиной; если ход примут, эхо состояния тут же перенаправит карту в новую зону.
      if (node) this.releaseElement(node);
      this.wake();
      return;
    }
    this.remoteDrags?.set(g.from, { card: g.card, at: g.at ?? null });
    this.setTouch(g.card, this.colorOf(g.from));
    const node = this.nodes.get(g.card);
    if (!node) return;
    node.setState("lifted");
    node.root.zIndex = 9e5;
    this.placeCard(node);
    if (g.at) {
      // Публичная зона: карта едет у всех ровно так, как её ведёт автор.
      node.body.setTarget({ x: g.at.x, y: g.at.y, rot: 0 });
    } else {
      // Автор увёл её в приватную зону: рубашка возвращается в ряд владельца, подсветка остаётся —
      // видно, ЧТО он драгает, но не куда (зона ответственности руки, см. дизайн-док).
      const h = this.tree.homeOf(g.card);
      if (h) node.body.setTarget({ x: h.x, y: h.y, rot: 0 });
    }
    this.wake();
  }

  private applyHands(m: HandsMessage): void {
    this.aliasHands = Object.fromEntries(Object.entries(m.hands).map(([sid, hand]) => [sid, [...hand]]));
    this.rebuildBoard(false);
  }

  /** Дев-хук live-надстройки поверх базового (см. базовый testHooks). */
  liveHooks(): { aliases: Record<string, string[]>; touches: Record<string, number>; remoteDrags: Record<string, string> } {
    return {
      aliases: this.aliasHands ?? {},
      touches: Object.fromEntries([...(this.touches ?? new Map())].map(([c, t]) => [c, t.color])),
      remoteDrags: Object.fromEntries([...(this.remoteDrags ?? new Map())].map(([from, d]) => [from, d.card])),
    };
  }
}
