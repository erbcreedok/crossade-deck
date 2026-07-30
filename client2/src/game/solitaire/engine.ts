import {
  applyAction,
  createInitialState,
  dealNewGame,
  foundationKeyOf,
  type SolitaireAction,
  type SolitaireGameState,
} from "../board/solitaireState";
import { createDeck52, makeRng, shuffle } from "../board/solitaireDeck";
import { at as boardAt } from "../board/board";
import { has, topId } from "../board/container";
import { foundationAccepts, tableauAccepts } from "../board/solitaireRules";

export interface ActionResult {
  valid: boolean;
  error?: string;
}

// Тонкая обёртка вокруг чистого редьюсера solitaireState (issue #88): владеет текущим
// состоянием партии и даёт объектный API (вместо ручного applyAction на каждый вызов).
// Ходы/запросы (moveCard, getPossibleMoves и т.п.) — отдельными тикетами поверх dispatch.

export class SolitaireGameEngine {
  private state: SolitaireGameState;

  constructor(initialState?: Partial<SolitaireGameState>) {
    this.state = { ...createInitialState(), ...initialState };
  }

  getState(): SolitaireGameState {
    return this.state;
  }

  /** Раздать новую перемешанную партию и войти в phase "playing". */
  resetGame(seed?: number): void {
    const rng = seed === undefined ? makeRng(Date.now()) : makeRng(seed);
    const deck = shuffle(createDeck52(), rng);
    this.state = dealNewGame(deck);
  }

  /** Взять карту из stock в waste; если stock пуст — переработать waste обратно в stock. */
  dealStock(): ActionResult {
    const notPlaying = this.requirePlaying();
    if (notPlaying) return notPlaying;

    const stock = boardAt(this.state.board, "stock");
    if (stock && stock.members.length > 0) {
      this.dispatch({ type: "dealStock" });
      return { valid: true };
    }
    const waste = boardAt(this.state.board, "waste");
    if (waste && waste.members.length > 0) {
      this.dispatch({ type: "recycleStock" });
      return { valid: true };
    }
    return { valid: false, error: "No cards to deal" };
  }

  /** Перенести одну карту между слотами, с проверкой правил ДО dispatch. */
  moveCard(fromSlot: string, toSlot: string, cardId: string): ActionResult {
    const notPlaying = this.requirePlaying();
    if (notPlaying) return notPlaying;

    const fromC = boardAt(this.state.board, fromSlot);
    if (!fromC || !has(fromC, cardId)) {
      return { valid: false, error: `Card ${cardId} not found in ${fromSlot}` };
    }

    const top = topId(boardAt(this.state.board, toSlot) ?? { members: [] }) ?? null;
    if (toSlot.startsWith("found:")) {
      if (foundationKeyOf(cardId) !== toSlot || !foundationAccepts(cardId, top)) {
        return { valid: false, error: `${cardId} cannot go to ${toSlot}` };
      }
    } else if (toSlot.startsWith("tab:")) {
      if (!tableauAccepts(cardId, top)) {
        return { valid: false, error: `${cardId} cannot go to ${toSlot}` };
      }
    } else {
      return { valid: false, error: `Invalid target slot ${toSlot}` };
    }

    this.dispatch({ type: "moveCard", from: fromSlot, to: toSlot, cardId });
    return { valid: true };
  }

  /** Перенести стопку карт между слотами (только tableau→tableau), с проверкой правил ДО dispatch. */
  moveStack(fromSlot: string, toSlot: string, cardIds: string[]): ActionResult {
    if (cardIds.length === 1) return this.moveCard(fromSlot, toSlot, cardIds[0]!);

    const notPlaying = this.requirePlaying();
    if (notPlaying) return notPlaying;

    const fromC = boardAt(this.state.board, fromSlot);
    if (!fromC || !cardIds.every((id) => has(fromC, id))) {
      return { valid: false, error: `Card not found in ${fromSlot}` };
    }
    for (let i = 0; i < cardIds.length - 1; i++) {
      if (!tableauAccepts(cardIds[i + 1]!, cardIds[i]!)) {
        return { valid: false, error: `Invalid run` };
      }
    }
    if (!toSlot.startsWith("tab:")) {
      return { valid: false, error: `Invalid target slot ${toSlot}` };
    }
    const top = topId(boardAt(this.state.board, toSlot) ?? { members: [] }) ?? null;
    if (!tableauAccepts(cardIds[0]!, top)) {
      return { valid: false, error: `${cardIds[0]} cannot go to ${toSlot}` };
    }

    this.dispatch({ type: "moveStack", from: fromSlot, to: toSlot, cardIds });
    return { valid: true };
  }

  private requirePlaying(): ActionResult | null {
    if (this.state.phase !== "playing") {
      return { valid: false, error: "Game is not in playing phase" };
    }
    return null;
  }

  private dispatch(action: SolitaireAction): void {
    this.state = applyAction(this.state, action);
    // TODO(issue TBD): эмитить событие об изменении состояния для подписчиков (позже).
  }
}
