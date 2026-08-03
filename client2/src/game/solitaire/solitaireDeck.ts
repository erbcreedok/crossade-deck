// Колода 52 карт + детерминированный тасователь (issue #83). Чистые функции без состояния:
// создание упорядоченной колоды, seed-based RNG (mulberry32) и Fisher–Yates поверх него.

export const SUITS: readonly string[] = ["♠", "♥", "♦", "♣"];
export const RANKS: readonly string[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

/** Упорядоченная колода 52 карт: для каждой масти — все ранги. */
export function createDeck52(): string[] {
  const deck: string[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(rank + suit);
    }
  }
  return deck;
}

/** Детерминированный RNG [0,1) на основе seed (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher–Yates: возвращает НОВЫЙ перемешанный массив, вход не мутирует. */
export function shuffle<T>(cards: readonly T[], rng: () => number): T[] {
  const result = [...cards];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
