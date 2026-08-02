import { describe, expect, it } from "vitest";
import { handOrderAfterDrop } from "./handOrder";

// Реордер руки по индексу вставки — чистая splice-логика (см. handOrder.ts). Индекс сюда приходит
// уже посчитанным деревом слотов (dropTarget), здесь тестируем только саму перестановку.

describe("handOrderAfterDrop", () => {
  const hand = ["A♠", "K♥", "Q♦", "J♣"];

  it("вставка в начало", () => {
    expect(handOrderAfterDrop(hand, "J♣", 0)).toEqual(["J♣", "A♠", "K♥", "Q♦"]);
  });

  it("вставка в середину", () => {
    expect(handOrderAfterDrop(hand, "J♣", 2)).toEqual(["A♠", "K♥", "J♣", "Q♦"]);
  });

  it("вставка в конец", () => {
    expect(handOrderAfterDrop(hand, "A♠", 4)).toEqual(["K♥", "Q♦", "J♣", "A♠"]);
  });

  it("бросок на своё же место — порядок не меняется", () => {
    // A♠ уже стоИт на позиции 0: убрали из [K♥,Q♦,J♣] и вставили обратно на 0 — тот же массив.
    expect(handOrderAfterDrop(hand, "A♠", 0)).toEqual(hand);
  });

  it("индекс за пределами руки зажимается в конец", () => {
    expect(handOrderAfterDrop(hand, "A♠", 99)).toEqual(["K♥", "Q♦", "J♣", "A♠"]);
  });

  it("отрицательный индекс зажимается в начало", () => {
    expect(handOrderAfterDrop(hand, "J♣", -5)).toEqual(["J♣", "A♠", "K♥", "Q♦"]);
  });

  it("карты нет в руке — исходный порядок возвращается копией", () => {
    const next = handOrderAfterDrop(hand, "9♦", 1);
    expect(next).toEqual(hand);
    expect(next).not.toBe(hand); // копия, не тот же массив
  });
});
