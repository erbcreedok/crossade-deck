// Разбор карты ("10♠", "A♥") и цвет масти. Чистая логика — тестируется юнитами.
// Масть — последний символ строки, ранг — всё до него.

export const SUITS = ["♠", "♥", "♦", "♣"] as const;
export type Suit = (typeof SUITS)[number];

export interface Card {
  rank: string; // "6".."10","J","Q","K","A"
  suit: Suit;
}

/**
 * Буквенные псевдонимы мастей — ВВОД, а не хранение. `♠♥♦♣` остаются единственной мастью движка:
 * они уходят в состояние, в текстуры, в сравнения и в сеть. Буквы существуют потому, что набрать
 * `10♠` с клавиатуры нельзя — ни в контроле каталога, ни в консоли, ни в e2e; каждый раз это был
 * поход за символом.
 *
 * Только ЗАГЛАВНЫЕ и только в конце строки. Строчные брать нельзя: `c` — это ещё и «clubs», и
 * начало `court`, а главное — ранга `c` не бывает, зато молчаливое приведение регистра однажды
 * превратит опечатку в валидную карту вместо честной ошибки.
 */
const SUIT_ALIASES: Readonly<Record<string, Suit>> = { S: "♠", H: "♥", D: "♦", C: "♣" };

/** Привести буквенную масть к символьной. Строка уже с символом возвращается как есть. */
export function normalizeCard(s: string): string {
  const alias = SUIT_ALIASES[s.slice(-1)];
  return alias ? s.slice(0, -1) + alias : s;
}

export function parseCard(s: string): Card {
  const n = normalizeCard(s);
  return { rank: n.slice(0, -1), suit: n.slice(-1) as Suit };
}

export function isCourt(rank: string): boolean {
  return rank === "J" || rank === "Q" || rank === "K";
}

// Цвет масти. Классика: ♥♦ красные, ♠♣ чёрные. Четырёхцветная (для слабовидящих):
// ♠ чёрный, ♥ красный, ♦ оранжевый, ♣ голубой — все четыре различимы.
export function suitColor(suit: Suit, fourColor: boolean): number {
  const RED = 0xd83a3a;
  const BLACK = 0x1a1a1a;
  if (!fourColor) return suit === "♥" || suit === "♦" ? RED : BLACK;
  switch (suit) {
    case "♠":
      return BLACK;
    case "♥":
      return RED;
    case "♦":
      return 0xe08a2a; // оранжевый
    case "♣":
      return 0x2a7ad8; // голубой
  }
}
