// THE POSES A DEALER ASKS FOR — ready-made arrangements of a hand of children.
//
// A fan of cards, the thickness of a stack, a solitaire cascade: none of them is a new atom or
// a new layout. Each is an ORDINARY FUNCTION returning one `DealtPose` per child — data a
// caller writes onto its nodes with `Transformable`, the same way `star(...)` is data it writes
// into `Bounded`. The layers below keep working when this file is empty.
//
// Everything is in UNITS around the middle card's resting place, so a fan drops into a scene
// where a single card used to be without moving anything else.

import { type Point } from "../core/atoms/bounded.js";
import { type TransformableFields } from "../core/atoms/transformable.js";

/**
 * What a dealt pose may say: a position and a turn — NEVER `z` and never a scale.
 *
 * The same law layouts obey, held by the same means: the TYPE has no room for a height. A fan
 * needs no `z` because siblings keep tree order at equal height, and thickness is an `at`
 * offset — a preset that lifted every card would raise a lifted hand twice.
 */
export interface DealtPose extends Pick<TransformableFields, "at" | "angle"> {
  readonly at: Point;
  readonly angle: number;
}

export interface FanOptions {
  /** The whole arc, in degrees, first card to last. Default 60. */
  readonly spread?: number;
  /** How far below the cards the wrist sits — the point the fan pivots about. Default 2. */
  readonly radius?: number;
}

/**
 * A hand fan: `count` cards pivoting about a wrist below them.
 *
 * The middle of the fan stands still — card angles run from `-spread/2` to `+spread/2`, and
 * each card sits where the wrist's arm carries it. One card is no fan and comes back unposed.
 */
export function fan(count: number, { spread = 60, radius = 2 }: FanOptions = {}): DealtPose[] {
  return deal(count, (i, n) => {
    const angle = n < 2 ? 0 : -spread / 2 + (spread * i) / (n - 1);
    const rad = (angle * Math.PI) / 180;
    // The wrist is at `{0, radius}`; the card rides the arm's end, so the middle card rests on
    // the origin and the ends swing down and out.
    return { at: { x: radius * Math.sin(rad), y: radius * (1 - Math.cos(rad)) }, angle };
  });
}

export interface StackOptions {
  /** Where each next card lands, relative to the one under it. Default a whisker up-right. */
  readonly drift?: Point;
}

/**
 * A resting stack: each card a `drift` past the one before, and NOT a step of `z`.
 *
 * Thickness is position — the model's own lesson, dealt: siblings keep tree order, so the card
 * added last already shows on top, and lifting the stack (its container's `z`) lifts every card
 * exactly once.
 */
export function stack(count: number, { drift = { x: 0.03, y: -0.03 } }: StackOptions = {}): DealtPose[] {
  return deal(count, (i) => ({ at: { x: times(i, drift.x), y: times(i, drift.y) }, angle: 0 }));
}

export interface CascadeOptions {
  /** The step between neighbours. Default straight down, far enough to read every card's top. */
  readonly step?: Point;
}

/** A solitaire cascade: the same march as a stack, spaced to be READ rather than to look held. */
export function cascade(count: number, { step = { x: 0, y: 0.35 } }: CascadeOptions = {}): DealtPose[] {
  return deal(count, (i) => ({ at: { x: times(i, step.x), y: times(i, step.y) }, angle: 0 }));
}

/** A multiply that never answers `-0`: the first card of any march rests on an honest zero. */
function times(i: number, v: number): number {
  return i * v || 0;
}

/** Deal `count` poses. Zero or less is an empty hand, not an error and not one card. */
function deal(count: number, pose: (i: number, n: number) => DealtPose): DealtPose[] {
  const n = Math.max(0, Math.floor(count));
  return Array.from({ length: n }, (_, i) => pose(i, n));
}
