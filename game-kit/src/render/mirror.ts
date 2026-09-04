import { type CarryFeel } from "./landing.js";
import { type CarryItem, type Motions } from "./animator/index.js";
import { type Host } from "./host.js";
import { type Transform, type Vec } from "../core/transform.js";

/**
 * THE OTHER SCREENS ON ONE DESK.
 *
 * Two hosts over one tree is what two people at one board ARE, and it needs exactly two things said.
 * A host is only ever told by being TOLD, so a change made here has to be announced (`changed`); and
 * a carry is an OVERRIDE and never a tree write, so a hand moving here is invisible over there
 * unless it is reported (`hand`) and mirrored. Without the second, the far screen sees a cursor
 * gliding about and the card it is holding standing perfectly still — which is not a shared desk,
 * it is two people looking at different ones.
 */
export interface Mirror<S = Scene> {
  /** This screen, handed over once it exists, so the caller can wire the other direction. */
  readonly ready: (s: S, grasp: () => void) => void;
  /** This screen changed the tree everybody is reading. */
  readonly changed: () => void;
  /**
   * This screen's hand: what it holds, WHERE EACH OF THOSE STANDS IN IT, where the hand is, and
   * whether it has let go.
   *
   * The offsets are half the message. Told only the names, the far screen has nothing to lay the run
   * out by and puts every piece at the anchor: a deck of thirty-six arrives as one card, and the two
   * screens show plainly different things while claiming to show one desk.
   */
  readonly hand: (items: readonly CarryItem[], at: Vec | undefined, done: boolean, feel: CarryFeel) => void;
}

/** A scene, as far as a mirror needs to know it: what it holds and how it moves things. */
export interface Scene {
  readonly host: Host;
  readonly motions?: Motions;
  readonly camera?: { readonly transform: () => Transform | undefined };
}

/** One screen of a live desk, as far as a mirror needs to know it. */
export interface Screen {
  readonly seat: string;
  scene?: Scene | undefined;
  /** What this screen is currently mirroring for somebody else — started ONCE, then only steered. */
  mirroring?: readonly string[] | undefined;
  /** Where the far hand's cursor is drawn — undefined hides it. */
  onCursor?: ((at: Vec | undefined, view: Transform | undefined) => void) | undefined;
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
    screen.onCursor?.(undefined, undefined);
    s.motions?.redraw();
    return;
  }
  const view = s.camera?.transform();
  screen.onCursor?.(at, view);
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
