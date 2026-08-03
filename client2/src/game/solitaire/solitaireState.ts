import * as board from "../slotfield/slotField";
import type { Board } from "../slotfield/slotField";
import { has, topId } from "../slotfield/container";
import { foundationAccepts, tableauAccepts } from "./solitaireRules";
import { createDeck52 } from "./solitaireDeck";

// Состояние партии солитёра (klondike, MVP) поверх Board (issue #84). Только карта состояния и
// раздача — applyAction (проведение действий) реализуется отдельным тикетом.

export type GamePhase = "menu" | "setup" | "playing" | "won" | "lost";

export interface SolitaireGameState {
  phase: GamePhase;
  board: Board;
  faceUp: Record<string, boolean>; // face-строка карты -> видна ли лицом вверх
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
    faceUp: {},
    deckRev: 1,
    movesCount: 0,
    timeStarted: Date.now(),
  };
}

/** Видна ли карта лицом вверх прямо сейчас. Отсутствующие в карте (не раздана и т.п.) — лицом вниз. */
export function isFaceUp(state: SolitaireGameState, cardId: string): boolean {
  return state.faceUp[cardId] === true;
}

/** Раздать полную колоду в свежее состояние PLAYING: tab:0 получает 1 карту, ..., tab:6 — 7
 *  (28 карт с НАЧАЛА deck); остаток (24) идёт в stock; waste и foundations пустые. */
export function dealNewGame(deck: string[]): SolitaireGameState {
  const state = createInitialState();
  const faceUp: Record<string, boolean> = {};
  let cursor = 0;
  for (let c = 0; c < TABLEAU_KEYS.length; c++) {
    const count = c + 1;
    const members = deck.slice(cursor, cursor + count);
    state.board.slots[TABLEAU_KEYS[c]!] = { members };
    members.forEach((id, i) => {
      faceUp[id] = i === members.length - 1;
    });
    cursor += count;
  }
  state.board.slots.stock = { members: deck.slice(cursor) };
  for (const id of state.board.slots.stock!.members) faceUp[id] = false;
  state.faceUp = faceUp;
  state.phase = "playing";
  return state;
}

/** Победа: все 4 фундамента набрали по 13 карт (A→K). */
export function isWinning(state: SolitaireGameState): boolean {
  return FOUNDATION_KEYS.every((key) => board.at(state.board, key)?.members.length === 13);
}

/** Все легальные одиночные ходы (для подсказок/тестов). Кандидаты-источники: верх waste и верх
 *  каждой tableau-колонки; цели — только тот found:X, что соответствует масти карты, и все tab:N. */
export function getPossibleMoves(state: SolitaireGameState): Array<{ from: string; to: string; card: string }> {
  const sources: Array<{ from: string; card: string }> = [];
  const wasteTop = topId(board.at(state.board, "waste") ?? { members: [] });
  if (wasteTop) sources.push({ from: "waste", card: wasteTop });
  for (const key of TABLEAU_KEYS) {
    const top = topId(board.at(state.board, key) ?? { members: [] });
    if (top) sources.push({ from: key, card: top });
  }

  const moves: Array<{ from: string; to: string; card: string }> = [];
  for (const { from, card } of sources) {
    const foundKey = foundationKeyOf(card);
    const foundTop = topId(board.at(state.board, foundKey) ?? { members: [] }) ?? null;
    if (foundationAccepts(card, foundTop)) moves.push({ from, to: foundKey, card });

    for (const tabKey of TABLEAU_KEYS) {
      if (tabKey === from) continue;
      const tabTop = topId(board.at(state.board, tabKey) ?? { members: [] }) ?? null;
      if (tableauAccepts(card, tabTop)) moves.push({ from, to: tabKey, card });
    }
  }
  return moves;
}

/** Есть ли ещё хоть какой-то ход: непустой stock, либо легальный ход с верха waste/tableau. */
export function canMakeMove(state: SolitaireGameState): boolean {
  if (board.at(state.board, "stock")?.members.length) return true;
  return getPossibleMoves(state).length > 0;
}

/** faceUp после moveCard/moveStack: перемещённые карты открываются в новом доме (кроме stock), а
 *  если source была tab: и в ней остались карты, новый верх колонки тоже открывается. */
function nextFaceUp(
  prev: Record<string, boolean>,
  nextBoard: Board,
  from: string,
  to: string,
  movedIds: string[],
): Record<string, boolean> {
  const faceUp = { ...prev };
  if (to !== "stock") {
    for (const id of movedIds) faceUp[id] = true;
  }
  if (from.startsWith("tab:")) {
    const remaining = board.at(nextBoard, from);
    const newTop = remaining ? topId(remaining) : undefined;
    if (newTop) faceUp[newTop] = true;
  }
  return faceUp;
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
      const faceUp = { ...state.faceUp, [card]: true };
      return { ...state, board: nextBoard, faceUp, movesCount: state.movesCount + 1 };
    }
    case "recycleStock": {
      const waste = board.at(state.board, "waste");
      if (!waste || waste.members.length === 0) return state;
      const nextBoard = board.move(state.board, "waste", "stock", [...waste.members].reverse());
      const faceUp = { ...state.faceUp };
      for (const id of waste.members) faceUp[id] = false;
      return { ...state, board: nextBoard, faceUp, movesCount: state.movesCount + 1 };
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
      const faceUp = nextFaceUp(state.faceUp, nextBoard, from, to, [cardId]);
      return { ...state, board: nextBoard, faceUp, movesCount: state.movesCount + 1 };
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
      const faceUp = nextFaceUp(state.faceUp, nextBoard, from, to, cardIds);
      return { ...state, board: nextBoard, faceUp, movesCount: state.movesCount + 1 };
    }
    case "resetGame":
      return dealNewGame(createDeck52());
    default:
      return state;
  }
}
