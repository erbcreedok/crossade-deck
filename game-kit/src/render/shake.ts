// THE SHAKE — how a hand was WORKING a piece, not where it took it.
//
// A die is not thrown by aiming it. It is rattled in the fist and let go, and how hard it lands is
// how hard it was rattled — a fact about a stretch of time, not about the instant the hand opened.
// The carry's own `velocity()` is that instant, and it is the wrong number here: a hand that shook
// a die for a second and stopped dead before opening has a parting speed of zero and every right
// to expect a hard throw.
//
// SO THIS IS NOT AN EVENT, IT IS A READING. There is no `onShake`, and that is the design rather
// than an omission: a shake has no moment at which it happens, so a callback would have to invent
// one, and every consumer would then be racing that invention against its own `pointerup`. What is
// offered instead is a number a consumer can ask for whenever it likes — during the gesture (to
// show the piece rattling harder) and after it (to throw). The reading survives the finger leaving
// and is cleared by the NEXT one landing, so a release handler reads a finished shake no matter
// which listener the browser ran first.
//
// Event-driven, no timer (`guard.one-clock`): every number here is made of events that happened.

import { type Node } from "../core/node.js";
import { type Point } from "../core/atoms/bounded.js";
import { type Transform, type Vec } from "../core/transform.js";
import { type Host } from "./host.js";
import { glassOf, pickTop, toUnits } from "./pointer.js";

/**
 * How far the finger has to go one way before going back counts as a TURN, root units.
 *
 * A hand holding still still trembles, and every tremble crosses zero. Without a floor a resting
 * thumb rattles a die harder than a wrist ever could. A fifth of a piece is the smallest travel
 * that is unmistakably deliberate.
 */
export const SHAKE_LEG = 0.2;

export interface Shake {
  /**
   * HOW MANY TIMES THE HAND TURNED BACK ON ITSELF. This is what separates a shake from a swipe more
   * than any speed does: a swipe goes one way, a shake goes both, and a piece carried across the
   * desk in a hurry has a high speed and no turns at all.
   */
  readonly turns: number;
  /** The whole path the finger walked, root units — the work the hand did. */
  readonly walked: number;
  /** The widest the shake ever got, root units: the amplitude, corner to corner. */
  readonly span: number;
  /**
   * WHICH WAY THE SHAKING RAN, degrees clockwise from +x — an AXIS and not a direction, so it is
   * reported in `0..180`: a hand rattling left-right and one rattling right-left are the same shake.
   * A game that throws along it reads this; a game that throws where the player was pointing has
   * `Swipe.angle` instead, and the two are different questions.
   */
  readonly axis: number;
  /** How vigorously: the path walked per second of shaking, root units/s. */
  readonly speed: number;
  /** How long the hand was on the piece, ms. */
  readonly ms: number;
  /** What it was shaking. */
  readonly on: Node;
  /** Where the finger is (or last was), root units. */
  readonly at: Vec;
}

export interface ShakeWiring {
  readonly host: Host;
  /** What may be shaken. No default, for the reason a hold has none. */
  readonly want: (n: Node) => boolean;
  /** The view the desk is drawn through, asked FRESH — a camera's `transform()`. */
  readonly view?: (() => Transform) | undefined;
  /** Where the moving pieces are drawn (`Motions.poses()`), so the finger tests what the eye sees. */
  readonly poses?: (() => ReadonlyMap<string, Transform> | undefined) | undefined;
  /** How far a leg must run before its reversal is a turn, root units. Absent, `SHAKE_LEG`. */
  readonly leg?: number | undefined;
}

/** The measurement, live. `stop` unwires it; `reading` is the whole of what it offers. */
export interface Shaking {
  /**
   * How the piece is being — or was just — shaken. `undefined` before any qualifying finger has
   * landed. It stays readable after the finger leaves and is replaced by the NEXT one, which is
   * what makes it safe to read from a release handler.
   */
  reading(): Shake | undefined;
  stop(): void;
}

/** A finger's run in one direction: where the leg began, and which way it is going. */
interface Leg {
  from: Vec;
  /** The unit vector of the leg, set once it has run far enough to have a direction. */
  dir: Vec | undefined;
}

interface Live {
  readonly on: Node;
  readonly startMs: number;
  at: Vec;
  walked: number;
  turns: number;
  ms: number;
  /** The box the shake has covered, so its span and its axis can be read off one pair of numbers. */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  leg: Leg;
}

const hyp = (a: Point, b: Point): number => Math.hypot(b.x - a.x, b.y - a.y);

const summarise = (l: Live): Shake => {
  const w = l.x1 - l.x0;
  const h = l.y1 - l.y0;
  return {
    turns: l.turns,
    walked: l.walked,
    span: Math.hypot(w, h),
    // The box's own diagonal, folded into `0..180` — an axis has no far end.
    axis: ((Math.atan2(h, w) * 180) / Math.PI + 180) % 180,
    speed: l.ms > 0 ? l.walked / (l.ms / 1000) : 0,
    ms: l.ms,
    on: l.on,
    at: l.at,
  };
};

/** Wire the shake reading. Nothing is registered per node; the tree is asked at the moment of a finger. */
export function wireShake(w: ShakeWiring): Shaking {
  const view = w.host.view;
  const legMin = w.leg ?? SHAKE_LEG;
  let live: Live | undefined;
  /** The finger being measured — every other one is somebody else's gesture. */
  let owner: number | undefined;

  const unitsOf = (g: Point): Vec => toUnits(w.host, g, w.view?.());

  const onDown = (e: PointerEvent): void => {
    if (owner !== undefined) return; // a second finger is a different gesture, not more of this one
    const g = glassOf(view, e);
    const on = pickTop(w.host, g, w.want, w.view?.(), w.poses?.());
    if (!on) return;
    const at = unitsOf(g);
    owner = e.pointerId;
    // THE PREVIOUS READING DIES HERE and nowhere else — that is what lets a release handler read a
    // shake that has already ended.
    live = {
      on,
      startMs: e.timeStamp,
      at,
      walked: 0,
      turns: 0,
      ms: 0,
      x0: at.x,
      x1: at.x,
      y0: at.y,
      y1: at.y,
      leg: { from: at, dir: undefined },
    };
  };

  const onMove = (e: PointerEvent): void => {
    if (e.pointerId !== owner || !live) return;
    const at = unitsOf(glassOf(view, e));
    live.walked += hyp(live.at, at);
    live.at = at;
    live.ms = e.timeStamp - live.startMs;
    live.x0 = Math.min(live.x0, at.x);
    live.x1 = Math.max(live.x1, at.x);
    live.y0 = Math.min(live.y0, at.y);
    live.y1 = Math.max(live.y1, at.y);

    const run = hyp(live.leg.from, at);
    if (run < legMin) return;
    const dir = { x: (at.x - live.leg.from.x) / run, y: (at.y - live.leg.from.y) / run };
    const was = live.leg.dir;
    // A TURN IS A REVERSAL, and reversal is a word about direction: the dot product of the leg that
    // was and the leg that is. Negative means the hand came back — anything from a right angle
    // onward, which is what a rattle in the fist actually looks like on the glass.
    if (was && was.x * dir.x + was.y * dir.y < 0) live.turns += 1;
    live.leg = { from: at, dir };
  };

  const onUp = (e: PointerEvent): void => {
    if (e.pointerId !== owner) return;
    if (live) live.ms = e.timeStamp - live.startMs;
    owner = undefined; // the reading itself is left standing, deliberately
  };

  view.addEventListener("pointerdown", onDown);
  view.addEventListener("pointermove", onMove);
  view.addEventListener("pointerup", onUp);
  view.addEventListener("pointercancel", onUp);

  return {
    reading: () => (live ? summarise(live) : undefined),
    stop() {
      live = undefined;
      owner = undefined;
      view.removeEventListener("pointerdown", onDown);
      view.removeEventListener("pointermove", onMove);
      view.removeEventListener("pointerup", onUp);
      view.removeEventListener("pointercancel", onUp);
    },
  };
}
