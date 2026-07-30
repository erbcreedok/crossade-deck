import { describe, it, expect } from "vitest";
import { SUITS, RANKS, createDeck52, makeRng, shuffle } from "./solitaireDeck";

describe("solitaireDeck.createDeck52", () => {
  it("возвращает 52 карты", () => {
    expect(createDeck52().length).toBe(52);
  });

  it("все карты уникальны", () => {
    expect(new Set(createDeck52()).size).toBe(52);
  });

  it("содержит все ожидаемые карты", () => {
    const deck = createDeck52();
    expect(deck.includes("A♠")).toBe(true);
    expect(deck.includes("K♣")).toBe(true);
    expect(deck.includes("10♦")).toBe(true);
  });

  it("каждая комбинация ранг×масть встречается ровно один раз", () => {
    const deck = createDeck52();
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        expect(deck.filter((c) => c === rank + suit).length).toBe(1);
      }
    }
  });
});

describe("solitaireDeck.shuffle", () => {
  it("не мутирует входной массив", () => {
    const d = createDeck52();
    const original = d[0];
    shuffle(d, makeRng(1));
    expect(d[0]).toBe(original);
  });

  it("детерминирован при одинаковом seed", () => {
    const a = shuffle(createDeck52(), makeRng(7));
    const b = shuffle(createDeck52(), makeRng(7));
    expect(a).toEqual(b);
  });

  it("результат — перестановка того же набора карт", () => {
    const shuffled = shuffle(createDeck52(), makeRng(7));
    expect([...shuffled].sort()).toEqual([...createDeck52()].sort());
  });

  it("порядок карт меняется", () => {
    const shuffled = shuffle(createDeck52(), makeRng(7));
    expect(shuffled).not.toEqual(createDeck52());
  });
});
