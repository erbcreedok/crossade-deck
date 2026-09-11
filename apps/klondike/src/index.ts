// THE PUBLIC DOOR of this game — the one import a hub or any other shell comes through.
//
// A standalone entry (`main.ts`) and an embedding shell call the SAME function: a container in, a
// teardown out. That seam is also the shape an iframe or a separate page would take, so the day
// this game moves to its own URL, nothing on the other side of the door has to change.
//
// `main.ts` is deliberately NOT here. It grabs `#app` and wires hot reload — an entry, not an API,
// and nothing else should be able to import it.

import { loadingCross } from "@crossade/look";
import { startSolitaire as buildTable } from "./solitaire/scene.js";

export interface StartSolitaireOptions {
  /**
   * Show the loading screen, or leave it to whoever is already showing one. A hub puts one up while
   * the chunk is still downloading, and two would fade out one after the other.
   */
  readonly loading?: boolean;
}

/**
 * Deal a game of Klondike in `container`. The return value stops it completely.
 *
 * THE TABLE IS BUILT IN ONE BREATH — there is no room to join and no tree to wait for — but its
 * CARDS ARE FILES, and until those are decoded the layout is a table of blank rectangles. So the
 * screen comes down on a frame that has actually been painted, and not on the line that built it.
 */
export function startSolitaire(container: HTMLElement, o: StartSolitaireOptions = {}): () => void {
  const loading = o.loading === false ? undefined : loadingCross(container, "Загружаю косынку");
  const stop = buildTable(container);
  // TWO FRAMES, not one: the first is where the painter is handed the scene, the second is the one
  // it has actually put on the glass. Lifting after the first shows the table mid-build, which is
  // exactly the flash this exists to cover.
  requestAnimationFrame(() => requestAnimationFrame(() => loading?.done()));
  return () => {
    loading?.done();
    stop();
  };
}
