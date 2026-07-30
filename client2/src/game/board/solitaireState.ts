import * as board from "./board";
import type { Board } from "./board";
import { has, topId } from "./container";
import { foundationAccepts, tableauAccepts } from "./solitaireRules";
import { createDeck52 } from "./solitaireDeck";

// Состояние партии солитёра (klondike, MVP) поверх Board (issue #84). Только карта состояния и
// раздача — applyAction (проведение действий) реализуется отдельным тикетом.

export type GamePhase = "menu" | "setup" | "playing" | "won" | "lost";

export interface SolitaireGameState {
  phase: GamePhase;
  board: Board;
  deckRev: number; // зарезервировано под будущую server-sync; в MVP не используется
  movesCount: number;
  timeStarted: number;
}

export type SolitaireAction =
  | { type: "dealStock" }
  | { type: "moveCard"; from: string; to: string; cardId: string }
  | { type: "moveStack"; from: string; to: string; cardIds: string[] }
  | { type: "recycleStock" }
  | { type: "resetGame" };

/** Фиксированные id слотов, всегда присутствуют (рендер + запросы ходов). */
export const FOUNDATION_KEYS: readonly string[] = ["found:S", "found:H", "found:D", "found:C"];
export const TABLEAU_KEYS: readonly string[] = ["tab:0", "tab:1", "tab:2", "tab:3", "tab:4", "tab:5", "tab:6"];

const SUIT_LETTER: Record<string, string> = { "♠": "S", "♥": "H", "♦": "D", "♣": "C" };

/** Масть карты → её foundation-слот, напр. "5♦" -> "found:D". */
export function foundationKeyOf(face: string): string {
  const suit = face[face.length - 1]!;
  return `found:${SUIT_LETTER[suit] ?? suit}`;
}

/** Пустая доска со всеми 13 слотами и onEmpty:"keep", чтобы слоты никогда не исчезали. */
export function createInitialState(): SolitaireGameState {
  const slots: Board["slots"] = { stock: { members: [] }, waste: { members: [] } };
  for (const key of FOUNDATION_KEYS) slots[key] = { members: [] };
  for (const key of TABLEAU_KEYS) slots[key] = { members: [] };
  return {
    phase: "menu",
    board: { slots, onEmpty: "keep" },
    deckRev: 1,
    movesCount: 0,
    timeStarted: Date.now(),
  };
}

/** Раздать полную колоду в свежее состояние PLAYING: tab:0 получает 1 карту, ..., tab:6 — 7
 *  (28 карт с НАЧАЛА deck); остаток (24) идёт в stock; waste и foundations пустые. */
export function dealNewGame(deck: string[]): SolitaireGameState {
  const state = createInitialState();
  let cursor = 0;
  for (let c = 0; c < TABLEAU_KEYS.length; c++) {
    const count = c + 1;
    state.board.slots[TABLEAU_KEYS[c]!] = { members: deck.slice(cursor, cursor + count) };
    cursor += count;
  }
  state.board.slots.stock = { members: deck.slice(cursor) };
  state.phase = "playing";
  return state;
}

/** Чистый редьюсер. Никогда не мутирует `state`, возвращает НОВОЕ состояние (или тот же объект,
 *  если действие — no-op). moveCard/moveStack/resetGame реализуются отдельным тикетом. */
export function applyAction(state: SolitaireGameState, action: SolitaireAction): SolitaireGameState {
  switch (action.type) {
    case "dealStock": {
      const stock = board.at(state.board, "stock");
      if (!stock || stock.members.length === 0) return state;
      const card = stock.members[0]!;
      const nextBoard = board.move(state.board, "stock", "waste", [card]);
      return { ...state, board: nextBoard, movesCount: state.movesCount + 1 };
    }
    case "recycleStock": {
      const waste = board.at(state.board, "waste");
      if (!waste || waste.members.length === 0) return state;
      const nextBoard = board.move(state.board, "waste", "stock", [...waste.members].reverse());
      return { ...state, board: nextBoard, movesCount: state.movesCount + 1 };
    }
    case "moveCard": {
      const { from, to, cardId } = action;
      const fromC = board.at(state.board, from);
      if (!fromC || !has(fromC, cardId)) return state;
      const top = topId(board.at(state.board, to) ?? { members: [] }) ?? null;
      if (to.startsWith("found:")) {
        if (foundationKeyOf(cardId) !== to || !foundationAccepts(cardId, top)) return state;
      } else if (to.startsWith("tab:")) {
        if (!tableauAccepts(cardId, top)) return state;
      } else {
        return state;
      }
      const nextBoard = board.move(state.board, from, to, [cardId]);
      return { ...state, board: nextBoard, movesCount: state.movesCount + 1 };
    }
    case "moveStack": {
      const { from, to, cardIds } = action;
      if (!to.startsWith("tab:") || cardIds.length === 0) return state;
      const fromC = board.at(state.board, from);
      if (!fromC || !cardIds.every((id) => has(fromC, id))) return state;
      for (let i = 0; i < cardIds.length - 1; i++) {
        if (!tableauAccepts(cardIds[i + 1]!, cardIds[i]!)) return state;
      }
      const top = topId(board.at(state.board, to) ?? { members: [] }) ?? null;
      if (!tableauAccepts(cardIds[0]!, top)) return state;
      const nextBoard = board.move(state.board, from, to, cardIds);
      return { ...state, board: nextBoard, movesCount: state.movesCount + 1 };
    }
    case "resetGame":
      return dealNewGame(createDeck52());
    default:
      return state;
  }
}
