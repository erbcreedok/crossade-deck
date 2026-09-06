// THE SPARKLE SHIMMERS — client1's SMIL `opacity: .55 → 1 → .55` over 3.2s, expressed as a phase
// instead of as a keyframe, for the same reason `drift.ts` is a step and not a position at time t:
// a settings switch or a power-saving mode must not jump the shimmer to wherever `t × newSpeed`
// lands. So this integrates a PHASE and the caller reads a level off it each frame.

/** client1's own number: one full dim-and-back cycle every 3.2 seconds. */
export const TWINKLE = { seconds: 3.2 } as const;

/**
 * Advance the shimmer's phase by `dt` seconds at `speed` times the designed pace, and WRAP into
 * `[0, 1)` — one full cycle. `speed` is the viewer's `motionSpeed`; `0` means STILL, and nothing
 * accumulates while it is zero, so turning motion back on finds the shimmer where it left off.
 */
export function twinkleStep(from: number, dtSeconds: number, speed: number): number {
  if (!(dtSeconds > 0) || !(speed > 0) || !Number.isFinite(dtSeconds)) return from;
  const gone = (dtSeconds * speed) / TWINKLE.seconds;
  return wrap(from + gone);
}

function wrap(v: number): number {
  const inside = v % 1;
  return inside < 0 ? inside + 1 : inside;
}

/**
 * A phase in `[0, 1)` to a `wash` coat's `level` — how much of the felt's own colour covers the
 * sparkle, which is what dims it. `0` at the phase's ends (fully visible, client1's peak `1`) and
 * `0.45` at its middle (client1's trough `.55`), riding a cosine rather than the original's linear
 * ramp because a coat has no keyframe to ease for it.
 */
export function twinkleLevel(phase: number): number {
  return 0.225 * (1 - Math.cos(phase * Math.PI * 2));
}
