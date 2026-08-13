import { describe, expect, it } from "vitest";
import { canOnFoundation, canOnTableau, isRunOrdered, rankNum, valueOf, type CardValue } from "./rules.js";

const card = (suit: string, rank: string, colour: string): CardValue => ({ suit, rank, colour });

describe("game-presets/solitaire rules", () => {
  it("rules.rank-is-ace-to-king — rankNum maps A..K to 1..13, and an unknown rank to -1", () => {
    expect(rankNum("A")).toBe(1);
    expect(rankNum("10")).toBe(10);
    expect(rankNum("K")).toBe(13);
    expect(rankNum("joker")).toBe(-1);
  });

  it("rules.tableau-empty-takes-a-king — canOnTableau(x, undefined) is true only for a King", () => {
    expect(canOnTableau(card("spade", "K", "black"), undefined)).toBe(true);
    expect(canOnTableau(card("spade", "Q", "black"), undefined)).toBe(false);
    expect(canOnTableau(card("heart", "A", "red"), undefined)).toBe(false);
  });

  it("rules.tableau-descends-in-alternating-colour — opposite colour and adjacent rank only", () => {
    // red 6 onto black 7 — legal
    expect(canOnTableau(card("heart", "6", "red"), card("spade", "7", "black"))).toBe(true);
    // same colour — illegal even though rank is adjacent
    expect(canOnTableau(card("club", "6", "black"), card("spade", "7", "black"))).toBe(false);
    // non-adjacent rank — illegal even though colour alternates
    expect(canOnTableau(card("heart", "5", "red"), card("spade", "7", "black"))).toBe(false);
  });

  it("rules.foundation-empty-takes-an-ace — canOnFoundation(x, undefined) is true only for an Ace", () => {
    expect(canOnFoundation(card("spade", "A", "black"), undefined)).toBe(true);
    expect(canOnFoundation(card("spade", "2", "black"), undefined)).toBe(false);
  });

  it("rules.foundation-ascends-by-suit — same suit, one rank up, only", () => {
    // 2 of spades onto Ace of spades — legal
    expect(canOnFoundation(card("spade", "2", "black"), card("spade", "A", "black"))).toBe(true);
    // wrong suit — illegal even though rank is adjacent
    expect(canOnFoundation(card("heart", "2", "red"), card("spade", "A", "black"))).toBe(false);
    // non-adjacent rank — illegal even though suit matches
    expect(canOnFoundation(card("spade", "3", "black"), card("spade", "A", "black"))).toBe(false);
  });

  it("rules.a-run-is-descending-alternating — ordered only when every step alternates colour and descends by one", () => {
    const validRun = [card("spade", "7", "black"), card("heart", "6", "red"), card("club", "5", "black")];
    expect(isRunOrdered(validRun)).toBe(true);

    const colourRepeat = [card("spade", "7", "black"), card("club", "6", "black")];
    expect(isRunOrdered(colourRepeat)).toBe(false);

    const rankGap = [card("spade", "7", "black"), card("heart", "5", "red")];
    expect(isRunOrdered(rankGap)).toBe(false);

    expect(isRunOrdered([card("spade", "7", "black")])).toBe(true);
    expect(isRunOrdered([])).toBe(true);
  });

  it("rules.value-reads-typed-fields — valueOf reads {suit,rank,colour}, undefined on missing or mistyped", () => {
    expect(valueOf({ suit: "spade", rank: "7", colour: "black" })).toEqual({ suit: "spade", rank: "7", colour: "black" });
    expect(valueOf(undefined)).toBeUndefined();
    expect(valueOf({ suit: "spade", rank: "7" })).toBeUndefined();
    expect(valueOf({ suit: "spade", rank: 7, colour: "black" })).toBeUndefined();
  });
});
