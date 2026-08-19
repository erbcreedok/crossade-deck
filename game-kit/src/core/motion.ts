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

/**
 * THE TUNING — every number that decides how a motion FEELS, in one flat record. Flat on purpose:
 * a field here is a control in the catalog under the same name and an option to the runtime under
 * the same name, with nothing translating between them. Three levels stack: the kit's defaults
 * below, a game's own record handed to `attachMotion`, and a per-call patch on `grab`/`launch`/…;
 * the onlooker's `motionSpeed` (viewer plane) multiplies on top of all three.
 *
 * The defaults are what every consumer actually asked for, not a neutral — a game that wants no
 * lift pop says `lift: 1`, it does not have to say `lift: 1.06` to get the ordinary one.
 */
export interface MotionTuning {
  /** How long a settle lasts, ms — the glide of a node to a moved rest pose. */
  readonly settleMs: number;
  /** Registry name of the settle's easing (`installStockEasings`: `linear`, `easeOut`). */
  readonly settleEase: string;
  /** How long a turn-over lasts, ms — the squeeze to an edge and back. */
  readonly flipMs: number;
  /** Easing of the turn's progress. `linear` is a physical rotation. */
  readonly flipEase: string;
  /** How long a shuffle choreography lasts, ms. */
  readonly shuffleMs: number;
  /** How long a die's tumble lasts, ms. */
  readonly rollMs: number;
  /** Carry style name (`installStockCarries`: `rigid` keeps a run one plank, `loose` turns each). */
  readonly carry: string;
  /** Lift scale while held — the small pop of a picked-up card. `1` is no pop. */
  readonly lift: number;
  /**
   * The x/y chase spring: pull toward the finger. It does NOT move the run — a held thing rides the
   * finger 1:1 — it is the SMOOTHER that turns raw pointer jumps into a speed: higher is a quicker,
   * twitchier read of the finger, lower is a lazier one.
   */
  readonly followStiffness: number;
  /** The chase spring's damping; below `2·√stiffness` its speed overshoots a touch and eases back. */
  readonly followDamping: number;
  /** The lift-scale spring: how fast the pop arrives. */
  readonly liftStiffness: number;
  readonly liftDamping: number;
  /**
   * Speed → lean: degrees per unit/s of horizontal speed. `0` is no whip. The unit is the card, so
   * this is "degrees per card-width per second" — the owner's own whip, ported: the previous client
   * banked `0.0007` radians per px/s on a card `160` px wide, which is `6.42°` per card-width/s.
   */
  readonly leanFactor: number;
  /** The lean saturates here, degrees — a flick pins it instead of spinning the card. The previous client's `0.3` rad. */
  readonly leanMaxDeg: number;
  /**
   * The lean's OWN spring: the bank CHASES the speed's lean instead of being it.
   *
   * Without a channel of its own the angle is exactly as twitchy as the velocity, and because the
   * lean saturates, an ordinary drag holds it pinned: a finger that turns round swaps a pinned
   * `+leanMaxDeg` for a pinned `-leanMaxDeg` in four frames — 34° in 67 ms, which reads as a card
   * SNAPPING, not as one with weight. The spring spreads that swing over its own time constant and
   * costs nothing at rest. It is the previous client's angle spring, on the angle it owns.
   */
  readonly leanStiffness: number;
  /** The lean spring's damping; under `2·√stiffness` the bank overshoots a touch as it swings through. */
  readonly leanDamping: number;
  /** Screen-fall gravity for `launch`, units/s². */
  readonly gravity: number;
  /** Restitution of a bounce, 0..1 — off a floor for `launch`, off a wall for `slide`. */
  readonly bounce: number;
  /** Desk-slide deceleration for `slide`, units/s². */
  readonly friction: number;
  /** Desk-slide angular deceleration for `slide`, degrees/s². */
  readonly spinFriction: number;
}

export const DEFAULT_TUNING: MotionTuning = {
  settleMs: 180,
  settleEase: "easeOut",
  flipMs: 180,
  flipEase: "linear",
  shuffleMs: 700,
  rollMs: 900,
  carry: "rigid",
  lift: 1.06,
  followStiffness: 120,
  followDamping: 14,
  liftStiffness: 170,
  liftDamping: 20,
  leanFactor: 6.42,
  leanMaxDeg: 17.19,
  leanStiffness: 150,
  leanDamping: 16,
  gravity: 9,
  bounce: 0.7,
  friction: 6,
  spinFriction: 540,
};

/** The fields a carry reads — what `grab` accepts as its per-gesture patch. */
export type CarryTuning = Pick<
  MotionTuning,
  | "carry"
  | "lift"
  | "followStiffness"
  | "followDamping"
  | "liftStiffness"
  | "liftDamping"
  | "leanFactor"
  | "leanMaxDeg"
  | "leanStiffness"
  | "leanDamping"
>;

/**
 * A patch over the tuning: any subset, and a field may be `undefined` — a consumer that forwards a
 * control it does not always have writes `{ settleMs: maybe }` and the default fills the gap.
 */
export type TuningPatch = { readonly [K in keyof MotionTuning]?: MotionTuning[K] | undefined };

/** The defaults with a patch over them. `undefined` fields in the patch do not erase a default. */
export function tune(patch?: TuningPatch): MotionTuning {
  if (!patch) return DEFAULT_TUNING;
  const out: Record<string, unknown> = { ...DEFAULT_TUNING };
  for (const [k, v] of Object.entries(patch)) if (v !== undefined && k in DEFAULT_TUNING) out[k] = v;
  return out as unknown as MotionTuning;
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

/**
 * The horizontal squeeze of a card turning about a vertical axis, as a fraction of full width — the
 * PROJECTION of the turning card onto the glass, `|cos|` of the half-turn: `1` face-on, `0` edge-on
 * at the midpoint, `1` again on the far face. Magnitude only; the reflection's SIGN lives in the
 * resting pose, so a runtime multiplies this onto that pose. Clamped, so an early or late read never
 * widens past full. The content swaps at the edge (`t = 0.5`), where the card has no width to show it.
 */
export function flipScale(t: number): number {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  return Math.abs(Math.cos(Math.PI * clamped));
}
