// WHERE A DESK IS BEING PLAYED WHEN IT IS BEING PLAYED IN THE HUB.
//
// The four answers a `DeskHost` owes, in the hub's own terms: the room comes out of the route
// (`#cards?room=AB12`), a new code is written back to the same route, the cover is the shelf's felt,
// and the clock is the hub's own `beat` — the one the shelf's sparkle already counts on, so a table
// and the page under it never run two frame loops.
//
// The standalone answers to the very same questions are four lines in `@game-presets/desk`
// (`browserHost`). That both exist and neither is bigger than this is the whole point: a game does
// not know which of them it has been handed.

import { topInsetOf, type DeskHost } from "@game-presets/desk";
import type { TopHudExit } from "@game-presets/tophud";
import { PALETTE } from "@crossade/look";
import { beat } from "../hub/beat.js";
import { goTo, placeOf } from "../hub/route.js";

/** Everything the page is allowed to lay OVER a running desk — the Telegram banner, and nothing else. */
const STAGE_COVERS = "#tg-banner";

/**
 * WHAT IS COVERING THE TOP OF THE DESK'S OWN REGION, in CSS pixels.
 *
 * THE HUB'S OWN STRIP WITH THE WAY BACK IS NOT IN THIS NUMBER, and that is the point of measuring
 * rather than adding one up: the game's region already starts below the strip (`#stage`, 56px in the
 * page's own stylesheet), so counting the strip here would take the same band off the desk twice.
 */
export function topInsetOfStage(container: Element, covers?: readonly Element[]): number {
  return topInsetOf(container, covers ?? Array.from(document.querySelectorAll(STAGE_COVERS)));
}

/** The host a game is handed when the hub is the one running it. */
export function hubHost(container: HTMLElement, game: string, exit?: TopHudExit): DeskHost {
  // THE HUB'S OWN BEAT, and not a clock of the desk's own: the shelf behind the stage is still
  // counting frames for its sparkle, and two loops on one page is the leak that reads as lag.
  const clock = beat(() => {});
  return {
    room: () => placeOf().room,
    // THE SAME ROUTE THE PLAYER CAME IN BY — and `replace`, never `push`: a table that named itself
    // is not a place the reader navigated to, and Back undoing it would take them out of the game.
    setRoom: (code) => goTo(game, "replace", code),
    insets: () => ({ top: topInsetOfStage(container) }),
    // THE ONE THING ONLY THE HUB KNOWS. Standalone answers nothing here, and its strip has no way
    // out on it.
    ...(exit ? { exit } : {}),
    clock: () => clock,
    cover: PALETTE.felt,
  };
}
