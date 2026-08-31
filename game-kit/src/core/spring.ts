// THE SPRING — the "feel of weight" a card carries while a finger drives it. A finger moves a
// TARGET; the card is a mass on a spring that CHASES that target, so it trails the finger and
// arrives with a small settle instead of teleporting. This file is the arithmetic of that chase —
// one channel, one scalar — headless, so a plain unit test holds it without a clock or a GPU. The
// runtime (the one clock, the animator) runs a few of these per gesture (x, y, a lift scale).
//
// Semi-implicit (symplectic) Euler: advance the VELOCITY from the force first, THEN the position
// from the new velocity. That order stays stable at the large, jittery `dt` a real frame loop hands
// it, where the naive "position first" order rings and blows up. It is the integrator the previous
// client tuned its whole drag on, kept because the feel is the point and the feel came from here.

/** One channel's state: where it is and how fast it is going. Immutable, stepped to a new one. */
export interface SpringState {
  readonly pos: number;
  readonly vel: number;
}

export interface SpringConfig {
  /** Pull toward the target. Higher = snappier, shorter trail. */
  readonly stiffness: number;
  /**
   * Resistance to velocity. Below `2·√stiffness` the spring is UNDERDAMPED — it overshoots the
   * target a touch and eases back, the small "juice" a dead stop lacks. At or above it, no overshoot.
   */
  readonly damping: number;
}

/** A channel at rest at the origin. */
export const SPRING_REST: SpringState = { pos: 0, vel: 0 };

/** A channel at rest AT `pos` — how a gesture seeds a spring so it does not jump on the first frame. */
export function springAt(pos: number): SpringState {
  return { pos, vel: 0 };
}

/**
 * Advance one channel by `dt` seconds toward `target`. `dt` is clamped by the CALLER (the frame
 * loop caps it, so a background tab that resumes after a second does not fling the card across the
 * table). Semi-implicit Euler — velocity from the force, then position from the new velocity.
 */
export function stepSpring(state: SpringState, target: number, cfg: SpringConfig, dt: number): SpringState {
  const force = -cfg.stiffness * (state.pos - target) - cfg.damping * state.vel;
  const vel = state.vel + force * dt;
  const pos = state.pos + vel * dt;
  return { pos, vel };
}

/**
 * True once the spring has all but stopped AND all but arrived — the gate the one clock sleeps on.
 * `eps` is in the channel's own units (root units for a position, a fraction for a scale); the
 * caller picks it, because "close enough" on a card width is not "close enough" on a scale factor.
 */
export function springSettled(state: SpringState, target: number, eps: number): boolean {
  return Math.abs(state.pos - target) <= eps && Math.abs(state.vel) <= eps;
}

/** Clamp a value to `[-limit, limit]`. Used by the lean, where a brisk drag must not tilt past `limit`. */
export function clampAbs(v: number, limit: number): number {
  return v < -limit ? -limit : v > limit ? limit : v;
}
