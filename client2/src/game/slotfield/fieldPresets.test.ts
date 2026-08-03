import { describe, it, expect } from "vitest";
import { cardColor, rankOf } from "./fieldPresets";

describe("boardPresets helpers", () => {
  it("cardColor — по масти", () => {
    expect(cardColor("6♥")).toBe("red");
    expect(cardColor("8♦")).toBe("red");
    expect(cardColor("7♠")).toBe("black");
    expect(cardColor("K♣")).toBe("black");
  });
  it("rankOf — числа и картинки", () => {
    expect(rankOf("6♥")).toBe(6);
    expect(rankOf("10♣")).toBe(10);
    expect(rankOf("J♠")).toBe(11);
    expect(rankOf("Q♦")).toBe(12);
    expect(rankOf("K♥")).toBe(13);
    expect(rankOf("A♣")).toBe(14);
  });
});
