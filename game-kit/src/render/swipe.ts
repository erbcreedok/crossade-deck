// THE SWIPE — a finger that LEFT, rather than one that travelled.
//
// A drag and a swipe are the same pixels. What tells them apart is never the path: it is what the
// hand was doing when it let go. A drag ends where the finger stopped; a swipe ends where the
// finger was still GOING, and the piece carries on without it. So this measures three things a
// drag never asks about — how fast the finger was moving at the end, how far it got, and how
// straight it was — and reports them. It decides nothing.
//
// IT REPORTS THE OTHER HAND TOO, and that is the point of the file rather than a convenience. On a
// table, one finger holding a pack while another deals off it is the ordinary gesture, and the two
// are only distinguishable by their ROLES: the anchor rests, the dealer flicks. A recogniser that
// saw one finger at a time would have to guess, and a consumer that had to reconstruct the other
// finger from raw events would be writing this file again. So `Swipe.anchor` says whether another
// finger was down, what it was on, and how far it wandered — and the consumer writes its own law
// out of those numbers. `Engine/Gestures` is that law, written down once.
//
// EVENT-DRIVEN THROUGHOUT, with no timer of any kind (`guard.one-clock`): a swipe is made entirely
// of events that HAPPENED, so there is nothing to wait for. That is the difference from a long
// press, which has to be measured against silence.

import { type Node, type NodeId } from "../core/node.js";
import { type Point } from "../core/atoms/bounded.js";
import { type Transform, type Vec } from "../core/transform.js";
import { type Host } from "./host.js";
import { glassOf, pickTop, toUnits } from "./pointer.js";

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

/**
 * How far the OTHER finger may wander and still be an anchor, in glass pixels.
 *
 * NOT the long press's five. That number asks "did this finger stay put for half a second", and it
 * is measured against a thumb that is doing nothing else. This one asks something slacker and
 * longer: "is that hand HOLDING the pack while the other one works" — over as many seconds as the
 * dealing takes, on a hand that is being jostled by its own neighbour. A real thumb resting on a
 * deck wanders a good deal more than five pixels in that time, and a deal refused because the
 * holding hand breathed is a gesture that simply never fires — which is exactly how this was found.
 *
 * Twenty-four is about four millimetres on a phone: unmistakably the same spot, and unmistakably
 * less than going anywhere. Pixels rather than units, because it is a claim about the HAND.
 */
export const ANCHOR_SLOP = 24;

/** The finger that was already down when the swipe began — the hand holding what is being dealt off. */
export interface SwipeAnchor {
  /** What it came down on, if it came down on anything. */
  readonly on: Node | undefined;
  /** Where it is now, root units. */
  readonly at: Vec;
  /**
   * How far it has wandered from where it landed, GLASS PIXELS — the number a consumer tests to
   * say "that finger is holding, not dragging". Under `ANCHOR_SLOP` it is an anchor.
   */
  readonly drift: number;
}

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
  /** The other finger, when one was down — see `SwipeAnchor`. */
  readonly anchor: SwipeAnchor | undefined;
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
 * OVER HOW LONG THE PARTING SPEED IS MEASURED, milliseconds.
 *
 * Not over the whole gesture: a finger that wandered for a second and then flicked has an average
 * speed of nearly nothing, and it is the flick the hand meant. Not over the last event either — two
 * samples a millisecond apart divide by almost zero and report a speed no hand ever reached. This
 * is the window every platform's own fling detector uses, for both of those reasons.
 */
const PARTING_MS = 90;

/** One reading of a finger: where it was, in units, and when. */
interface Sample {
  readonly at: Vec;
  readonly ms: number;
}

/** A finger in flight, with enough of its recent past to say how it was moving when it left. */
interface Finger {
  readonly on: Node | undefined;
  readonly downGlass: Point;
  readonly downAt: Vec;
  glass: Point;
  /** The tail of its path, trimmed to `PARTING_MS` — the only part a parting speed may read. */
  recent: Sample[];
  /** How far it has actually walked, root units — the denominator of `straight`. */
  walked: number;
  last: Vec;
}

const hyp = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Wire the swipe. Returns the teardown.
 *
 * Nothing is registered per node: the tree is asked who is under the finger at the moment there is
 * one, through the same `pickTop` the painter and every other wiring use.
 */
export function wireSwipe(w: SwipeWiring): () => void {
  const view = w.host.view;
  const minSpeed = w.minSpeed ?? SWIPE_SPEED;
  const minReach = w.minReach ?? SWIPE_REACH;
  const minStraight = w.minStraight ?? SWIPE_STRAIGHT;

  /** Every finger currently down, in the order they arrived — the order is what names an anchor. */
  const down = new Map<number, Finger>();

  const unitsOf = (g: Point): Vec => toUnits(w.host, g, w.view?.());

  const onDown = (e: PointerEvent): void => {
    const g = glassOf(view, e);
    const at = unitsOf(g);
    down.set(e.pointerId, {
      // The pick is UNGATED: a finger that came down on bare desk is still an anchor, and a
      // consumer asking "was the other hand on the pack" needs to be told it was not.
      on: pickTop(w.host, g, () => true, w.view?.(), w.poses?.()),
      downGlass: g,
      downAt: at,
      glass: g,
      recent: [{ at, ms: e.timeStamp }],
      walked: 0,
      last: at,
    });
  };

  const onMove = (e: PointerEvent): void => {
    const f = down.get(e.pointerId);
    if (!f) return;
    const g = glassOf(view, e);
    const at = unitsOf(g);
    f.glass = g;
    f.walked += hyp(f.last, at);
    f.last = at;
    f.recent.push({ at, ms: e.timeStamp });
    // THE TAIL, AND ONLY THE TAIL. One sample older than the window is KEPT — it is the far end of
    // the window, and dropping it would leave a lone reading with no interval to divide by.
    while (f.recent.length > 2 && e.timeStamp - f.recent[1]!.ms > PARTING_MS) f.recent.shift();
  };

  /** The other finger that was already down when this one arrived — the earliest of the rest. */
  const anchorFor = (id: number): SwipeAnchor | undefined => {
    for (const [other, f] of down) {
      if (other === id) continue;
      return { on: f.on, at: f.last, drift: hyp(f.downGlass, f.glass) };
    }
    return undefined;
  };

  const onUp = (e: PointerEvent): void => {
    const f = down.get(e.pointerId);
    if (!f) return;
    // The anchor is read BEFORE this finger is forgotten, and this finger is forgotten before the
    // consumer is called: a handler that grabs, throws or re-renders must not find a gesture that
    // has already ended still standing in the map.
    const anchor = anchorFor(e.pointerId);
    down.delete(e.pointerId);
    if (!f.on || !w.want(f.on)) return;

    const to = unitsOf(glassOf(view, e));
    const reach = hyp(f.downAt, to);
    if (reach < minReach) return;
    // The LAST leg counts too: a release carries a position of its own, and leaving it out of the
    // path walked would let a straightness come out above 1 — which is a ratio saying the finger
    // took a shortcut through ground it covered.
    const walked = f.walked + hyp(f.last, to);
    const straight = walked > 0 ? reach / walked : 1;
    if (straight < minStraight) return;

    const first = f.recent[0]!;
    const span = e.timeStamp - first.ms;
    // A gesture with no measurable span left is one whose events all arrived in the same
    // millisecond — the parting speed is unknowable, not infinite, so it is not a swipe.
    if (span <= 0) return;
    const speed = hyp(first.at, to) / (span / 1000);
    if (speed < minSpeed) return;

    w.onSwipe({
      on: f.on,
      from: f.downAt,
      to,
      angle: (Math.atan2(to.y - f.downAt.y, to.x - f.downAt.x) * 180) / Math.PI,
      speed,
      reach,
      straight,
      anchor,
    });
  };

  const onCancel = (e: PointerEvent): void => {
    down.delete(e.pointerId);
  };

  view.addEventListener("pointerdown", onDown);
  view.addEventListener("pointermove", onMove);
  view.addEventListener("pointerup", onUp);
  view.addEventListener("pointercancel", onCancel);

  return () => {
    down.clear();
    view.removeEventListener("pointerdown", onDown);
    view.removeEventListener("pointermove", onMove);
    view.removeEventListener("pointerup", onUp);
    view.removeEventListener("pointercancel", onCancel);
  };
}
