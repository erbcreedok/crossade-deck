import {
  applyAction,
  createInitialState,
  dealNewGame,
  type SolitaireAction,
  type SolitaireGameState,
} from "../board/solitaireState";
import { createDeck52, makeRng, shuffle } from "../board/solitaireDeck";

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

  private dispatch(action: SolitaireAction): void {
    this.state = applyAction(this.state, action);
    // TODO(issue TBD): эмитить событие об изменении состояния для подписчиков (позже).
  }
}
