import { describe, it, expect } from "vitest";
import { SUITS, RANKS, createDeck52, makeRng, shuffle } from "./solitaireDeck";

// E1-T1 — 52-card deck builder + seedable (mulberry32) shuffle.
// RED until client2/src/game/board/solitaireDeck.ts exists.

describe("solitaireDeck — createDeck52 (E1-T1)", () => {
  it("SUITS / RANKS are the expected symbols", () => {
    expect([...SUITS]).toEqual(["♠", "♥", "♦", "♣"]);
    expect([...RANKS]).toEqual(["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"]);
  });

  it("returns 52 cards", () => {
    expect(createDeck52().length).toBe(52);
  });

  it("all 52 cards are unique", () => {
    expect(new Set(createDeck52()).size).toBe(52);
  });

  it("every face ends in a suit symbol", () => {
    for (const face of createDeck52()) {
      expect(SUITS).toContain(face.slice(-1));
    }
  });

  it("contains the corner faces A♠, K♣, 10♦", () => {
    const d = createDeck52();
    expect(d.includes("A♠")).toBe(true);
    expect(d.includes("K♣")).toBe(true);
    expect(d.includes("10♦")).toBe(true);
  });

  it("every rank×suit combo appears exactly once", () => {
    const d = createDeck52();
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        expect(d.filter((f: string) => f === rank + suit).length).toBe(1);
      }
    }
  });
});

describe("solitaireDeck — makeRng / shuffle (E1-T1)", () => {
  it("makeRng is deterministic for a fixed seed and yields values in [0,1)", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    for (let i = 0; i < 10; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("shuffle does not mutate its input array", () => {
    const d = createDeck52();
    const copy = [...d];
    shuffle(d, makeRng(1));
    expect(d).toEqual(copy);
  });

  it("same seed produces identical output (deterministic)", () => {
    const a = shuffle(createDeck52(), makeRng(7));
    const b = shuffle(createDeck52(), makeRng(7));
    expect(a).toEqual(b);
  });

  it("shuffle result is a permutation of the deck (same members)", () => {
    const shuffled = shuffle(createDeck52(), makeRng(7));
    expect([...shuffled].sort()).toEqual([...createDeck52()].sort());
  });

  it("shuffle changes the order versus the unshuffled deck", () => {
    const unshuffled = createDeck52();
    const shuffled = shuffle(createDeck52(), makeRng(7));
    expect(shuffled).not.toEqual(unshuffled);
  });
});
