// КОЛОДА НА 36 — перетасованная, с id, по которым нельзя узнать карту.
//
// Id карты уходит в сеть ВСЕГДА, лицо — только тому, кому его видно. Id вида `hA` выдал бы туза
// червей любому, кто открыл вкладку «сеть», поэтому он случайный.

import { randomBytes } from "crypto";
import type { Face, Suit } from "./contract.js";

const RANKS = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];
const SUITS: Suit[] = ["s", "h", "d", "c"];

export function deal(random: () => number = Math.random): { id: string; face: Face }[] {
  const cards = SUITS.flatMap((suit) => RANKS.map((rank) => ({ id: randomBytes(6).toString("base64url"), face: { rank, suit } })));
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
