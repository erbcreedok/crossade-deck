import { describe, it, expect } from "vitest";
import { parseCard, isCourt, normalizeCard, suitColor } from "./card";

describe("parseCard", () => {
  it("разбирает ранг и масть, включая '10'", () => {
    expect(parseCard("10♠")).toEqual({ rank: "10", suit: "♠" });
    expect(parseCard("A♥")).toEqual({ rank: "A", suit: "♥" });
    expect(parseCard("K♦")).toEqual({ rank: "K", suit: "♦" });
    expect(parseCard("6♣")).toEqual({ rank: "6", suit: "♣" });
  });
});

describe("isCourt", () => {
  it("J/Q/K — картинки, остальные нет", () => {
    expect(isCourt("J")).toBe(true);
    expect(isCourt("Q")).toBe(true);
    expect(isCourt("K")).toBe(true);
    expect(isCourt("A")).toBe(false);
    expect(isCourt("10")).toBe(false);
  });
});

describe("suitColor", () => {
  it("классика: ♥♦ красные, ♠♣ чёрные", () => {
    const red = suitColor("♥", false);
    expect(suitColor("♦", false)).toBe(red);
    const black = suitColor("♠", false);
    expect(suitColor("♣", false)).toBe(black);
    expect(red).not.toBe(black);
  });

  it("четырёхцветная: все четыре масти различимы (♦ оранж, ♣ голубой)", () => {
    const colors = [suitColor("♠", true), suitColor("♥", true), suitColor("♦", true), suitColor("♣", true)];
    expect(new Set(colors).size).toBe(4); // все разные
    expect(suitColor("♦", true)).not.toBe(suitColor("♥", true)); // бубны ≠ черви
    expect(suitColor("♣", true)).not.toBe(suitColor("♠", true)); // трефы ≠ пики
  });
});

// Буквенная масть — способ НАБРАТЬ карту с клавиатуры (в контроле каталога, в консоли, в e2e):
// «♠» там взять неоткуда. Хранит движок всё равно символ, поэтому проверяем и приведение.
describe("буквенные псевдонимы мастей", () => {
  it("заглавные S H D C читаются как масти", () => {
    expect(parseCard("AS")).toEqual({ rank: "A", suit: "♠" });
    expect(parseCard("10H")).toEqual({ rank: "10", suit: "♥" });
    expect(parseCard("KD")).toEqual({ rank: "K", suit: "♦" });
    expect(parseCard("6C")).toEqual({ rank: "6", suit: "♣" });
  });

  it("normalizeCard приводит букву к символу и не трогает уже символьную запись", () => {
    expect(normalizeCard("10H")).toBe("10♥");
    expect(normalizeCard("10♥")).toBe("10♥");
  });

  // Строчные НЕ псевдонимы: иначе опечатка молча стала бы валидной картой вместо честной ошибки.
  it("строчные буквы мастью не считаются", () => {
    expect(normalizeCard("10h")).toBe("10h");
  });
});
