import { describe, it, expect } from "vitest";
import type { Board } from "./board";
import { createDeck52 } from "./solitaireDeck";
import {
  FOUNDATION_KEYS,
  TABLEAU_KEYS,
  foundationKeyOf,
  createInitialState,
  dealNewGame,
  applyAction,
  isWinning,
  canMakeMove,
  getPossibleMoves,
  type SolitaireGameState,
} from "./solitaireState";

// E1-T2..E1-T5 — game-state types, fresh-deal, applyAction reducer, and queries.
// RED until client2/src/game/board/solitaireState.ts exists.

const ALL_SLOT_KEYS = ["stock", "waste", "found:S", "found:H", "found:D", "found:C", "tab:0", "tab:1", "tab:2", "tab:3", "tab:4", "tab:5", "tab:6"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/** Build a Board with all 13 slots present (empty by default) and onEmpty:"keep". */
function boardWith(slots: Record<string, string[]>): Board {
  const base: Record<string, { members: string[] }> = {};
  for (const k of ALL_SLOT_KEYS) base[k] = { members: [] };
  for (const k of Object.keys(slots)) base[k] = { members: [...slots[k]] };
  return { slots: base, onEmpty: "keep" };
}

/** A "playing" state whose board carries the given slot members. */
function playingState(slots: Record<string, string[]>, extra: Partial<SolitaireGameState> = {}): SolitaireGameState {
  return { phase: "playing", board: boardWith(slots), deckRev: 1, movesCount: 0, timeStarted: 0, ...extra };
}

function members(state: SolitaireGameState, key: string): string[] {
  return state.board.slots[key]?.members ?? [];
}

function fullFoundation(sym: string): string[] {
  return RANKS.map((r) => r + sym);
}

// ------------------------------------------------------------------ E1-T2
describe("solitaireState — types + fresh-deal (E1-T2)", () => {
  it("FOUNDATION_KEYS / TABLEAU_KEYS are the fixed slot ids", () => {
    expect([...FOUNDATION_KEYS]).toEqual(["found:S", "found:H", "found:D", "found:C"]);
    expect([...TABLEAU_KEYS]).toEqual(["tab:0", "tab:1", "tab:2", "tab:3", "tab:4", "tab:5", "tab:6"]);
  });

  it("foundationKeyOf maps face suit to foundation key", () => {
    expect(foundationKeyOf("5♦")).toBe("found:D");
    expect(foundationKeyOf("A♠")).toBe("found:S");
    expect(foundationKeyOf("K♥")).toBe("found:H");
    expect(foundationKeyOf("2♣")).toBe("found:C");
  });

  it("createInitialState starts in menu with all 13 empty slots and onEmpty keep", () => {
    const s = createInitialState();
    expect(s.phase).toBe("menu");
    expect(s.movesCount).toBe(0);
    expect(s.board.onEmpty).toBe("keep");
    for (const k of ALL_SLOT_KEYS) {
      expect(s.board.slots[k]).toBeDefined();
      expect(s.board.slots[k].members.length).toBe(0);
    }
  });

  it("dealNewGame lays tab:0..6 with 1..7 cards (28 total)", () => {
    const s = dealNewGame(createDeck52());
    expect(members(s, "tab:0").length).toBe(1);
    expect(members(s, "tab:6").length).toBe(7);
    const tableauTotal = TABLEAU_KEYS.reduce((sum: number, k: string) => sum + members(s, k).length, 0);
    expect(tableauTotal).toBe(28);
  });

  it("dealNewGame puts the remaining 24 cards in stock (order preserved)", () => {
    const deck = createDeck52();
    const s = dealNewGame(deck);
    expect(members(s, "stock").length).toBe(24);
    expect(members(s, "stock")).toEqual(deck.slice(28));
  });

  it("dealNewGame leaves waste and all foundations empty", () => {
    const s = dealNewGame(createDeck52());
    expect(members(s, "waste").length).toBe(0);
    for (const k of FOUNDATION_KEYS) expect(members(s, k).length).toBe(0);
  });

  it("dealNewGame preserves all 52 cards exactly once across the board", () => {
    const s = dealNewGame(createDeck52());
    const all = ALL_SLOT_KEYS.flatMap((k) => members(s, k));
    expect(all.length).toBe(52);
    expect(new Set(all).size).toBe(52);
  });

  it("dealNewGame enters playing with movesCount 0 and onEmpty keep", () => {
    const s = dealNewGame(createDeck52());
    expect(s.phase).toBe("playing");
    expect(s.movesCount).toBe(0);
    expect(s.board.onEmpty).toBe("keep");
  });
});

// ------------------------------------------------------------------ E1-T3
describe("solitaireState — applyAction dealStock / recycleStock (E1-T3)", () => {
  it("dealStock flips the front stock card onto the top of waste", () => {
    const s = playingState({ stock: ["2♠", "3♥"], waste: [] });
    const next = applyAction(s, { type: "dealStock" });
    expect(members(next, "waste")).toEqual(["2♠"]);
    expect(members(next, "stock")).toEqual(["3♥"]);
    expect(next.movesCount).toBe(1);
  });

  it("dealStock on empty stock returns the state unchanged", () => {
    const s = playingState({ stock: [], waste: ["9♣"] }, { movesCount: 4 });
    const next = applyAction(s, { type: "dealStock" });
    expect(next.movesCount).toBe(4);
    expect(members(next, "waste")).toEqual(["9♣"]);
    expect(members(next, "stock")).toEqual([]);
  });

  it("recycleStock returns all waste to stock in reversed order", () => {
    const s = playingState({ stock: [], waste: ["2♠", "5♦", "9♣"] });
    const next = applyAction(s, { type: "recycleStock" });
    expect(members(next, "stock")).toEqual(["9♣", "5♦", "2♠"]);
    expect(members(next, "waste")).toEqual([]);
    expect(next.movesCount).toBe(1);
  });

  it("recycleStock on empty waste returns the state unchanged", () => {
    const s = playingState({ stock: ["A♠"], waste: [] }, { movesCount: 2 });
    const next = applyAction(s, { type: "recycleStock" });
    expect(next.movesCount).toBe(2);
    expect(members(next, "stock")).toEqual(["A♠"]);
    expect(members(next, "waste")).toEqual([]);
  });

  it("applyAction never mutates the input state (immutability)", () => {
    const s = playingState({ stock: ["2♠", "3♥"], waste: [] });
    const snapshot = JSON.stringify(s);
    applyAction(s, { type: "dealStock" });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

// ------------------------------------------------------------------ E1-T4
describe("solitaireState — applyAction moveCard / moveStack / resetGame (E1-T4)", () => {
  it("legal moveCard onto a tableau applies and bumps movesCount", () => {
    const s = playingState({ waste: ["5♦"], "tab:0": ["6♠"] });
    const next = applyAction(s, { type: "moveCard", from: "waste", to: "tab:0", cardId: "5♦" });
    expect(members(next, "tab:0")).toEqual(["6♠", "5♦"]);
    expect(members(next, "waste")).toEqual([]);
    expect(next.movesCount).toBe(1);
  });

  it("same-color tableau move is rejected (unchanged)", () => {
    const s = playingState({ waste: ["5♦"], "tab:0": ["6♦"] });
    const next = applyAction(s, { type: "moveCard", from: "waste", to: "tab:0", cardId: "5♦" });
    expect(members(next, "tab:0")).toEqual(["6♦"]);
    expect(members(next, "waste")).toEqual(["5♦"]);
    expect(next.movesCount).toBe(0);
  });

  it("legal moveCard of an ace onto its empty foundation applies", () => {
    const s = playingState({ waste: ["A♠"], "found:S": [] });
    const next = applyAction(s, { type: "moveCard", from: "waste", to: "found:S", cardId: "A♠" });
    expect(members(next, "found:S")).toEqual(["A♠"]);
    expect(next.movesCount).toBe(1);
  });

  it("foundation move with mismatched suit is rejected", () => {
    const s = playingState({ waste: ["A♥"], "found:S": [] });
    const next = applyAction(s, { type: "moveCard", from: "waste", to: "found:S", cardId: "A♥" });
    expect(members(next, "found:S")).toEqual([]);
    expect(members(next, "waste")).toEqual(["A♥"]);
    expect(next.movesCount).toBe(0);
  });

  it("legal moveCard stacking on a foundation applies", () => {
    const s = playingState({ waste: ["2♣"], "found:C": ["A♣"] });
    const next = applyAction(s, { type: "moveCard", from: "waste", to: "found:C", cardId: "2♣" });
    expect(members(next, "found:C")).toEqual(["A♣", "2♣"]);
    expect(next.movesCount).toBe(1);
  });

  it("moveCard with a cardId not in the source slot is a no-op", () => {
    const s = playingState({ "tab:1": ["6♠"], "tab:0": ["7♥"] });
    const next = applyAction(s, { type: "moveCard", from: "tab:1", to: "tab:0", cardId: "9♣" });
    expect(members(next, "tab:1")).toEqual(["6♠"]);
    expect(members(next, "tab:0")).toEqual(["7♥"]);
    expect(next.movesCount).toBe(0);
  });

  it("legal moveStack of a valid run moves the whole run", () => {
    const s = playingState({ "tab:2": [], "tab:3": ["K♠", "Q♥"] });
    const next = applyAction(s, { type: "moveStack", from: "tab:3", to: "tab:2", cardIds: ["K♠", "Q♥"] });
    expect(members(next, "tab:2")).toEqual(["K♠", "Q♥"]);
    expect(members(next, "tab:3")).toEqual([]);
    expect(next.movesCount).toBe(1);
  });

  it("moveStack with an invalid internal run is rejected", () => {
    const s = playingState({ "tab:2": [], "tab:3": ["K♠", "Q♣"] });
    const next = applyAction(s, { type: "moveStack", from: "tab:3", to: "tab:2", cardIds: ["K♠", "Q♣"] });
    expect(members(next, "tab:3")).toEqual(["K♠", "Q♣"]);
    expect(members(next, "tab:2")).toEqual([]);
    expect(next.movesCount).toBe(0);
  });

  it("moveStack to a non-tableau target is rejected", () => {
    const s = playingState({ "found:S": [], "tab:3": ["K♠", "Q♥"] });
    const next = applyAction(s, { type: "moveStack", from: "tab:3", to: "found:S", cardIds: ["K♠", "Q♥"] });
    expect(members(next, "tab:3")).toEqual(["K♠", "Q♥"]);
    expect(next.movesCount).toBe(0);
  });

  it("resetGame returns a fresh playing deal (28 tableau + 24 stock)", () => {
    const s = playingState({ waste: ["5♦"] });
    const next = applyAction(s, { type: "resetGame" });
    expect(next.phase).toBe("playing");
    expect(members(next, "stock").length).toBe(24);
    const tableauTotal = TABLEAU_KEYS.reduce((sum: number, k: string) => sum + members(next, k).length, 0);
    expect(tableauTotal).toBe(28);
  });

  it("moveCard does not mutate the input state", () => {
    const s = playingState({ waste: ["5♦"], "tab:0": ["6♠"] });
    const snapshot = JSON.stringify(s);
    applyAction(s, { type: "moveCard", from: "waste", to: "tab:0", cardId: "5♦" });
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});

// ------------------------------------------------------------------ E1-T5
describe("solitaireState — queries isWinning / canMakeMove / getPossibleMoves (E1-T5)", () => {
  it("isWinning is true only when all 4 foundations hold 13 cards", () => {
    const s = playingState({
      "found:S": fullFoundation("♠"),
      "found:H": fullFoundation("♥"),
      "found:D": fullFoundation("♦"),
      "found:C": fullFoundation("♣"),
    });
    expect(isWinning(s)).toBe(true);
  });

  it("isWinning is false when one foundation is short a card", () => {
    const s = playingState({
      "found:S": fullFoundation("♠").slice(0, 12),
      "found:H": fullFoundation("♥"),
      "found:D": fullFoundation("♦"),
      "found:C": fullFoundation("♣"),
    });
    expect(isWinning(s)).toBe(false);
  });

  it("canMakeMove is true whenever stock is non-empty", () => {
    const s = playingState({ stock: ["7♣"] });
    expect(canMakeMove(s)).toBe(true);
  });

  it("canMakeMove is false with empty stock/waste and a locked tableau", () => {
    const s = playingState({ stock: [], waste: [], "tab:0": ["2♠"] });
    expect(canMakeMove(s)).toBe(false);
  });

  it("canMakeMove is true when the waste top can go to a foundation", () => {
    const s = playingState({ stock: [], waste: ["A♠"], "found:S": [] });
    expect(canMakeMove(s)).toBe(true);
  });

  it("getPossibleMoves finds a waste→tableau move", () => {
    const s = playingState({ stock: [], waste: ["5♦"], "tab:0": ["6♠"] });
    expect(getPossibleMoves(s)).toContainEqual({ from: "waste", to: "tab:0", card: "5♦" });
  });

  it("getPossibleMoves finds a waste→foundation move", () => {
    const s = playingState({ stock: [], waste: ["2♣"], "found:C": ["A♣"] });
    expect(getPossibleMoves(s)).toContainEqual({ from: "waste", to: "found:C", card: "2♣" });
  });

  it("getPossibleMoves lists no illegal entries", () => {
    const s = playingState({ stock: [], waste: ["5♦"], "tab:0": ["6♠"], "found:D": [] });
    // 5♦ cannot reach empty found:D (needs A♦ first); only the tab:0 landing is legal.
    const moves = getPossibleMoves(s);
    expect(moves).not.toContainEqual({ from: "waste", to: "found:D", card: "5♦" });
  });
});
