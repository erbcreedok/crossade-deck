// THE PUBLIC DOOR of this game — the one import a hub or any other shell comes through.
//
// A standalone entry (`main.ts`) and an embedding shell call the SAME function: a container in, a
// teardown out. The identical seam the solitaire already uses, so the hub cannot tell a table game
// from a patience and does not have to.
//
// `main.ts` is deliberately NOT exported. It grabs `#app`, builds the plain-browser host and wires
// hot reload — an entry, not an API.

import { browserHost, startDesk, type DeskHost, type Teardown } from "@game-presets/desk";
import { loadingCross, PALETTE } from "@crossade/look";
import { storedAccount } from "@crossade/wire";
import { cardsSpec } from "./spec.js";

export interface StartCardsOptions {
  /**
   * WHERE THIS IS BEING PLAYED. Omitted, the game builds the plain-browser one and is standalone:
   * the room comes out of `?room=`, nothing is laid over the region, and the clock is its own.
   */
  readonly host?: DeskHost;
  /**
   * Show the loading screen, or leave it to whoever is already showing one. A hub puts one up while
   * the chunk is still downloading, and two would fade out one after the other.
   */
  readonly loading?: boolean;
}

/** Stand the card table up in `container`. The return value stops it completely. */
export function startCards(container: HTMLElement, o: StartCardsOptions = {}): Teardown {
  const account = storedAccount();
  // UP BEFORE ANYTHING ELSE IS, and down when the table is worth looking at — which is later than
  // the first frame by a room's round trip and a tree.
  const loading = o.loading === false ? undefined : loadingCross(container, "Загружаю карты");
  const stop = startDesk(container, cardsSpec(), {
    host: o.host ?? browserHost({ cover: PALETTE.felt }),
    ...(account ? { account } : {}),
    onReady: () => loading?.done(),
  });
  return () => {
    // ...AND IT COMES DOWN WITH THE TABLE, whether the table ever arrived or not: a game torn down
    // mid-join must not leave its loading screen on a stage the shelf is about to draw into.
    loading?.done();
    stop();
  };
}

export { cardsSpec, CARD_SEATS } from "./spec.js";
