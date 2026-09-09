// THE BUILDER — the crossade set, expanded into 55 ready nodes through the engine's own `deck()`.
//
// This is the one call a game makes: `cards()` hands back 55 nodes, each `Bounded` (a card's size),
// `Surfaced` (its classic face), `Flippable` (turns over to the shared back) and `Valued` (its typed
// fields, what a rule reads). The nodes REFERENCE surface names; those names are the classic skin's,
// so by default `cards()` installs it — batteries included, a card renders with no second call. A
// game that ships its own skin passes `install: false` and registers its own faces under these names.

import { deck, type Node } from "game-kit";
import { crossade } from "./crossade.js";
import { BACK_SURFACE, faceSurface, installClassicSkin } from "./skin.classic.js";
import { type BackName } from "./decks/backs.js";
import { deckBackSurface, deckFaceSurface, installDeckBacks, installDeckSkin, type DeckSource } from "./decks/skin.js";
import type { DeckStyle } from "./decks/style.js";

export interface CardsOptions {
  /** The size every card is cut to, in units. Default 1×1.4. */
  readonly size?: { readonly w: number; readonly h: number };
  /** Install the classic skin first, so faces resolve. Default true — pass false to skin it yourself. */
  readonly install?: boolean;
}

/** The 55 crossade cards as nodes, in canonical set order, one physical copy each. */
export function cards(opts: CardsOptions = {}): Node[] {
  if (opts.install ?? true) installClassicSkin();
  const specs = crossade().map((card) => ({
    face: faceSurface(card),
    back: BACK_SURFACE,
    values: card.values,
  }));
  return deck(specs, opts.size ? { size: opts.size } : {});
}

/**
 * The same 55 cards, keyed by their SET id (`spade-A`, `heart-10`, `joker-red`, `brand`) — so a
 * consumer can pick a named hand without reaching into a node's opaque id. Order-independent lookup.
 */
export function deckByCardId(opts: CardsOptions = {}): Map<string, Node> {
  const nodes = cards(opts);
  const specs = crossade();
  return new Map(specs.map((spec, i) => [spec.id, nodes[i]!]));
}

export interface DeckCardsOptions extends CardsOptions {
  /** The look the cards wear — one of the deck design's styles. */
  readonly style: DeckStyle;
  /** The back every card turns over to. Default `plaid`. */
  readonly back?: BackName;
  /** Baked raster (what a game ships) or the live vector (what the raster is baked from). Default raster. */
  readonly source?: DeckSource;
}

/**
 * The same 55 cards, wearing a DECK STYLE instead of the classic skin — the user's own drawn deck
 * (see `decks/`). The same shape as `cards()`, a separate pair rather than a branch in it, so
 * picking a look stays a call, never a flag threaded through the engine.
 */
export function deckCards(opts: DeckCardsOptions): Node[] {
  const back = opts.back ?? "plaid";
  if (opts.install ?? true) {
    installDeckSkin(opts.style, opts.source);
    installDeckBacks(opts.source);
  }
  const specs = crossade().map((card) => ({
    face: deckFaceSurface(card, opts.style),
    back: deckBackSurface(back),
    values: card.values,
  }));
  return deck(specs, opts.size ? { size: opts.size } : {});
}

/** `deckByCardId()`, wearing a deck style — see `deckCards()`. */
export function deckCardsById(opts: DeckCardsOptions): Map<string, Node> {
  const nodes = deckCards(opts);
  const specs = crossade();
  return new Map(specs.map((spec, i) => [spec.id, nodes[i]!]));
}
