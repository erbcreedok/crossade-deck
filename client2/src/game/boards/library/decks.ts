// Колоды-хелперы библиотеки борд: карты как ДАННЫЕ (ElementDef), id = лицо.

import { SUITS } from "../../card";
import type { ElementDef } from "../spec";

const RANKS_36 = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;
const RANKS_52 = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"] as const;

function deckOf(ranks: readonly string[]): { cards: ElementDef[]; ids: string[] } {
  const cards: ElementDef[] = [];
  for (const s of SUITS) for (const r of ranks) cards.push({ kind: "card", id: `${r}${s}`, face: `${r}${s}` });
  return { cards, ids: cards.map((c) => c.id) };
}

export function deck36(): { cards: ElementDef[]; ids: string[] } {
  return deckOf(RANKS_36);
}

export function deck52(): { cards: ElementDef[]; ids: string[] } {
  return deckOf(RANKS_52);
}
