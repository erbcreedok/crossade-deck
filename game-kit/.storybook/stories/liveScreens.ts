// THE OTHER SCREENS ON A LIVE DESK — what every live page needs and none should write twice.
//
// A cursor is a picture of a PERSON; a carry is what their hand is doing to the desk. Both are
// mirrored here, once, so a page that adds a second pair of eyes adds this and nothing else — and so
// a bug in it is one bug, fixed in one place, for every desk on the shelf.

import { type CarryItem, type CarryFeel, type Vec, type Transform, follow as followInKit, type Scene as MirrorScene } from "../../src/index.js";
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
  const mirrorScreen = {
    seat: screen.seat,
    scene: screen.scene as MirrorScene | undefined,
    mirroring: screen.mirroring,
    onCursor: (cursorAt: Vec | undefined, view: Transform | undefined) => {
      if (!cursorAt || !view) {
        screen.dot.style.display = "none";
        return;
      }
      screen.dot.style.display = "block";
      screen.dot.style.left = `${view.a * cursorAt.x + view.c * cursorAt.y + view.e}px`;
      screen.dot.style.top = `${view.b * cursorAt.x + view.d * cursorAt.y + view.f}px`;
    },
  };
  followInKit(mirrorScreen, items, at, done, lift, feel, fromSeat);
  screen.mirroring = mirrorScreen.mirroring;
}
