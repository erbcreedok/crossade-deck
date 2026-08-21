// POSE ARITHMETIC — three pure functions on a `Transform`, shared by the settles, the flights and
// the choreographies. No state, no clock: given the same poses they give the same answer.

import { apply, compose, move, pose, type Transform, type Vec } from "../../core/transform.js";
import { EPSILON } from "./physics.js";

/** A horizontal-only scale — the width of a card as it turns. The reflection's SIGN stays in the pose. */
export function hscale(k: number): Transform {
  return { a: k, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

export function same(a: Transform, b: Transform): boolean {
  return (
    Math.abs(a.a - b.a) < EPSILON &&
    Math.abs(a.b - b.b) < EPSILON &&
    Math.abs(a.c - b.c) < EPSILON &&
    Math.abs(a.d - b.d) < EPSILON &&
    Math.abs(a.e - b.e) < EPSILON &&
    Math.abs(a.f - b.f) < EPSILON
  );
}

/** The rest pose moved so its origin lands on `at` and turned by `deg` about it, keeping its own size and turn. */
export function seatAt(rest: Transform, at: Vec, deg: number, size = 1): Transform {
  const o = apply(rest, { x: 0, y: 0 });
  return compose(pose(at, deg, size), compose(move(-o.x, -o.y), rest));
}

/** The turn a pose carries, degrees — what a thrown body's own spin adds to. */
export function turnOf(t: Transform): number {
  return (Math.atan2(t.b, t.a) * 180) / Math.PI;
}
