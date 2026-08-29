// THE NUMBERS THE MACHINERY RUNS ON, and the tumble's arithmetic.
//
// Apart from the runtime for the same reason the option types are: these are answers to "how close
// is close enough" and "how far is a face", each one argued for in its own comment, and they are
// read far more often than the loop that uses them.

import { type Body } from "../../core/ballistic.js";
import { type GlideLaw } from "../../core/glide.js";
import { type Transform } from "../../core/transform.js";

export const EPSILON = 1e-6;
/** A frame's dt is clamped here (seconds) for the INTEGRATORS: a resumed background tab must not fling the springs. */
export const MAX_DT = 0.05;
/** "Close enough" for a carry to stop the loop — root units for a position, a fraction for the scale. */
export const CARRY_EPS = 1e-3;
/**
 * The same, for the lean — DEGREES, and its own number because the channel's units are its own: a
 * twentieth of a degree moves a card's corner by a fraction of a pixel, while the position's `1e-3`
 * would hold the loop awake for a second after the hand has stopped, for nothing anyone can see.
 */
export const BANK_EPS = 0.05;
/** "Stopped" for a slide — units/s and degrees/s. */
export const SLIDE_EPS = 0.02;
export const SPIN_EPS = 2;
/** How far past the glass edge a launched body is "gone", root units. */
export const OFF_GLASS = 1;
/**
 * HOW OFTEN A TUMBLING PIECE SHOWS SOMETHING NEW — a turn of this many degrees, or a slide of
 * `UNITS_PER_FACE` root units.
 *
 * A die does not pick its face at the end: it shows a new one every time it goes over an edge, so
 * the cadence is the piece's OWN motion and needs no clock of its own — it thins out exactly as the
 * piece slows, because the piece is what is counted. Nothing here knows what a face IS: the runtime
 * says WHEN, the game says what to show.
 */
export const TURN_PER_FACE = 60;
export const UNITS_PER_FACE = 0.5;
/**
 * How much of that last step is still to come AFTER the result is shown, as a fraction of one.
 *
 * The result has to land on a piece that is still moving. A picture that changes on a piece
 * standing still is the one thing the eye reads as a SWAP — the same defect a shuffle has when its
 * packets hover over each other at the commit.
 */
export const TUMBLE_TAIL = 0.5;
/** Height into apparent size — the lamp's own number, read from where both sides can see it. */
export { RISE } from "../scenePlan/depth.js";

/** A tumble's turn against its progress: most of it early, and a long slow end. */
export const tumbleEase = (t: number): number => 1 - (1 - t) ** 3;
/**
 * The inverse — at what progress the piece has turned this FRACTION of the whole. It is what places
 * the beats, and it must stay the inverse of `tumbleEase`, or the faces would be counted off a
 * curve the piece is not turning on.
 */
export const tumbleAt = (turned: number): number => 1 - Math.cbrt(1 - turned);

/**
 * How many faces' worth of motion a sliding body still has in it. The glide law answers "how far
 * from here" directly (`project`), for the run and for the turn alike — this is the same question
 * the throw asks before it is made, asked again mid-flight. Walls only ever eat more of it, so this
 * over-estimates, and it errs the safe way: the result is shown a touch early rather than on a body
 * that has already stopped.
 */
export const facesLeft =
  (cfg: { readonly glide: GlideLaw; readonly spinGlide: GlideLaw }) =>
  (b: Body): number => {
    const path = cfg.glide.project(Math.hypot(b.vel.x, b.vel.y));
    const turn = cfg.spinGlide.project(Math.abs(b.spin));
    return path / UNITS_PER_FACE + turn / TURN_PER_FACE;
  };

/** One step's worth of tumbling: what the body just travelled, counted in faces and paid out in cues. */
export const tumbleStep = (t: Tumbling, was: Body, now: Body): void => {
  if (t.ended) return;
  // The last face is the RESULT's. It is shown as soon as the body no longer has a whole face's
  // worth of motion left to give — while it is still moving, which is the whole point of the cue.
  if (t.left(now) < 1) {
    t.ended = true;
    t.on(++t.count, true);
    return;
  }
  t.carried +=
    Math.hypot(now.pos.x - was.pos.x, now.pos.y - was.pos.y) / UNITS_PER_FACE + Math.abs(now.angle - was.angle) / TURN_PER_FACE;
  // Room for THIS face and for the result after it: without the second face's worth the two land a
  // frame apart at the end, and the pace that has been slowing all the way blinks twice instead.
  while (t.carried >= 1 && t.left(now) >= 2) {
    t.carried -= 1;
    t.on(++t.count, false);
  }
};

/**
 * A FLIGHT'S OWN FACE-COUNTER. A choreography knows its whole schedule up front and lists its beats;
 * a body does not — how far it still has to go is the physics' answer, asked every frame. So the
 * count is carried instead: travel accumulates in faces, and `left` says when the one being shown
 * is the last (the result's own, still in motion).
 */
export interface Tumbling {
  /** Faces' worth of motion the body has LEFT. Under one, whatever it shows next it shows to the end. */
  readonly left: (b: Body) => number;
  readonly on: (count: number, last: boolean) => void;
  /** Faces' worth of motion since the last one was shown. */
  carried: number;
  count: number;
  ended: boolean;
}
