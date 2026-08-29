// THE SWIPE — a finger that LEFT, rather than one that travelled.
//
// A drag and a swipe are the same pixels. What tells them apart is never the path: it is what the
// hand was doing when it let go. A drag ends where the finger stopped; a swipe ends where the
// finger was still GOING, and the piece carries on without it. So this measures three things a
// drag never asks about — how fast the finger was moving at the end, how far it got, and how
// straight it was — and reports them, ONCE, when the hand has gone. It decides nothing else.
//
// IT IS THE PAN, JUDGED AT `ended` — `UISwipeGestureRecognizer` beside `UIPanGestureRecognizer`,
// which is how the platform ships them too. There is exactly one piece of finger bookkeeping in
// this kit (`pan.ts`): one place that knows what a coalesced reading is, one window the parting
// speed is measured over, one anchor rule for the other hand. Written twice, the two would drift,
// and the drift would be invisible — a page would simply feel different from its neighbour.
//
// WHAT IS LEFT HERE IS THE VERDICT, which is the whole of what a swipe is over a pan: the three
// thresholds, and the arithmetic of "how straight was it" that only makes sense once the gesture
// is over.
//
// IT REPORTS THE OTHER HAND TOO, and that is the point of the file rather than a convenience. On a
// table, one finger holding a pack while another deals off it is the ordinary gesture, and the two
// are only distinguishable by their ROLES: the anchor rests, the dealer flicks. So `Swipe.anchor`
// says whether another finger was down, what it was on, and how far it wandered — and the consumer
// writes its own law out of those numbers.

import { type Node, type NodeId } from "../core/node.js";
import { type Transform, type Vec } from "../core/transform.js";
import { type Host } from "./host.js";
import { wirePan, type HandAnchor } from "./pan.js";

/**
 * How fast the finger has to be leaving, in ROOT UNITS per second.
 *
 * Units and not pixels, unlike a slop: a slop is a property of the hand (a steady thumb is steady
 * at any zoom), and this is a property of the THROW — how hard the piece was sent. A desk zoomed
 * out has smaller pixels and the same units, and a card must not need a harder flick because the
 * camera pulled back.
 *
 * The unit is the piece, so this is "three of its own widths a second" — brisk enough that nobody
 * reaches it while placing something, slow enough that a lazy deal still counts.
 */
export const SWIPE_SPEED = 3;

/**
 * How far the finger has to travel before it is going anywhere at all, root units.
 *
 * A tap has a speed too — a fast one is a very short line covered very quickly — and without a
 * reach every crisp tap is a swipe of a millimetre. Half a piece is the smallest distance a hand
 * means as a direction.
 */
export const SWIPE_REACH = 0.5;

/**
 * HOW STRAIGHT IT HAS TO BE: the straight line from start to end, over the path actually walked.
 * `1` is a ruler, and a circle is near `0`.
 *
 * It is what keeps a knead from being read as a deal. Fingers that rub back and forth cover ground
 * quickly and end up nowhere, so speed and reach both pass and only this refuses them. `0.8` allows
 * an ordinary human arc and refuses anything that changed its mind.
 */
export const SWIPE_STRAIGHT = 0.8;

export interface Swipe {
  /** What the swiping finger came down on. */
  readonly on: Node;
  /** Where it began and where it left, root units. */
  readonly from: Vec;
  readonly to: Vec;
  /**
   * Where it was heading, DEGREES CLOCKWISE FROM +X — the same convention `slide` and `launch` take,
   * so a swipe's direction is a throw's `angle` with nothing translating in between.
   */
  readonly angle: number;
  /** How fast it was going as it left, root units/s — a throw's `speed`, on the same terms. */
  readonly speed: number;
  /** How far it got, root units, start to end. */
  readonly reach: number;
  /** How straight it was, `0..1` — see `SWIPE_STRAIGHT`. */
  readonly straight: number;
  /** The other finger, when one was down — see `HandAnchor`. */
  readonly anchor: HandAnchor | undefined;
}

export interface SwipeWiring {
  readonly host: Host;
  /**
   * What a swipe may start on. There is no default, for the reason a hold has none: a game that
   * deals off a pack and a game that flicks single pieces want different answers.
   */
  readonly want: (n: Node) => boolean;
  /** Called ONCE per gesture, when a finger that qualified has left the glass. */
  readonly onSwipe: (swipe: Swipe) => void;
  /** How fast it has to be leaving, root units/s. Absent, `SWIPE_SPEED`. */
  readonly minSpeed?: number | undefined;
  /** How far it has to have travelled, root units. Absent, `SWIPE_REACH`. */
  readonly minReach?: number | undefined;
  /** How straight it has to be, `0..1`. Absent, `SWIPE_STRAIGHT`. */
  readonly minStraight?: number | undefined;
  /** The view the desk is drawn through, asked FRESH — a camera's `transform()`. */
  readonly view?: (() => Transform) | undefined;
  /** Where the moving pieces are drawn (`Motions.poses()`), so the finger tests what the eye sees. */
  readonly poses?: (() => ReadonlyMap<NodeId, Transform> | undefined) | undefined;
}

/**
 * Wire the swipe. Returns the teardown.
 *
 * Nothing is registered per node: the tree is asked who is under the finger at the moment there is
 * one, and every reading of that finger comes from the one recogniser (`wirePan`).
 */
export function wireSwipe(w: SwipeWiring): () => void {
  const minSpeed = w.minSpeed ?? SWIPE_SPEED;
  const minReach = w.minReach ?? SWIPE_REACH;
  const minStraight = w.minStraight ?? SWIPE_STRAIGHT;

  return wirePan({
    host: w.host,
    want: w.want,
    view: w.view,
    poses: w.poses,
    onPan: (p) => {
      // A SWIPE HAPPENS WHEN THE HAND HAS GONE, and only then. Every step before it is a finger
      // still travelling, and a finger still travelling is a drag until it proves otherwise.
      if (p.state !== "ended") return;
      const to = p.at;
      const reach = Math.hypot(p.translation.x, p.translation.y);
      if (reach < minReach) return;
      // How straight it went: the line it made over the ground it covered. `1` is a ruler. It is
      // what keeps a knead from reading as a deal — fingers that rub back and forth cover ground
      // quickly and end up nowhere, so speed and reach both pass and only this refuses them.
      const straight = p.walked > 0 ? Math.min(1, reach / p.walked) : 1;
      if (straight < minStraight) return;
      const speed = Math.hypot(p.velocity.x, p.velocity.y);
      if (speed < minSpeed) return;
      w.onSwipe({
        on: p.on,
        from: p.from,
        to,
        angle: (Math.atan2(to.y - p.from.y, to.x - p.from.x) * 180) / Math.PI,
        speed,
        reach,
        straight,
        anchor: p.anchor,
      });
    },
  });
}
