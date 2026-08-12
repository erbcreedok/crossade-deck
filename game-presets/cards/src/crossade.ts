// THE CROSSADE SET — 55 cards, as DATA: 52 standard (suit × rank) + 2 jokers + 1 brand card.
//
// A set is a birthpoint of elements with TYPED, sortable fields (the `sets.md` design, stage 5 of
// the canon). The engine's `ElementSet` machinery is not built yet, so this add-on models its own
// light field schema — enough to declare that `suit`, `rank` and `colour` are ORDERED fields whose
// `values` list IS their sort. That is what lets a hand be sorted by the data, not by a per-card rule.
//
// No art, no surface here — a spec carries only what it IS. The classic skin turns a spec into a
// face; the builder turns the set into nodes. The brand card carries the words "crossade deck" as
// its label; the words become a texture in the skin, since the engine's painter draws no glyphs.

import { suitByName, type SuitColor, type SuitName } from "./suits.js";

/** A field whose finite `values`, in order, are also its sort. The only field type the set needs. */
export interface OrderedField {
  readonly type: "ordered";
  readonly values: readonly string[];
}

/** The set's typed fields. The `values` arrays are the canonical order for a sort. */
export const CROSSADE_FIELDS = {
  suit: { type: "ordered", values: ["spade", "heart", "diamond", "club"] },
  rank: { type: "ordered", values: ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"] },
  colour: { type: "ordered", values: ["black", "red"] },
} as const satisfies Record<string, OrderedField>;

export type Rank = (typeof CROSSADE_FIELDS.rank.values)[number];
/** What a card IS at heart: a pip of a suit, a joker, or the brand card. */
export type CardKind = "pip" | "joker" | "brand";

export interface CardSpec {
  /** Stable, opaque, speaking id — becomes the node id and the face name downstream. */
  readonly id: string;
  readonly kind: CardKind;
  /** The typed field values this card carries — a subset of `CROSSADE_FIELDS`. */
  readonly values: Readonly<Record<string, string>>;
  /** The human string the card shows: a rank glyph, "JOKER", or "crossade deck". */
  readonly label: string;
}

const RANKS = CROSSADE_FIELDS.rank.values;
const SUITS_ORDER = CROSSADE_FIELDS.suit.values as readonly SuitName[];

/** The 52 standard cards: every rank of every suit, colour derived from the suit (one source). */
function standardCards(): CardSpec[] {
  const out: CardSpec[] = [];
  for (const suit of SUITS_ORDER) {
    const colour: SuitColor = suitByName(suit)!.color;
    for (const rank of RANKS) {
      out.push({ id: `${suit}-${rank}`, kind: "pip", values: { suit, rank, colour }, label: rank });
    }
  }
  return out;
}

// Two jokers — one red, one black, the colour the only field they carry. And one brand card, whose
// label is the words the skin will set into a texture. The brand has no art yet: just the words.
const JOKERS: readonly CardSpec[] = [
  { id: "joker-red", kind: "joker", values: { colour: "red" }, label: "JOKER" },
  { id: "joker-black", kind: "joker", values: { colour: "black" }, label: "JOKER" },
];
const BRAND: CardSpec = { id: "brand", kind: "brand", values: {}, label: "crossade deck" };

/** The whole set, in canonical order: 52 pips, then the two jokers, then the brand card. 55 in all. */
export function crossade(): CardSpec[] {
  return [...standardCards(), ...JOKERS, BRAND];
}
