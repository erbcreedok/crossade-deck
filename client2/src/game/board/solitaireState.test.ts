import { describe, expect, it } from "vitest";
import { createDeck52 } from "./solitaireDeck";
import { applyAction, createInitialState, dealNewGame, foundationKeyOf, type SolitaireGameState } from "./solitaireState";

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

function stateWith(stock: string[], waste: string[]): SolitaireGameState {
  const s = createInitialState();
  s.phase = "playing";
  s.board.slots.stock = { members: stock };
  s.board.slots.waste = { members: waste };
  return s;
}

describe("applyAction dealStock", () => {
  it("moves stock front card to top of waste, movesCount +1", () => {
    const s = stateWith(["2♠", "3♥"], []);
    const next = applyAction(s, { type: "dealStock" });
    expect(next.board.slots.waste!.members).toEqual(["2♠"]);
    expect(next.board.slots.stock!.members).toEqual(["3♥"]);
    expect(next.movesCount).toBe(s.movesCount + 1);
  });

  it("on empty stock returns state unchanged", () => {
    const s = stateWith([], ["9♣"]);
    const next = applyAction(s, { type: "dealStock" });
    expect(next).toBe(s);
    expect(next.movesCount).toBe(s.movesCount);
  });

  it("does not mutate the input state", () => {
    const s = stateWith(["2♠", "3♥"], []);
    const snapshot = JSON.parse(JSON.stringify(s));
    applyAction(s, { type: "dealStock" });
    expect(JSON.parse(JSON.stringify(s))).toEqual(snapshot);
  });
});

describe("applyAction recycleStock", () => {
  it("moves all waste back to stock reversed, movesCount +1", () => {
    const s = stateWith([], ["2♠", "5♦", "9♣"]);
    const next = applyAction(s, { type: "recycleStock" });
    expect(next.board.slots.stock!.members).toEqual(["9♣", "5♦", "2♠"]);
    expect(next.board.slots.waste!.members).toEqual([]);
    expect(next.movesCount).toBe(s.movesCount + 1);
  });

  it("on empty waste returns state unchanged", () => {
    const s = stateWith(["A♠"], []);
    const next = applyAction(s, { type: "recycleStock" });
    expect(next).toBe(s);
    expect(next.movesCount).toBe(s.movesCount);
  });
});

describe("applyAction default branch", () => {
  it("returns state unchanged for not-yet-implemented action types", () => {
    const s = stateWith(["2♠"], []);
    const next = applyAction(s, { type: "moveCard", from: "tab:0", to: "tab:1", cardId: "2♠" });
    expect(next).toBe(s);
  });
});
