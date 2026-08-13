// The deal, held down headless — counts and facing are deterministic whatever the shuffle, so no
// clock and no GPU are needed. The fly-in itself (the glide) is the motion runtime's, tested there.

import { describe, expect, it } from "vitest";
import { facing } from "game-kit";
import { buildBoard, dealKlondike } from "./board.js";

describe("the Klondike deal", () => {
  it("deal.the-whole-deck-starts-in-the-stock — undealt, ready to fly", () => {
    const b = buildBoard();
    expect(b.stock.children).toHaveLength(52);
    expect(b.tableau.every((c) => c.children.length === 0)).toBe(true);
    expect(b.waste.children).toHaveLength(0);
    expect(b.foundations.every((f) => f.children.length === 0)).toBe(true);
  });

  it("deal.columns-cascade-one-to-seven — column i takes i+1 cards", () => {
    const b = buildBoard();
    dealKlondike(b);
    expect(b.tableau.map((c) => c.children.length)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("deal.only-the-column-top-is-face-up — the rest lie face-down", () => {
    const b = buildBoard();
    dealKlondike(b);
    for (const col of b.tableau) {
      const cards = col.children;
      expect(facing(cards[cards.length - 1]!)).toBe("up");
      for (let i = 0; i < cards.length - 1; i++) expect(facing(cards[i]!)).toBe("down");
    }
  });

  it("deal.the-rest-stays-in-the-stock-face-down — 24 left, nothing lost", () => {
    const b = buildBoard();
    dealKlondike(b);
    expect(b.stock.children).toHaveLength(24); // 52 dealt from, 28 out to the tableau
    expect(b.stock.children.every((c) => facing(c) === "down")).toBe(true);
    const dealt = b.tableau.reduce((n, c) => n + c.children.length, 0);
    expect(dealt + b.stock.children.length).toBe(52); // nothing appeared or vanished
  });
});
