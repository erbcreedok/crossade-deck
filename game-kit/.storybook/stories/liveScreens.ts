// THE OTHER SCREENS ON A LIVE DESK — what every live page needs and none should write twice.
//
// A cursor is a picture of a PERSON; a carry is what their hand is doing to the desk. Both are
// mirrored here, once, so a page that adds a second pair of eyes adds this and nothing else — and so
// a bug in it is one bug, fixed in one place, for every desk on the shelf.

import { type CarryItem, type Vec } from "../../src/index.js";
import { type CarryFeel } from "../../src/index.js";
import { type Scene } from "../devtools/scene.js";

/** One screen of a live desk: its seat, its colour, its scene once it exists, and its cursor. */
export interface Screen {
  readonly seat: string;
  readonly ink: string;
  readonly dot: HTMLElement;
  scene?: Scene;
  /** Re-read the handles this screen did not draw — see `regrasp`. */
  grasp?: () => void;
  /** What this screen is currently mirroring for somebody else — started ONCE, then only steered. */
  mirroring?: readonly string[] | undefined;
}

/**
 * SHOW A HAND THAT IS NOT THIS SCREEN'S. Two things, and they are two because a cursor is a picture
 * of a PERSON and a carry is what their hand is doing to the desk.
 *
 * The carry is mirrored with the same calls the local wiring makes, and with the same FEEL: told
 * only the anchor, this screen would slide a piece where the other one lifts and leans it, and two
 * people at one board would be watching two different boards.
 *
 * The cursor is drawn over the GLASS and never on the desk: a piece is what anything on the felt
 * would be — touchable, heapable, and in everybody's way — and a picture of somebody's finger is
 * none of those.
 */
export function follow(
  screen: Screen,
  items: readonly CarryItem[],
  at: Vec | undefined,
  done: boolean,
  lift: number,
  feel: CarryFeel,
  fromSeat?: string,
): void {
  const s = screen.scene;
  if (!s) return;
  const hand = `mirror:${fromSeat ?? screen.seat}`;
  const ids = items.map((it) => it.id);
  if (done || !at) {
    for (const id of screen.mirroring ?? ids) s.motions?.release(id, hand);
    screen.mirroring = undefined;
    screen.dot.style.display = "none";
    s.motions?.redraw();
    return;
  }
  const view = s.camera?.transform();
  if (view) {
    screen.dot.style.display = "block";
    screen.dot.style.left = `${view.a * at.x + view.c * at.y + view.e}px`;
    screen.dot.style.top = `${view.b * at.x + view.d * at.y + view.f}px`;
  }
  // STARTED ONCE, THEN ONLY STEERED — a carry begun again on every move never gets past its own
  // first frame: the springs are re-seeded at the anchor, so nothing trails and nothing leans, and a
  // heap of thirty-six spends every frame building records to throw away.
  if (screen.mirroring?.length !== ids.length || screen.mirroring.some((id, i) => id !== ids[i])) {
    for (const id of screen.mirroring ?? []) s.motions?.release(id, hand);
    screen.mirroring = [...ids];
    s.motions?.grab(items, { ...feel, anchor: at, lift, hand });
  }
  // ...AND THE CLOCK DRAWS IT. `dragTo` arms this screen's own loop, and the loop paints the man
  // riding the anchor frame by frame — the same frames the near screen paints him on. A paint
  // here as well, on every move, was a whole extra plan per pointer event on top of the two loops
  // already running: three plans a frame for one moving man, and the hang that came with it.
  s.motions?.dragTo(at, hand);
}
