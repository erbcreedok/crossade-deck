// THE PUBLIC DOOR of this game — the one import a hub or any other shell comes through.
//
// A standalone entry (`main.ts`) and an embedding shell call the SAME function: a container in, a
// teardown out. The identical seam the solitaire and the card table already use.

import { browserHost, startDesk, type DeskHost, type Teardown } from "@game-presets/desk";
import { PALETTE } from "@crossade/look";
import { storedAccount } from "@crossade/wire";
import { nardySpec } from "./spec.js";

export interface StartNardyOptions {
  /**
   * WHERE THIS IS BEING PLAYED. Omitted, the game builds the plain-browser one and is standalone:
   * the room comes out of `?room=`, nothing is laid over the region, and the clock is its own.
   */
  readonly host?: DeskHost;
}

/** Stand the board up in `container`. The return value stops it completely. */
export function startNardy(container: HTMLElement, o: StartNardyOptions = {}): Teardown {
  const account = storedAccount();
  return startDesk(container, nardySpec(), {
    host: o.host ?? browserHost({ cover: PALETTE.felt }),
    ...(account ? { account } : {}),
  });
}

export { nardySpec, NARDY_SEATS } from "./spec.js";
