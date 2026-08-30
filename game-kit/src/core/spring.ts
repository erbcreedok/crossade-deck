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
 * Advance one channel by `dt` seconds toward `target` — EXACTLY, by the closed form.
 *
 * It was semi-implicit Euler, which is fine for a gentle spring and wrong for a stiff one in the
 * one place it matters most: the FIRST frame. A card pulled out of a pack over 220 ms crosses three
 * units, which is a stiffness of eight hundred, and one 16 ms Euler step moved it 0.66 units where
 * the spring is really at 0.24. Two and a half times too far, on the very frame a player is
 * watching to see the card leave the deck — so what they saw was a card that was suddenly out. It
 * reads as a teleport because, for that frame, it is one.
 *
 * A damped spring has an exact solution, and stepping it costs two exponentials. Nothing about the
 * feel changes — underdamped still overshoots and comes back, overdamped still never does — but the
 * motion is now the same motion on a slow phone and a fast one, rather than merely a similar one:
 * an integrator's error grows with the frame time, and this has none.
 *
 * `dt` is still clamped by the CALLER, but no longer for stability — only so a background tab that
 * resumes after a second does not play that whole second in one frame.
 */
export function stepSpring(state: SpringState, target: number, cfg: SpringConfig, dt: number): SpringState {
  if (!(dt > 0)) return state;
  const k = cfg.stiffness;
  const c = cfg.damping;
  // The distance still to cover, which is the thing that actually decays. Position is read back off
  // it at the end, so a target a long way from the origin costs no accuracy.
  const u0 = state.pos - target;
  const v0 = state.vel;
  // NEITHER PULL NOR DRAG: not a spring at all, just a body drifting. Said plainly rather than
  // falling out of a branch that assumes one of them.
  if (!(k > 0) && !(c > 0)) return { pos: state.pos + v0 * dt, vel: v0 };
  const disc = c * c - 4 * k;
  if (Math.abs(disc) < 1e-9 * Math.max(1, c * c)) {
    // CRITICAL: the fastest arrival with no overshoot, and the default this kit tunes toward.
    const a = c / 2;
    const e = Math.exp(-a * dt);
    const b = v0 + a * u0;
    return { pos: target + e * (u0 + b * dt), vel: e * (v0 - a * b * dt) };
  }
  if (disc < 0) {
    // UNDER: it goes past and comes back, which is the juice a dead stop lacks.
    const a = c / 2;
    const w = Math.sqrt(-disc) / 2;
    const e = Math.exp(-a * dt);
    const cos = Math.cos(w * dt);
    const sin = Math.sin(w * dt);
    const b = (v0 + a * u0) / w;
    return { pos: target + e * (u0 * cos + b * sin), vel: e * (v0 * cos - ((k * u0 + a * v0) / w) * sin) };
  }
  // OVER: two decays, and it crawls in without ever passing the mark.
  const root = Math.sqrt(disc);
  const r1 = (-c + root) / 2;
  const r2 = (-c - root) / 2;
  const c1 = (v0 - r2 * u0) / (r1 - r2);
  const c2 = u0 - c1;
  const e1 = Math.exp(r1 * dt);
  const e2 = Math.exp(r2 * dt);
  return { pos: target + c1 * e1 + c2 * e2, vel: r1 * c1 * e1 + r2 * c2 * e2 };
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
