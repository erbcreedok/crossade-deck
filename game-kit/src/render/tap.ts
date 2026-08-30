// THE TAP — a finger that lands, does not travel, and leaves.
//
// This is `UITapGestureRecognizer`, down to the one field that makes it more than a click:
// `numberOfTapsRequired`. A table needs both — put this card back on the pack, and put it back
// somewhere in the middle of it — and they are the same finger doing the same thing a different
// number of times. Anything else (a mode, a modifier, a second control) is a way of not having a
// double tap.
//
// A SINGLE TAP IS DELIVERED LATE, and it has to be. `require(toFail:)` is UIKit's word for it: a
// page that answers a single tap immediately has already answered by the time the second one lands,
// and the two actions both happen. So the first tap waits out the double's window and then goes.
// The cost is that window, and the window is the platform's own — a person who has ever
// double-tapped anything is expecting exactly this pause.
//
// A page that does not care can say so (`double: false`), and then a tap is reported the moment
// the finger leaves. Most pages are that page, and they should not pay for a mechanic they do not
// have.
//
// WHAT THE TAP MEANS IS NOT DECIDED HERE, as with every other gesture in this folder: the kit
// reports "this finger touched this node, this many times, with that other finger down". Which of
// those is a deal, a merge or nothing at all is the consumer's, and only the consumer knows.

import { type Node } from "../core/node.js";
import { type Point } from "../core/atoms/bounded.js";
import { type Transform, type Vec } from "../core/transform.js";
import { type Host } from "./host.js";
import { journalOn, note, trace } from "./journal.js";
import { type HandAnchor } from "./pan.js";
import { glassOf, pickTop, toUnits } from "./pointer.js";

/**
 * HOW FAR THE FINGER MAY WANDER AND STILL BE A TAP, GLASS PIXELS.
 *
 * The pan's own slop, and deliberately the same number: a gesture that has travelled far enough to
 * be a pan is not a tap, and two different thresholds would leave a band of movement that is
 * neither — a finger that did something and got no answer at all.
 */
export const TAP_SLOP = 10;

/**
 * HOW LONG A TAP MAY LAST, milliseconds. Longer than this the finger was RESTING, which is a hold
 * (`hold.ts`) and a different thing to mean. The platform's own figure for the boundary.
 */
export const TAP_MS = 300;

/**
 * HOW LONG A SECOND TAP HAS TO ARRIVE, milliseconds — and therefore how long a single tap waits
 * before it is delivered. The platform's own double-click interval; a person's thumb knows it.
 */
export const DOUBLE_MS = 300;

/** One tap, reported once the count is known. */
export interface Tap {
  /** What the finger came down on. */
  readonly node: Node;
  /** Where it came down, root units. */
  readonly at: Vec;
  /** How many times in a row, on the same node: `1`, `2`, and on up. `UITapGestureRecognizer`'s own count. */
  readonly taps: number;
  /** Which finger — the pointer's own id, as the pan reports it. */
  readonly id: number;
  /** The other finger, when one was down — the same `HandAnchor` the pan hands over. */
  readonly anchor: HandAnchor | undefined;
}

export interface TapWiring {
  readonly host: Host;
  /** What a tap may land on. No default, for the same reason a hold has none. */
  readonly want: (n: Node) => boolean;
  /** Called once per tap, with the count. */
  readonly onTap: (tap: Tap) => void;
  /**
   * Is a double tap a different thing on this page? Absent, NO — and then a tap is reported the
   * instant the finger leaves, which is what a page with one meaning wants.
   */
  readonly double?: boolean | undefined;
  /** How far the finger may wander, GLASS PIXELS. Absent, `TAP_SLOP`. */
  readonly slop?: number | undefined;
  /** The view the desk is drawn through, asked FRESH — a camera's `transform()`. */
  readonly view?: (() => Transform) | undefined;
  /** Where the moving pieces are drawn (`Motions.poses()`), so the finger tests what the eye sees. */
  readonly poses?: (() => ReadonlyMap<string, Transform> | undefined) | undefined;
}

interface Finger {
  readonly on: Node | undefined;
  readonly downGlass: Point;
  readonly downAt: Vec;
  readonly downMs: number;
  glass: Point;
  at: Vec;
}

/** A tap waiting to see whether a second one is coming. */
interface Pending {
  readonly node: string;
  readonly tap: Tap;
  taps: number;
  timer: ReturnType<typeof setTimeout>;
}

const hyp = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

export function wireTap(w: TapWiring): () => void {
  const view = w.host.view;
  const slop = w.slop ?? TAP_SLOP;
  const down = new Map<number, Finger>();
  const unitsOf = (g: Point): Vec => toUnits(w.host, g, w.view?.());
  let pending: Pending | undefined;

  /** The other finger that was already down — the same reading, and the same word, the pan uses. */
  const anchorFor = (id: number): HandAnchor | undefined => {
    let seenSelf = false;
    for (const [other, f] of down) {
      if (other === id) {
        seenSelf = true;
        continue;
      }
      return { on: f.on, at: f.at, drift: hyp(f.downGlass, f.glass), earlier: !seenSelf };
    }
    return undefined;
  };

  const deliver = (tap: Tap): void => {
    if (journalOn()) {
      note("tap", {
        on: tap.node.id,
        taps: tap.taps,
        id: tap.id,
        pos: [trace(tap.at.x), trace(tap.at.y)],
        ...(tap.anchor ? { anchor: { on: tap.anchor.on?.id, drift: trace(tap.anchor.drift), earlier: tap.anchor.earlier } } : {}),
      });
    }
    w.onTap(tap);
  };

  const settle = (): void => {
    if (!pending) return;
    const { tap, taps } = pending;
    clearTimeout(pending.timer);
    pending = undefined;
    deliver({ ...tap, taps });
  };

  const onDown = (e: PointerEvent): void => {
    const g = glassOf(view, e);
    const at = unitsOf(g);
    down.set(e.pointerId, {
      on: pickTop(w.host, g, () => true, w.view?.(), w.poses?.()),
      downGlass: g,
      downAt: at,
      downMs: e.timeStamp,
      glass: g,
      at,
    });
  };

  const onMove = (e: PointerEvent): void => {
    const f = down.get(e.pointerId);
    if (!f) return;
    f.glass = glassOf(view, e);
    f.at = unitsOf(f.glass);
  };

  const finish = (e: PointerEvent, kept: boolean): void => {
    const f = down.get(e.pointerId);
    if (!f) return;
    const anchor = anchorFor(e.pointerId);
    down.delete(e.pointerId);
    if (!kept || !f.on || !w.want(f.on)) return;
    // A finger that TRAVELLED was a drag, and one that STAYED was a hold. Neither is a tap, and
    // both have wirings of their own — this one says nothing rather than guessing.
    if (hyp(f.downGlass, glassOf(view, e)) > slop) return;
    if (e.timeStamp - f.downMs > TAP_MS) return;
    const tap: Tap = { node: f.on, at: f.downAt, taps: 1, id: e.pointerId, anchor };
    if (!w.double) {
      deliver(tap);
      return;
    }
    // A SECOND TAP ON THE SAME NODE joins the first rather than starting over — and one on a
    // different node lets the first go through, because it is a different thing being tapped.
    if (pending && pending.node === f.on.id) {
      const taps = pending.taps + 1;
      clearTimeout(pending.timer);
      pending = undefined;
      deliver({ ...tap, taps });
      return;
    }
    settle();
    const held: Pending = { node: f.on.id, tap, taps: 1, timer: setTimeout(() => settle(), DOUBLE_MS) };
    pending = held;
  };

  const onUp = (e: PointerEvent): void => finish(e, true);
  const onCancel = (e: PointerEvent): void => finish(e, false);

  view.addEventListener("pointerdown", onDown);
  view.addEventListener("pointermove", onMove);
  view.addEventListener("pointerup", onUp);
  view.addEventListener("pointercancel", onCancel);

  return () => {
    if (pending) clearTimeout(pending.timer);
    pending = undefined;
    down.clear();
    view.removeEventListener("pointerdown", onDown);
    view.removeEventListener("pointermove", onMove);
    view.removeEventListener("pointerup", onUp);
    view.removeEventListener("pointercancel", onCancel);
  };
}
