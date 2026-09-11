// THE PUBLIC DOOR of this game — the one import a hub or any other shell comes through.
//
// A standalone entry (`main.ts`) and an embedding shell call the SAME function: a container in, a
// teardown out. The identical seam the solitaire already uses, so the hub cannot tell a table game
// from a patience and does not have to.
//
// `main.ts` is deliberately NOT exported. It grabs `#app`, builds the plain-browser host and wires
// hot reload — an entry, not an API.

import { browserHost, startDesk, type DeskHost, type Teardown } from "@game-presets/desk";
import { PALETTE } from "@crossade/look";
import { storedAccount } from "@crossade/wire";
import { cardsSpec } from "./spec.js";

export interface StartCardsOptions {
  /**
   * WHERE THIS IS BEING PLAYED. Omitted, the game builds the plain-browser one and is standalone:
   * the room comes out of `?room=`, nothing is laid over the region, and the clock is its own.
   */
  readonly host?: DeskHost;
}

/** Stand the card table up in `container`. The return value stops it completely. */
export function startCards(container: HTMLElement, o: StartCardsOptions = {}): Teardown {
  const account = storedAccount();
  return startDesk(container, cardsSpec(), {
    host: o.host ?? browserHost({ cover: PALETTE.felt }),
    ...(account ? { account } : {}),
  });
}

export { cardsSpec, CARD_SEATS } from "./spec.js";
