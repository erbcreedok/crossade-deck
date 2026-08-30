// THE PAN — a finger that is MOVING, reported while it moves.
//
// This is `UIPanGestureRecognizer`, deliberately down to the names: `possible → began → changed →
// ended | cancelled`, with a `translation` and a `velocity` handed over at every step. The native
// app is Swift on this same model and has to animate one to one with the web, so the kit does not
// invent a gesture vocabulary — it borrows the platform's, and the Swift side becomes a
// transcription instead of a second development.
//
// WHY IT EXISTS BESIDE THE SWIPE, which is the same fingers on the same glass. UIKit ships both and
// for the same reason the kit now does:
//   • `wireSwipe` is a VERDICT delivered once, when the hand let go — "that was a flick, this way,
//     this hard". A page that only has to know which way a card was sent wants exactly that.
//   • a PAN is a RUNNING REPORT. It is the only shape in which "the card is already off the pack
//     the moment the second finger starts moving, and it goes the way that finger goes, at the
//     speed that finger goes" can be written at all. A verdict on release cannot say it: by the
//     time the verdict exists the gesture is over, and everything the player saw was nothing.
//
// TWO FINGERS WITH DIFFERENT ROLES are the ordinary table gesture — one hand rests on the pack, the
// other deals off it — and telling them apart is not a pile of `if`s here. UIKit has one word for
// it, `shouldRecognizeSimultaneouslyWith`, and so does this file: `together`. The recogniser still
// decides nothing about MEANING; it decides only whether it is allowed to run at all beside the
// other hand, which is the one arbitration question a recogniser is entitled to.
//
// THE SPEED IS READ OFF EVERY SAMPLE THE GLASS HAS, through `getCoalescedEvents()`. On a 120 Hz
// screen touches arrive at 120 Hz while `pointermove` fires at about 60, so half the readings a
// flick is measured from are thrown away without it — and it is the END of a flick, the fastest
// part, that loses the most. UIKit's `velocity(in:)` has always counted all of them.
//
// EVENT-DRIVEN THROUGHOUT, with no timer of any kind (`guard.one-clock`).

import { type Node, type NodeId } from "../core/node.js";
import { type Point } from "../core/atoms/bounded.js";
import { type Transform, type Vec } from "../core/transform.js";
import { type Host } from "./host.js";
import { journalOn, note, trace } from "./journal.js";
import { glassOf, pickTop, toUnits } from "./pointer.js";

/**
 * HOW FAR THE FINGER MUST TRAVEL BEFORE THE PAN BEGINS, GLASS PIXELS.
 *
 * Pixels and not units, and that is the same rule a tap's slop follows: this is a fact about the
 * HAND — a thumb resting on glass wanders by a few pixels whatever the camera is doing — while a
 * throw's strength is a fact about the desk and is measured in units. Ten is UIKit's own figure for
 * a pan, and it is what keeps a tap from being reported as the shortest drag in history.
 */
export const PAN_SLOP = 10;

/**
 * OVER HOW LONG THE VELOCITY IS MEASURED, milliseconds.
 *
 * Not the whole gesture: a finger that wandered for a second and then flicked averages nearly
 * nothing, and it is the flick the hand meant. Not the last event either: two samples a millisecond
 * apart divide by almost zero and report a speed no hand ever reached. This is the window every
 * platform's own fling detector uses, for both of those reasons.
 */
export const PAN_WINDOW = 90;

/**
 * HOW FAR THE FINGER HAS TO MOVE BETWEEN TWO READINGS before the direction between them is worth
 * believing, root units.
 *
 * A twist is read off how the heading turns from step to step, and two readings a hair apart have
 * no heading worth having: a thumb's own jitter across a tenth of a pixel is a direction pointing
 * anywhere, and summed over a window it reads as a violent twist of the wrist. Steps shorter than
 * this are passed over rather than believed.
 */
export const CURL_STEP = 0.01;

/**
 * THE OTHER HAND — the finger that was already down when this one arrived, and what it is on.
 *
 * It lives with the recogniser rather than with any one gesture because it is what makes ROLES
 * expressible at all: on a table, one hand resting on a pack while the other deals off it is the
 * ordinary gesture, and the two are told apart by nothing but which arrived first.
 */
export interface HandAnchor {
  /** What it came down on, if it came down on anything. */
  readonly on: Node | undefined;
  /**
   * WAS THAT HAND ALREADY DOWN when this one arrived?
   *
   * The whole of "one finger holds, the other deals" is this one boolean, and without it a page has
   * to guess. Both fingers of a two-hand gesture see each other as the other hand, so both pass any
   * test written on the anchor alone — and then a resting thumb that shifts by ten pixels steals the
   * gesture from the hand that meant to make it, because it happened to move first.
   */
  readonly earlier: boolean;
  /** Where it is now, root units. */
  readonly at: Vec;
  /**
   * How far it has wandered from where it landed, GLASS PIXELS.
   *
   * A FACT, AND NOT A VERDICT. It says what that hand did; whether that matters is the game's, and
   * it usually does not: a hand holding a pack while the other deals off it may be dragging the
   * pack at the same time, and there is no contradiction in that. This file shipped a suggested
   * threshold for a while and it was a mistake — a gate against a conflict that does not exist,
   * refusing gestures people really made. A game with a genuine rival to separate writes the
   * number that separates them; there is no general one to ship.
   */
  readonly drift: number;
}

/** `UIGestureRecognizer.State`, minus the states a pan cannot be in. */
export type PanState = "began" | "changed" | "ended" | "cancelled";

/** One report of a moving finger — `UIPanGestureRecognizer` read at this instant. */
export interface Pan {
  readonly state: PanState;
  /**
   * WHICH FINGER THIS IS — the pointer's own id, stable from `began` to `ended`.
   *
   * UIKit has no field like it because it has no need: a recogniser there is attached to a view and
   * owns one gesture at a time. This one wiring reports EVERY finger on the glass, which is what
   * makes two hands with different roles expressible at all — and the price of that is having to
   * say which hand each report is about. A page that starts something on `began` must be able to
   * tell the finger that started it from the next one to arrive, or a third finger's release ends
   * the second finger's work.
   */
  readonly id: number;
  /** What the finger came down on. */
  readonly on: Node;
  /** Where it came down, root units. */
  readonly from: Vec;
  /** Where it is now, root units. */
  readonly at: Vec;
  /** How far it has come, root units — `translation(in:)`. */
  readonly translation: Vec;
  /**
   * How fast it is going RIGHT NOW, root units per second — `velocity(in:)`. Not the average over
   * the gesture and not the last pair of events: see `PAN_WINDOW`.
   */
  readonly velocity: Vec;
  /**
   * Which way it is going, DEGREES CLOCKWISE FROM +X — the same convention `slide`, `snap` and
   * `launch` take, so a finger's heading is a throw's `angle` with nothing translating between.
   * `undefined` when the finger is not moving: a standing finger points nowhere, and a zero that
   * means "east" would deal a card east every time a hand paused.
   */
  readonly heading: number | undefined;
  /**
   * HOW FAR THE FINGER HAS ACTUALLY WALKED, root units — the whole path, not the straight line.
   *
   * The one field here UIKit has no word for, and it is here because the kit has a gesture UIKit
   * has never had to tell apart: a knead. Fingers that rub back and forth cover a lot of ground and
   * end up nowhere, so a translation and a velocity both say "a flick" about them. `translation`
   * over `walked` is how straight the finger went, and that is the only number that refuses them.
   */
  readonly walked: number;
  /**
   * HOW FAST THE FINGER IS TURNING, degrees per second — the twist of the wrist, and it is signed.
   *
   * A heading says where the hand is going; this says how that heading is CHANGING, which is a
   * different fact and the one a curved flick is made of. A card thrown off a twisting hand spins
   * about its own axis and arcs through the air, and both come from here — the kit does not have to
   * guess a spin from a straight line, because the hand really did draw a curve and it is measured.
   *
   * Read over the same window the velocity is, so a hand that circled and then straightened out
   * reports the straightening. `0` for a finger going in a straight line, and for one not moving.
   */
  readonly curl: number;
  /** The other finger, when one was down — see `HandAnchor`. */
  readonly anchor: HandAnchor | undefined;
}

export interface PanWiring {
  readonly host: Host;
  /** What a pan may start on. No default, for the same reason a hold has none. */
  readonly want: (n: Node) => boolean;
  /** Called on `began`, on every `changed`, and once on `ended` or `cancelled`. */
  readonly onPan: (pan: Pan) => void;
  /**
   * `shouldRecognizeSimultaneouslyWith` — may this pan run at all while that other finger is down?
   * Absent, yes: two hands doing two things is the ordinary table gesture, and the burden is on a
   * page that has a genuine rival to say so.
   */
  readonly together?: ((anchor: HandAnchor) => boolean) | undefined;
  /** How far the finger must travel before the pan begins, GLASS PIXELS. Absent, `PAN_SLOP`. */
  readonly slop?: number | undefined;
  /** The view the desk is drawn through, asked FRESH — a camera's `transform()`. */
  readonly view?: (() => Transform) | undefined;
  /** Where the moving pieces are drawn (`Motions.poses()`), so the finger tests what the eye sees. */
  readonly poses?: (() => ReadonlyMap<NodeId, Transform> | undefined) | undefined;
}

/** One reading of a finger: where it was, in units, and when. */
interface Sample {
  readonly at: Vec;
  readonly ms: number;
}

interface Finger {
  readonly on: Node | undefined;
  readonly downGlass: Point;
  readonly downAt: Vec;
  glass: Point;
  at: Vec;
  /** The whole path walked, root units — the denominator of "how straight was it". */
  walked: number;
  /** The tail of its path, trimmed to `PAN_WINDOW` — the only part a velocity may read. */
  recent: Sample[];
  /**
   * When the last event for this finger arrived — the near end of the interval the next event's
   * coalesced readings are laid across. The events' own clock, which is the only one here anybody
   * can check: see the stamping in `onMove`.
   */
  lastMs: number;
  /** Has it passed the slop and been reported as `began`? */
  running: boolean;
}

const hyp = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

/**
 * Every reading the glass actually took for this event — `getCoalescedEvents()`.
 *
 * A browser that does not have it (and jsdom is one) is handed the event itself, which is what the
 * platform would have coalesced INTO. The fallback is exact rather than approximate: one reading is
 * what a 60 Hz screen has anyway.
 */
const readingsOf = (e: PointerEvent): readonly PointerEvent[] => {
  const all = e.getCoalescedEvents?.();
  return all && all.length > 0 ? all : [e];
};

export function wirePan(w: PanWiring): () => void {
  const view = w.host.view;
  const slop = w.slop ?? PAN_SLOP;
  const down = new Map<number, Finger>();
  const unitsOf = (g: Point): Vec => toUnits(w.host, g, w.view?.());

  /** The other finger that was already down — the earliest of the rest, as the swipe names it too. */
  const anchorFor = (id: number): HandAnchor | undefined => {
    // The map is in the order the fingers arrived, so "earlier" is simply "seen before this one".
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

  /**
   * The velocity over the window, in units per second.
   *
   * The far end is the OLDEST reading still inside the window — not the oldest reading there is. A
   * finger that crawled for a second and then flicked keeps a reading a second old in the buffer,
   * and measuring from it would report the crawl: the hand meant the flick, and the flick is the
   * part inside the window. Where the window holds a single reading (the events all arrived in one
   * millisecond) the one before it is used, because the only alternative is dividing by zero — and
   * a speed that cannot be measured is not an infinite one.
   */
  const velocityOf = (f: Finger, now: number): Vec => {
    const cut = now - PAN_WINDOW;
    let i = 0;
    while (i < f.recent.length && f.recent[i]!.ms < cut) i++;
    // Fewer than two readings inside the window is not a measurement — a burst of events in one
    // millisecond, or a hand that had been resting and has only just moved. Then the OLDEST reading
    // there is stands in for the window's far end: the buffer is trimmed to the window plus one, so
    // it is at most a window old, and it is a different POINT.
    //
    // It used to be the last two, and that is how a real trace of fifteen swipes came back reading
    // zero on every step. A coalesced burst very often ends with the same point twice — the reading
    // the platform coalesced INTO is the reading it coalesced — so the last pair had no distance in
    // it at all, and a flick a player really made was answered by a card set down on the spot.
    if (f.recent.length - i < 2) i = 0;
    const first = f.recent[i]!;
    const span = now - first.ms;
    if (!(span > 0)) return { x: 0, y: 0 };
    return { x: ((f.at.x - first.at.x) * 1000) / span, y: ((f.at.y - first.at.y) * 1000) / span };
  };

  /**
   * HOW FAST THE HEADING IS TURNING over the window, degrees per second and signed.
   *
   * Taken from the readings themselves rather than from a pair of velocities: the heading between
   * consecutive readings is the direction the hand was actually going at that instant, and the sum
   * of how much that direction turned, over the time it took, is the twist. Folded into ±180 a step
   * at a time, or a hand crossing due west would report half a turn it never made.
   *
   * Readings a hair apart carry no direction worth having — a thumb's jitter would read as a
   * violent twist — so a step shorter than `CURL_STEP` is passed over rather than believed.
   */
  const curlOf = (f: Finger, now: number): number => {
    const cut = now - PAN_WINDOW;
    const seen = f.recent.filter((r) => r.ms >= cut);
    if (seen.length < 3) return 0;
    let turned = 0;
    let last: number | undefined;
    for (let i = 1; i < seen.length; i++) {
      const dx = seen[i]!.at.x - seen[i - 1]!.at.x;
      const dy = seen[i]!.at.y - seen[i - 1]!.at.y;
      if (Math.hypot(dx, dy) < CURL_STEP) continue;
      const heading = (Math.atan2(dy, dx) * 180) / Math.PI;
      if (last !== undefined) turned += ((heading - last + 540) % 360) - 180;
      last = heading;
    }
    const span = (seen[seen.length - 1]!.ms - seen[0]!.ms) / 1000;
    return span > 0 ? turned / span : 0;
  };

  const report = (f: Finger, id: number, anchor: HandAnchor | undefined, state: PanState, now: number): void => {
    if (!f.on) return;
    const velocity = velocityOf(f, now);
    const moving = Math.hypot(velocity.x, velocity.y) > 0;
    const curl = curlOf(f, now);
    // INTO THE DASHCAM, beside the frames it caused (`journal.ts`). What a finger reported is half
    // of every gesture bug — the other half being what the page then did with it — and neither can
    // be recovered afterwards from a screenshot or from a person's memory of it.
    if (journalOn()) {
      note("pan", {
        state,
        id,
        on: f.on?.id,
        pos: [trace(f.at.x), trace(f.at.y)],
        by: [trace(f.at.x - f.downAt.x), trace(f.at.y - f.downAt.y)],
        v: [trace(velocity.x), trace(velocity.y)],
        curl: trace(curl),
        ...(anchor ? { anchor: { on: anchor.on?.id, drift: trace(anchor.drift), earlier: anchor.earlier } } : {}),
      });
    }
    w.onPan({
      state,
      id,
      on: f.on,
      from: f.downAt,
      at: f.at,
      translation: { x: f.at.x - f.downAt.x, y: f.at.y - f.downAt.y },
      walked: f.walked,
      velocity,
      heading: moving ? (Math.atan2(velocity.y, velocity.x) * 180) / Math.PI : undefined,
      curl,
      anchor,
    });
  };

  const onDown = (e: PointerEvent): void => {
    const g = glassOf(view, e);
    const at = unitsOf(g);
    down.set(e.pointerId, {
      // UNGATED, as the swipe's is: a finger on bare desk is still an anchor, and a page asking
      // "was the other hand on the pack" has to be told when it was not.
      on: pickTop(w.host, g, () => true, w.view?.(), w.poses?.()),
      downGlass: g,
      downAt: at,
      glass: g,
      at,
      walked: 0,
      recent: [{ at, ms: e.timeStamp }],
      lastMs: e.timeStamp,
      running: false,
    });
  };

  const onMove = (e: PointerEvent): void => {
    const f = down.get(e.pointerId);
    if (!f) return;
    // EVERY reading the glass took, not just the one the frame delivered — see the file header.
    const readings = readingsOf(e);
    const from = f.lastMs;
    const step = e.timeStamp - from;
    for (const [j, r] of readings.entries()) {
      const g = glassOf(view, r);
      const at = unitsOf(g);
      f.glass = g;
      f.walked += hyp(f.at, at);
      f.at = at;
      // STAMPED FROM THE EVENTS' OWN CLOCK, not from the reading's.
      //
      // A coalesced reading's `timeStamp` comes from the platform, and on real hardware it has been
      // seen outside the epoch the event itself is timed in. A time from a clock this file does not
      // own cannot be divided by: every reading then looks older than the window, and the velocity
      // falls through to a fallback that measures the distance between two copies of one point.
      // That was fifteen swipes reporting zero.
      //
      // Nothing is lost by it. The POSITIONS are the whole reason to ask for coalesced readings —
      // the path between frames, which is what `walked` and the twist are made of — and WHEN they
      // happened is recoverable without the platform's help: the glass took them between the last
      // event and this one, evenly enough, so they are laid across that interval. A finger that
      // stood still and then moved still reads as one that stood still and then moved.
      f.recent.push({ at, ms: from + (step * (j + 1)) / readings.length });
    }
    f.lastMs = e.timeStamp;
    // The tail, and only the tail. ONE reading older than the window is kept: a burst of events
    // that all land in the same millisecond would otherwise leave nothing to divide by.
    while (f.recent.length > 2 && f.recent[1]!.ms < e.timeStamp - PAN_WINDOW) f.recent.shift();
    if (!f.on || !w.want(f.on)) return;
    if (!f.running) {
      if (hyp(f.downGlass, f.glass) < slop) return;
      // The simultaneity question is asked ONCE, at the moment the pan would begin — a hand that
      // was allowed to start is not taken off the piece halfway because the other finger moved.
      const anchor = anchorFor(e.pointerId);
      if (anchor && w.together && !w.together(anchor)) return;
      f.running = true;
      // THE FINGER IS OURS FROM HERE — `setPointerCapture`, and it is not a nicety.
      //
      // Without it, a hand that leaves the canvas and lifts THERE never sends its `pointerup` here:
      // the gesture stays open forever, whatever it was carrying stays carried, and every gesture
      // after it is refused because the last one never ended. It reads as "it hangs sometimes", and
      // the only reliable way to make it happen is to do what people do — deal off the edge.
      try {
        view.setPointerCapture(e.pointerId);
      } catch {
        /* a pointer the browser no longer considers active; the pan carries on without capture */
      }
      report(f, e.pointerId, anchor, "began", e.timeStamp);
      return;
    }
    report(f, e.pointerId, anchorFor(e.pointerId), "changed", e.timeStamp);
  };

  const finish = (e: PointerEvent, state: PanState): void => {
    const f = down.get(e.pointerId);
    if (!f) return;
    // A finger that never passed the slop was never a pan: it leaves without a word, exactly as a
    // `possible` recogniser that failed does.
    if (!f.running) {
      down.delete(e.pointerId);
      return;
    }
    // A release carries a position of its own and the last leg counts. A CANCEL does not: the
    // gesture was taken away, and where the system happened to put the pointer as it took it is
    // not somewhere the hand went.
    if (state === "ended") {
      const at = unitsOf(glassOf(view, e));
      f.walked += hyp(f.at, at);
      f.at = at;
    }
    // The anchor is read while the map still holds the other finger, and this finger is forgotten
    // BEFORE the consumer is called: a handler that grabs, throws or re-renders must not find a
    // gesture that has already ended still standing in the map.
    const anchor = anchorFor(e.pointerId);
    down.delete(e.pointerId);
    try {
      view.releasePointerCapture(e.pointerId);
    } catch {
      /* it was never captured, or the browser has already let it go */
    }
    report(f, e.pointerId, anchor, state, e.timeStamp);
  };

  const onUp = (e: PointerEvent): void => finish(e, "ended");
  const onCancel = (e: PointerEvent): void => finish(e, "cancelled");

  view.addEventListener("pointerdown", onDown);
  view.addEventListener("pointermove", onMove);
  view.addEventListener("pointerup", onUp);
  view.addEventListener("pointercancel", onCancel);

  return () => {
    // Anything still captured is let go with the wiring: a page swapped mid-gesture must not leave
    // the view holding a finger nobody is listening to.
    for (const id of down.keys()) {
      try {
        view.releasePointerCapture(id);
      } catch {
        /* already gone */
      }
    }
    down.clear();
    view.removeEventListener("pointerdown", onDown);
    view.removeEventListener("pointermove", onMove);
    view.removeEventListener("pointerup", onUp);
    view.removeEventListener("pointercancel", onCancel);
  };
}
