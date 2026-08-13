// MOTION — the pure arithmetic of a settle: a node keeps its identity across a tree swap, and its
// spring plays from where it is toward where it now belongs. This is NOT a diff between two trees
// (that machine is buried, see `container.no-state-diffs`): it is per-node, by id — "my rest pose
// moved, ease me there". Pure and headless, so a plain unit test holds it without a clock or a GPU.
//
// A pose is a `Transform` — the same 2×3 the plan already speaks. Interpolation is component-wise:
// exact for a translation (a card sliding pile→pile keeps `a/b/c/d` and only `e/f` move) and a fair
// approximation for a turn, which is all a settle needs — the true angle lerp waits until a node can
// be halfway through a rotation, which is a later slice.

import { type Transform } from "./transform.js";

/** A time-easing: 0→0 and 1→1, named so the settle is a registry reference, not a switch. */
export type Easing = (t: number) => number;

const EASINGS = new Map<string, Easing>();

export function registerEasing(name: string, fn: Easing): void {
  EASINGS.set(name, fn);
}

/** The named easing, or linear when the name is unregistered — an unknown look never throws. */
export function easing(name: string): Easing {
  return EASINGS.get(name) ?? ((t) => t);
}

/** Test seam only — the registry is process-wide and suites must not leak into each other. */
export function resetEasings(): void {
  EASINGS.clear();
}

/** Register the stock easings under the names the settle uses. Called by the consumer, not on import. */
export function installStockEasings(): void {
  registerEasing("linear", (t) => t);
  // easeOutCubic — quick to leave, gentle to arrive, the shape a card settling wants.
  registerEasing("easeOut", (t) => 1 - (1 - t) ** 3);
}

export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Component-wise interpolation of the affine — see the file header on why that is enough here. */
export function lerpTransform(from: Transform, to: Transform, t: number): Transform {
  return {
    a: lerp(from.a, to.a, t),
    b: lerp(from.b, to.b, t),
    c: lerp(from.c, to.c, t),
    d: lerp(from.d, to.d, t),
    e: lerp(from.e, to.e, t),
    f: lerp(from.f, to.f, t),
  };
}

/** One node's flight from a pose to a pose, over a span of the one clock. */
export interface Motion {
  readonly from: Transform;
  readonly to: Transform;
  /** Clock reading when the flight began. */
  readonly startMs: number;
  /** How long the flight lasts. Zero means snap — sampled `done` from the first read. */
  readonly durMs: number;
  /** Registry name of the easing to shape the flight. */
  readonly ease: string;
}

export interface Sampled {
  readonly transform: Transform;
  /** True once the flight has arrived — the runtime drops a done motion and stops the loop when none remain. */
  readonly done: boolean;
}

/** Where a motion is at `nowMs`, and whether it has arrived. Clamped: a late read never overshoots. */
export function sample(m: Motion, nowMs: number): Sampled {
  const raw = m.durMs <= 0 ? 1 : (nowMs - m.startMs) / m.durMs;
  const t = raw <= 0 ? 0 : raw >= 1 ? 1 : raw;
  return { transform: lerpTransform(m.from, m.to, easing(m.ease)(t)), done: t >= 1 };
}
