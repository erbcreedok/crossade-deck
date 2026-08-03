import { describe, it, expect } from "vitest";
import { suitOf, srank, tableauAccepts, foundationAccepts } from "./solitaireRules";

describe("solitaireRules", () => {
  it("suitOf / srank (A низкий)", () => {
    expect(suitOf("10♣")).toBe("♣");
    expect(srank("A♠")).toBe(1);
    expect(srank("K♠")).toBe(13);
    expect(srank("7♦")).toBe(7);
  });

  it("tableau: пусто — только K; иначе на 1 ниже и другой цвет", () => {
    expect(tableauAccepts("K♠", null)).toBe(true);
    expect(tableauAccepts("Q♠", null)).toBe(false); // не K
    expect(tableauAccepts("Q♥", "K♠")).toBe(true); // 12 на 13, красная на чёрную
    expect(tableauAccepts("Q♣", "K♠")).toBe(false); // тот же цвет
    expect(tableauAccepts("J♥", "K♠")).toBe(false); // не на 1 ниже
  });

  it("foundation: пусто — только A; иначе та же масть и на 1 выше", () => {
    expect(foundationAccepts("A♣", null)).toBe(true);
    expect(foundationAccepts("2♣", null)).toBe(false); // не туз
    expect(foundationAccepts("2♣", "A♣")).toBe(true); // та же масть, на 1 выше
    expect(foundationAccepts("2♦", "A♣")).toBe(false); // другая масть
    expect(foundationAccepts("3♣", "A♣")).toBe(false); // не на 1 выше
  });
});
