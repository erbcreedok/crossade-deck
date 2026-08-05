import { COLORS } from "../engine/constants";
import type { SceneElement } from "../engine/sceneEngine";
import { CARD, SEAT } from "../crossade/tree";
import { NetTableScene, type NetTableOptions } from "../crossade/tableScene";
import { emptyTableState, type CrossadeState } from "../crossade/state";
import type { SeatStyle } from "../crossade/seatLabels";
import type { CrossadeSignal } from "../crossade/net";
import { paintSlots } from "../crossade/slotPaint";
import type { ServerMove } from "../crossade/moveIntent";
import type { DragHints, OwnGesture } from "../crossade/tableDrag";
import { buildMultiplayerTree, type MultiplayerTree } from "./tree";
import { ScenePendingMoves } from "./pendingMoves";
import type { PendingKind } from "./pending";

// СЦЕНА ДЕБАГ-СТОЛА MULTIPLAYER — усечённый сетевой стол (общая база — crossade/tableScene.ts):
// снимок сети — единственная правда, ход уходит в порт, сцена правил не дублирует. Всё, чего тут
// НЕТ по сравнению с Crossade, вычеркнуто дизайном (docs/MULTIPLAYER-DESIGN.md): колода, сброс,
// фазы, дилер, HUD-кнопки — у дебаг-стола одна общая зона и своя рука, руки уже розданы мастером.
//
// Своё против базы — ровно два: ожидание ответа сервера на каждый ход (pendingMoves.ts) и швы для
// live-надстройки (liveScene.ts): дерево, состав карт, вид карты, трансляция жестов.

export type MultiplayerSceneOptions = NetTableOptions;

/** Каких ходов этот стол ЖДЁТ от сервера. Ходов колоды тут нет вовсе — в дереве дебаг-стола нет её
 *  слота (tree.ts), так что routeDrop их и не вернёт. */
const PENDING_OF: Partial<Record<ServerMove["kind"], PendingKind>> = {
  play_card: "play_card",
  discard_card: "discard_card",
  take_play: "take_play",
  take_discard: "take_discard",
};

export class MultiplayerScene extends NetTableScene<MultiplayerTree> {
  protected readonly pending: ScenePendingMoves;
  /** Смещение центра карты от пальца на СТАРТЕ драга — им считается точка касания на элементе. */
  private grabOffset = { x: 0, y: 0 };
  /** Чью карту сейчас ведёт СВОЙ палец — для эмиссии release, у которого нет точки. */
  private dragCardId: string | null = null;

  constructor(opts: MultiplayerSceneOptions) {
    super(opts, emptyTableState(opts.selfSessionId, { phase: "playing", freeMode: true }));
    this.pending = new ScenePendingMoves({
      node: (id) => this.nodes.get(id),
      after: (s, fn) => this.api.after(s, fn),
      wake: () => this.api.wake(),
      release: (node) => this.api.releaseElement(node),
      notify: (text) => this.notice?.show(text),
    });
  }

  // ——— состав стола ———

  protected buildTree(state: CrossadeState): MultiplayerTree {
    return buildMultiplayerTree(state);
  }

  /** Сброс в базовом дереве слота не имеет и потому не рисуется (place молча пропускает карту без
   *  слота) — наследник со сбросом получает его бесплатно. */
  protected placeCards(state: CrossadeState, place: (cardId: string, indexInPile: number) => void): void {
    state.play.forEach((stack) => stack.forEach((c, i) => place(c, i)));
    state.discard.forEach((c, i) => place(c, i));
    state.selfHand.forEach((c, i) => place(c, i));
  }

  protected paintBoard({ armed, hot }: DragHints): void {
    const ids = Object.keys(this.tree.origins).filter((id) => id.startsWith("play:") || id === "discard");
    paintSlots(this.slotLayer, { origins: this.tree.origins, ids, cell: CARD, armed, hot });
  }

  layoutChrome(w: number): void {
    this.notice?.place(w / 2, 8);
  }

  /** Имя + счёт карт, своё место помечено. Чужие карты не рисуются: их нет в снимке. */
  protected seatStyle(): SeatStyle {
    const self = this.state.selfSessionId;
    return {
      seats: this.state.seats,
      caption: (seat) => `${seat.name}${seat.sessionId === self ? " ◄ вы" : ""}\n${seat.handCount}`,
      fill: (seat) => (seat.sessionId === self ? COLORS.gold : COLORS.seatName),
      cell: SEAT,
    };
  }

  // ——— ожидание ответа сервера ———

  /** Одобрения снимаются ДО пересборки доски (см. ScenePendingMoves#clearApproved). */
  protected onSnapshot(_prev: CrossadeState, next: CrossadeState): void {
    this.pending.clearApproved({ play: next.play, discard: next.discard, selfHand: next.selfHand });
  }

  protected onSignal(signal: CrossadeSignal): void {
    if (signal.kind === "action_rejected") this.pending.applyRejected(signal.cards);
  }

  protected heldOutOfHome(cardId: string): boolean {
    return this.pending.has(cardId);
  }

  /** Переходы «в другую зону» НЕ отпускаются домой: карта повисает в точке дропа до ответа сервера —
   *  иначе при заметной задержке она успевала долететь до руки и лишь потом прыгала в зону. */
  protected holdForAnswer(move: ServerMove, el: SceneElement, cp: { x: number; y: number }): boolean {
    const kind = PENDING_OF[move.kind];
    if (!kind) return false;
    this.pending.begin(el.id, kind, cp, this.grabOffset);
    return true;
  }

  stepScene(dt: number): boolean {
    return this.pending.step(dt);
  }

  // ——— свои жесты (live-надстройка транслирует их в сеть) ———

  /** Жесты драга для трансляции (live-режим): база молчит. Фаза "release" приходит без точки. */
  protected emitGesture(_phase: "grab" | "move" | "release", _cardId: string, _cp: { x: number; y: number } | null): void {}

  protected ownGesture(): OwnGesture {
    return {
      begin: (el, cp) => {
        this.grabOffset = { x: el.body.px - cp.x, y: el.body.py - cp.y };
        this.dragCardId = el.id;
        this.emitGesture("grab", el.id, cp);
      },
      point: (p) => {
        if (this.dragCardId) this.emitGesture("move", this.dragCardId, p);
      },
      end: () => {
        if (!this.dragCardId) return;
        this.emitGesture("release", this.dragCardId, null);
        this.dragCardId = null;
      },
    };
  }

  protected onTeardownExtra(): void {
    this.pending.destroy();
  }

  /** Дев-хук для e2e/стори — экранная геометрия (канвас не отдаёт ни DOM-узлов, ни ролей). */
  testHooks(): {
    slots: Record<string, { x: number; y: number }>;
    cards: Record<string, { x: number; y: number; slot: string | null }>;
    hand: string[];
    play: string[][];
    pending: string[];
  } {
    const slots: Record<string, { x: number; y: number }> = {};
    for (const [id, at] of Object.entries(this.tree.origins)) slots[id] = this.api.contentToScreen(at.x, at.y);
    const cards: Record<string, { x: number; y: number; slot: string | null }> = {};
    for (const [id, node] of this.nodes) {
      const p = this.api.contentToScreen(node.body.px, node.body.py);
      cards[id] = { x: p.x, y: p.y, slot: this.tree.slotOf(id) };
    }
    return {
      slots,
      cards,
      hand: [...this.state.selfHand],
      play: this.state.play.map((s) => [...s]),
      pending: this.pending.cards(),
    };
  }
}
