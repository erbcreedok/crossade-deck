import {
  applyAction,
  canMakeMove,
  createInitialState,
  dealNewGame,
  foundationKeyOf,
  getPossibleMoves,
  isWinning,
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

export type MoveHandler = (action: SolitaireAction) => void;
export type VoidHandler = () => void;

// Тонкая обёртка вокруг чистого редьюсера solitaireState (issue #88): владеет текущим
// состоянием партии и даёт объектный API (вместо ручного applyAction на каждый вызов).
// Ходы/запросы (moveCard, getPossibleMoves и т.п.) — отдельными тикетами поверх dispatch.

export class SolitaireGameEngine {
  private state: SolitaireGameState;
  private listeners = {
    move: [] as MoveHandler[],
    win: [] as VoidHandler[],
    lose: [] as VoidHandler[],
  };

  constructor(initialState?: Partial<SolitaireGameState>) {
    this.state = { ...createInitialState(), ...initialState };
  }

  on(event: "move", handler: MoveHandler): void;
  on(event: "win", handler: VoidHandler): void;
  on(event: "lose", handler: VoidHandler): void;
  on(event: "move" | "win" | "lose", handler: (...args: any[]) => void): void {
    (this.listeners[event] as Array<(...args: any[]) => void>).push(handler);
  }

  off(event: "move" | "win" | "lose", handler: (...args: any[]) => void): void {
    this.listeners[event] = (this.listeners[event] as Array<(...args: any[]) => void>).filter(
      (h) => h !== handler
    ) as any;
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

  /** Победа: все 4 фундамента набрали по 13 карт. */
  isWinning(): boolean {
    return isWinning(this.state);
  }

  /** Есть ли ещё хоть какой-то ход. */
  canMakeMove(): boolean {
    return canMakeMove(this.state);
  }

  /** Все легальные одиночные ходы (для подсказок/тестов). */
  getPossibleMoves(): Array<{ from: string; to: string; card: string }> {
    return getPossibleMoves(this.state);
  }

  private requirePlaying(): ActionResult | null {
    if (this.state.phase !== "playing") {
      return { valid: false, error: "Game is not in playing phase" };
    }
    return null;
  }

  private dispatch(action: SolitaireAction): void {
    this.state = applyAction(this.state, action);
    this.listeners.move.forEach((h) => h(action));
    if (isWinning(this.state)) {
      this.state = { ...this.state, phase: "won" };
      this.listeners.win.forEach((h) => h());
    } else if (!canMakeMove(this.state)) {
      this.state = { ...this.state, phase: "lost" };
      this.listeners.lose.forEach((h) => h());
    }
  }
}
