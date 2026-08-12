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
