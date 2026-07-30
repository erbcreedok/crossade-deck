import { describe, expect, it } from "vitest";
import { createDeck52 } from "./solitaireDeck";
import { createInitialState, dealNewGame, foundationKeyOf } from "./solitaireState";

describe("createInitialState", () => {
  it("starts in menu phase with all 13 slots present and onEmpty:keep", () => {
    const s = createInitialState();
    expect(s.phase).toBe("menu");
    expect(s.board.onEmpty).toBe("keep");
    expect(s.deckRev).toBe(1);
    expect(s.movesCount).toBe(0);
    const keys = Object.keys(s.board.slots).sort();
    expect(keys).toEqual(
      [
        "stock",
        "waste",
        "found:S",
        "found:H",
        "found:D",
        "found:C",
        "tab:0",
        "tab:1",
        "tab:2",
        "tab:3",
        "tab:4",
        "tab:5",
        "tab:6",
      ].sort(),
    );
    for (const k of keys) {
      expect(s.board.slots[k]!.members).toEqual([]);
    }
  });
});

describe("foundationKeyOf", () => {
  it("maps suit to foundation key", () => {
    expect(foundationKeyOf("5♦")).toBe("found:D");
    expect(foundationKeyOf("A♠")).toBe("found:S");
    expect(foundationKeyOf("K♥")).toBe("found:H");
    expect(foundationKeyOf("10♣")).toBe("found:C");
  });
});

describe("dealNewGame", () => {
  const deck = createDeck52();
  const state = dealNewGame(deck);

  it("deals tableau columns 1..7", () => {
    for (let c = 0; c < 7; c++) {
      expect(state.board.slots[`tab:${c}`]!.members.length).toBe(c + 1);
    }
  });

  it("deals exactly 28 cards to tableau total", () => {
    let total = 0;
    for (let c = 0; c < 7; c++) total += state.board.slots[`tab:${c}`]!.members.length;
    expect(total).toBe(28);
  });

  it("puts the rest into stock, in original relative order", () => {
    expect(state.board.slots.stock!.members.length).toBe(24);
    expect(state.board.slots.stock!.members).toEqual(deck.slice(28));
  });

  it("leaves waste and foundations empty", () => {
    expect(state.board.slots.waste!.members.length).toBe(0);
    expect(state.board.slots["found:S"]!.members.length).toBe(0);
    expect(state.board.slots["found:H"]!.members.length).toBe(0);
    expect(state.board.slots["found:D"]!.members.length).toBe(0);
    expect(state.board.slots["found:C"]!.members.length).toBe(0);
  });

  it("places every input card exactly once", () => {
    const all: string[] = [];
    for (const key of Object.keys(state.board.slots)) {
      all.push(...state.board.slots[key]!.members);
    }
    expect(all.length).toBe(52);
    expect(new Set(all).size).toBe(52);
  });

  it("returns phase playing, movesCount 0, onEmpty keep", () => {
    expect(state.phase).toBe("playing");
    expect(state.movesCount).toBe(0);
    expect(state.board.onEmpty).toBe("keep");
  });
});
