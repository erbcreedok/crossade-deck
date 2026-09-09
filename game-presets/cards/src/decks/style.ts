// A DECK STYLE — the three switches the deck design exposes, as one value. A game names the style
// it plays with, a player may carry a personal one; a face is drawn FROM a style, never from a
// flag threaded through the engine. Every combination is a preset with a speaking id, so a look
// is a call (`installDeckSkin(style)`) and a baked folder (`baked/<id>/`) and nothing else.
//
// Colour lives here as CONTENT, exactly as `textures/cards.ts` says of its inks: a picture does
// not follow the theme, a red suit stays red on a dark desk. `guards.test.ts` pens raw colour to
// `textures/` and `decks/` for that reason.

import type { SuitName } from "../suits.js";

/** How a face is laid out: the pip grid with drawn courts, or one index and one mark. */
export type DeckLayout = "classic" | "minimal";
export const DECK_LAYOUTS: readonly DeckLayout[] = ["classic", "minimal"];

export interface DeckStyle {
  readonly layout: DeckLayout;
  /** One ink per suit — spades blue, diamonds orange — so a suit is told at a glance in a squeezed hand. */
  readonly fourColour: boolean;
  /** Т В Д К and «Джокер» in place of A J Q K and JOKER. Numbers are the same glyphs in both. */
  readonly cyrillic: boolean;
}

/** Every style there is, classic first, plain before four-colour, Latin before Cyrillic. */
export const DECK_STYLES: readonly DeckStyle[] = DECK_LAYOUTS.flatMap((layout) =>
  [false, true].flatMap((fourColour) => [false, true].map((cyrillic) => ({ layout, fourColour, cyrillic }))),
);

/** `classic`, `classic-4c`, `classic-cyr`, `classic-4c-cyr`, and the same under `minimal`. */
export function deckStyleId(style: DeckStyle): string {
  return [style.layout, style.fourColour ? "4c" : "", style.cyrillic ? "cyr" : ""].filter(Boolean).join("-");
}

/** The style behind an id, or `undefined` for a name nobody declared — never a throw. */
export function deckStyleOf(id: string): DeckStyle | undefined {
  return DECK_STYLES.find((style) => deckStyleId(style) === id);
}

/** The deck's paper and its two classic inks. */
export const PAPER = { stock: "#f7f1e6", black: "#0b0704", red: "#b3221f" } as const;

/** The four-colour inks — the owner's call: diamonds orange, spades blue; hearts red and clubs black as ever. */
export const FOUR_INK: Readonly<Record<SuitName, string>> = {
  spade: "#2f6fb0",
  heart: PAPER.red,
  diamond: "#d97a1f",
  club: PAPER.black,
};

const RED_SUITS: ReadonlySet<SuitName> = new Set(["heart", "diamond"]);

/** The ink a suit's index and pips wear under a style. */
export function inkOf(suit: SuitName, style: DeckStyle): string {
  if (style.fourColour) return FOUR_INK[suit];
  return RED_SUITS.has(suit) ? PAPER.red : PAPER.black;
}

/**
 * THE FIGURE'S ACCENT — the one paint a court figure takes from outside (`currentColor` in the
 * art). Every figure is drawn with a red accent; a four-colour deck turns only the diamonds'
 * orange. Spades and clubs keep their engraving untouched — their suit reads on the index and pips.
 */
export type Accent = "red" | "orange";
export const ACCENT_PAINT: Readonly<Record<Accent, string>> = { red: PAPER.red, orange: FOUR_INK.diamond };

export function accentOf(suit: SuitName, style: DeckStyle): Accent {
  return style.fourColour && suit === "diamond" ? "orange" : "red";
}

/** The index is a LABEL, not the rank: keys stay Latin, the card shows Т/В/Д/К when asked. */
const CYRILLIC: Readonly<Record<string, string>> = { A: "Т", J: "В", Q: "Д", K: "К" };

export function rankLabel(rank: string, style: DeckStyle): string {
  return style.cyrillic ? (CYRILLIC[rank] ?? rank) : rank;
}

export function jokerWord(style: DeckStyle): string {
  return style.cyrillic ? "Джокер" : "JOKER";
}
