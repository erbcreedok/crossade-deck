import { Application, Graphics, Text } from "pixi.js";
import { SceneEngine, type SceneElement } from "../engine/sceneEngine";
import { TEX_H, PIXEL_FONT, COLORS } from "../engine/constants";
import { Card } from "../ui/Card";
import { CardTextureCache } from "../ui/CardTextureCache";
import type { TableElement } from "../engine/element";
import { dropTarget } from "../slot/slot";
import { CARD, SEAT } from "../crossade/tree";
import { buildMultiplayerTree, type MultiplayerTree } from "./tree";
import type { CrossadeState } from "../crossade/state";
import { makePort, bindRoom, type BindableRoom, type CrossadePort, type CrossadeSignal, type SendableRoom } from "../crossade/net";
import { sameOrder, sameZones } from "../crossade/diff";
import { paintSlots } from "../crossade/slotPaint";
import { handOrderAfterDrop } from "../crossade/handOrder";

// СЦЕНА ДЕБАГ-СТОЛА MULTIPLAYER — усечённый CrossadeScene (см. crossade/scene.ts, доктрина та же):
// снимок сети — единственная правда, ход уходит в порт, сцена правил не дублирует. Всё, чего тут
// НЕТ по сравнению с Crossade, вычеркнуто дизайном (docs/MULTIPLAYER-DESIGN.md): колода, сброс,
// фазы, дилер, HUD-кнопки — у дебаг-стола одна общая зона и своя рука, руки уже розданы мастером.
//
// Room сюда приходит duck-типом (SendableRoom & BindableRoom) — в стори это LocalClient локального
// мастера (localTable.ts), на проде может быть настоящая colyseus-комната. Сцена разницы не видит.

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2.5;

export interface MultiplayerSceneOptions {
  room: SendableRoom & BindableRoom;
  selfSessionId: string;
}

function emptyState(selfSessionId: string): CrossadeState {
  return {
    phase: "playing",
    freeMode: true,
    deckFanned: false,
    deckRev: 0,
    inviteCode: "",
    deck: [],
    discard: [],
    play: [],
    seats: [],
    selfSessionId,
    selfHand: [],
  };
}

function topOf(arr: readonly string[]): string | undefined {
  return arr[arr.length - 1];
}

export class MultiplayerScene extends SceneEngine {
  private tex: CardTextureCache | null = null;
  private readonly nodes = new Map<string, Card>();
  private readonly cardDepth = new Map<string, number>();
  private readonly seatLabels = new Map<string, Text>();
  private readonly slotLayer = new Graphics();
  private notice!: Text;

  private state: CrossadeState;
  private tree: MultiplayerTree;
  private readonly port: CrossadePort;
  private readonly disposeRoom: () => void;

  private hotSlot: string | null = null;
  private armedSlots: ReadonlySet<string> = new Set();

  constructor(opts: MultiplayerSceneOptions) {
    super({ minZoom: MIN_ZOOM, maxZoom: MAX_ZOOM, margin: 0, align: "center" });
    this.state = emptyState(opts.selfSessionId);
    this.tree = buildMultiplayerTree(this.state);
    this.port = makePort(opts.room);
    const bound = bindRoom(opts.room, { self: opts.selfSessionId, onState: this.applyState, onSignal: this.applySignal });
    this.disposeRoom = bound.dispose;
  }

  protected buildScene(app: Application): void {
    this.tex = new CardTextureCache(app);
    this.scene.surface.addChild(this.slotLayer);
    this.notice = new Text({ text: "", style: { fontFamily: PIXEL_FONT, fontSize: 18, fill: 0xe0483f, align: "center" } });
    this.notice.anchor.set(0.5, 0);
    this.notice.visible = false;
    this.chrome.addChild(this.notice);
    this.rebuildBoard(true);
  }

  protected layoutChrome(w: number): void {
    this.notice.position.set(w / 2, 8);
  }

  protected onBooted(): void {
    this.fitBoard();
    super.onBooted();
  }

  protected onSceneResize(): void {
    this.fitBoard();
  }

  private fitBoard(): void {
    this.syncVp();
    this.viewport.setZoom(Math.min(1, this.width / this.tree.size.w, this.height / this.tree.size.h));
    this.clampView();
    this.applyView();
    this.emitView();
  }

  // ——— сеть → доска ———

  private applyState = (next: CrossadeState): void => {
    const prev = this.state;
    this.state = next;
    // Ленивый дифф — то же правило, что у Crossade: пересборка только когда зоны реально изменились.
    if (sameZones(prev, next)) return;
    this.rebuildBoard(false);
  };

  private applySignal = (signal: CrossadeSignal): void => {
    if (signal.kind === "action_rejected") this.showNotice(signal.reason || signal.action || "нельзя");
  };

  private showNotice(text: string): void {
    this.notice.text = text;
    this.notice.visible = true;
    this.wake();
    this.after(2, () => {
      this.notice.visible = false;
      this.wake();
    });
  }

  /** Свести доску со снимком (см. crossade/scene.ts#rebuildBoard — механика 1:1, состав слотов свой). */
  private rebuildBoard(snap: boolean): void {
    const state = this.state;
    this.tree = buildMultiplayerTree(state);
    if (!this.tex) return; // сцена ещё не собрана — дерево уже актуально, рисовать не на чем

    const alive = new Set<string>();
    this.cardDepth.clear();
    const slotOrder = new Map<string, number>();
    Object.keys(this.tree.origins).forEach((id, i) => slotOrder.set(id, i));

    const place = (cardId: string, indexInPile: number): void => {
      alive.add(cardId);
      const slot = this.tree.slotOf(cardId);
      const home = this.tree.homeOf(cardId);
      if (!slot || !home) return;
      const node = this.nodeFor(cardId);
      const depth = (slotOrder.get(slot) ?? 0) * 1000 + indexInPile;
      this.cardDepth.set(cardId, depth);
      node.root.zIndex = depth;
      node.setState(node.pose);
      this.placeCard(node);
      const target = { x: home.x, y: home.y, rot: 0, scale: node.restScale };
      if (snap) node.body.snapTo(target);
      else node.body.setTarget(target);
    };

    state.play.forEach((stack) => stack.forEach((c, i) => place(c, i)));
    state.selfHand.forEach((c, i) => place(c, i));

    for (const [cardId, node] of this.nodes) {
      if (alive.has(cardId)) continue;
      node.destroy();
      this.nodes.delete(cardId);
      this.byId.delete(cardId);
    }

    this.contentW = this.tree.size.w;
    this.contentH = this.tree.size.h;
    this.syncSeats();
    this.paintBoard();
    this.clampView();
    this.applyView();
    this.emitView();
    this.wake();
  }

  /** На этом столе всё лицом вверх: рука — своя (мастер чужих карт в снимок не кладёт),
   *  play-зона открыта по определению. */
  private nodeFor(cardId: string): Card {
    const existing = this.nodes.get(cardId);
    if (existing) return existing;
    // flippable: true — НЕ приглашение переворачивать (сцена flip не зовёт), а способ не носить
    // замочек: flippable: false рисует lock-бейдж (Card.ts#buildLock), лишний на открытом столе.
    const node = new Card({ id: cardId, card: cardId, faceUp: true, flippable: true }, this.tex!, CARD.h / TEX_H);
    this.nodes.set(cardId, node);
    this.byId.set(cardId, node);
    return node;
  }

  /** Места игроков — имя + счёт карт, своё место помечено. Чужие карты не рисуются вовсе:
   *  «другим не видно» здесь не правило отображения, а отсутствие данных (см. snapshotFrom). */
  private syncSeats(): void {
    const seen = new Set<string>();
    for (const seat of this.state.seats) {
      seen.add(seat.sessionId);
      let label = this.seatLabels.get(seat.sessionId);
      if (!label) {
        label = new Text({ style: { fontFamily: PIXEL_FONT, fontSize: 13, align: "center" } });
        label.anchor.set(0.5, 0);
        this.scene.surface.addChild(label);
        this.seatLabels.set(seat.sessionId, label);
      }
      const mark = seat.sessionId === this.state.selfSessionId ? " ◄ вы" : "";
      label.text = `${seat.name}${mark}\n${seat.handCount}`;
      label.style.fill = seat.sessionId === this.state.selfSessionId ? COLORS.gold : COLORS.seatName;
      const at = this.tree.origins[`seat:${seat.sessionId}`];
      if (at) label.position.set(at.x + SEAT.w / 2, at.y);
    }
    for (const [id, label] of this.seatLabels) {
      if (seen.has(id)) continue;
      label.destroy();
      this.seatLabels.delete(id);
    }
  }

  private paintBoard(): void {
    const ids = Object.keys(this.tree.origins).filter((id) => id.startsWith("play:"));
    paintSlots(this.slotLayer, { origins: this.tree.origins, ids, cell: CARD, armed: this.armedSlots, hot: this.hotSlot });
  }

  // ——— швы домена ———

  protected draggables(): SceneElement[] {
    return [...this.nodes.values()];
  }

  protected everyElement(): TableElement[] {
    return [...this.nodes.values()];
  }

  protected homeOf(el: SceneElement): { home: { x: number; y: number }; depth: number } | null {
    const home = this.tree.homeOf(el.id);
    return home ? { home, depth: this.cardDepth.get(el.id) ?? 0 } : null;
  }

  /** Тащить можно карту своей руки и ВЕРХ любой кучки — общая зона, забирает любой игрок. */
  protected canDrag(el: SceneElement): boolean {
    const slot = this.tree.slotOf(el.id);
    if (slot === "hand") return true;
    if (slot?.startsWith("play:") && slot !== "play:new") {
      const stack = this.state.play[Number(slot.slice(5))];
      return stack ? topOf(stack) === el.id : false;
    }
    return false;
  }

  protected beginDrag(el: SceneElement, cp: { x: number; y: number }, sp: { x: number; y: number }): boolean {
    this.armedSlots = this.legalTargets(this.tree.slotOf(el.id) ?? "");
    this.paintBoard();
    return super.beginDrag(el, cp, sp);
  }

  protected onDragMoved(p: { x: number; y: number }): void {
    const target = dropTarget(this.tree.root, p);
    const id = target?.group.id ?? null;
    const hot = id && this.armedSlots.has(id) ? id : null;
    if (hot === this.hotSlot) return;
    this.hotSlot = hot;
    this.paintBoard();
    this.wake();
  }

  /** Дроп — команда порту, правила решает мастер/сервер (см. crossade/scene.ts#resolveDrop). */
  protected resolveDrop(el: SceneElement, cp: { x: number; y: number }): void {
    const drag = this.drag;
    if (!drag) return;
    const from = this.tree.slotOf(el.id);
    const target = dropTarget(this.tree.root, cp);
    const to = target?.group.id ?? null;

    if (from === "hand" && to === "hand") {
      this.reorderHand(el.id, target!.index);
    } else if (from === "hand" && to?.startsWith("play:")) {
      if (to === "play:new") this.port.playCard(el.id);
      else this.port.playCard(el.id, Number(to.slice(5)));
    } else if (from?.startsWith("play:") && to === "hand") {
      this.port.takePlay(el.id);
    }
    // Прочие переходы (кучка → кучка напрямую) — не этот стол: карта летит на прежнее место.

    drag.release();
  }

  /** Оптимистичный реордер своей руки — дословно правило crossade/scene.ts#reorderHand: мутируем
   *  ПОЛЕ state.selfHand (bindRoom держит тот же объект как prev), иначе эхо сервера откатит руку. */
  private reorderHand(cardId: string, toIndex: number): void {
    const hand = this.state.selfHand;
    const next = handOrderAfterDrop(hand, cardId, toIndex);
    if (sameOrder(next, hand)) return;
    this.state.selfHand = next;
    this.rebuildBoard(false);
    this.port.setHandOrder(next);
  }

  protected onDragCancel(): void {
    this.clearDragHints();
  }

  protected afterDragEnd(): void {
    this.clearDragHints();
  }

  private clearDragHints(): void {
    this.hotSlot = null;
    this.armedSlots = new Set();
    this.paintBoard();
  }

  private legalTargets(from: string): ReadonlySet<string> {
    const out = new Set<string>();
    if (from === "hand") {
      out.add("hand"); // реордер — легальный переход, контур рука не носит (paintBoard рисует play)
      for (const id of Object.keys(this.tree.origins)) if (id.startsWith("play:")) out.add(id);
    } else if (from.startsWith("play:")) {
      out.add("hand");
    }
    return out;
  }

  /** Дев-хук для e2e/стори — экранная геометрия (канвас не отдаёт ни DOM-узлов, ни ролей). */
  testHooks(): {
    slots: Record<string, { x: number; y: number }>;
    cards: Record<string, { x: number; y: number; slot: string | null }>;
    hand: string[];
    play: string[][];
  } {
    const slots: Record<string, { x: number; y: number }> = {};
    for (const [id, at] of Object.entries(this.tree.origins)) slots[id] = this.contentToScreen(at.x, at.y);
    const cards: Record<string, { x: number; y: number; slot: string | null }> = {};
    for (const [id, node] of this.nodes) {
      const p = this.contentToScreen(node.body.px, node.body.py);
      cards[id] = { x: p.x, y: p.y, slot: this.tree.slotOf(id) };
    }
    return { slots, cards, hand: [...this.state.selfHand], play: this.state.play.map((s) => [...s]) };
  }

  protected onTeardown(app: Application): void {
    this.disposeRoom();
    for (const node of this.nodes.values()) node.destroy();
    this.nodes.clear();
    for (const label of this.seatLabels.values()) label.destroy();
    this.seatLabels.clear();
    this.tex?.destroy();
    this.tex = null;
    super.onTeardown(app);
  }
}
