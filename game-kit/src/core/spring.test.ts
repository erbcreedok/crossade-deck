// The pure spring arithmetic — no clock, no GPU, so a plain unit test holds it. The numbers below
// are the reference client's drag tune (stiffness 120 / damping 14): underdamped on purpose.

import { describe, expect, it } from "vitest";
import { clampAbs, springAt, springSettled, SPRING_REST, stepSpring, type SpringState } from "./spring.js";

const DT = 1 / 60;

/** Run the spring toward `target` for `frames` and hand back the path — the test reads it directly. */
function run(from: SpringState, target: number, cfg: { stiffness: number; damping: number }, frames: number): SpringState[] {
  const path: SpringState[] = [from];
  let s = from;
  for (let i = 0; i < frames; i++) {
    s = stepSpring(s, target, cfg, DT);
    path.push(s);
  }
  return path;
}

describe("spring", () => {
  it("spring.rests-at-its-target — no target, no motion; then chases and arrives", () => {
    // At rest and already at the target: nothing moves, ever.
    const still = stepSpring(SPRING_REST, 0, { stiffness: 120, damping: 14 }, DT);
    expect(still.pos).toBe(0);
    expect(still.vel).toBe(0);
    // Released short of a target, it chases and eventually settles right on it.
    const path = run(SPRING_REST, 1, { stiffness: 120, damping: 14 }, 400);
    const end = path[path.length - 1]!;
    expect(end.pos).toBeCloseTo(1, 3);
    expect(springSettled(end, 1, 0.001)).toBe(true);
  });

  it("spring.underdamped-overshoots — damping below 2·√stiffness rings past the target once", () => {
    // 2·√120 ≈ 21.9, so damping 14 is underdamped — the "juice": it goes PAST 1 before easing back.
    const under = run(SPRING_REST, 1, { stiffness: 120, damping: 14 }, 400);
    const peak = Math.max(...under.map((s) => s.pos));
    expect(peak).toBeGreaterThan(1);
    // Overdamped (damping 40) never overshoots — it crawls in from below.
    const over = run(SPRING_REST, 1, { stiffness: 120, damping: 40 }, 400);
    const overPeak = Math.max(...over.map((s) => s.pos));
    expect(overPeak).toBeLessThanOrEqual(1 + 1e-9);
  });

  it("spring.trails-a-moving-target — mid-flight it lags behind where the finger already is", () => {
    // Drive the target ahead each frame (a finger sweeping right); the spring never catches up while
    // the finger keeps moving — that lag IS the follow feel, not a bug.
    let s = SPRING_REST;
    let target = 0;
    let sawLag = false;
    for (let i = 0; i < 60; i++) {
      target += 0.05; // finger advances every frame
      s = stepSpring(s, target, { stiffness: 120, damping: 14 }, DT);
      if (i > 5 && s.pos < target) sawLag = true;
    }
    expect(sawLag).toBe(true);
    expect(s.pos).toBeLessThan(target); // still trailing while the finger is still moving
  });

  it("spring.survives-a-large-dt — a clamped big step does not explode", () => {
    // The frame loop clamps dt; even at a coarse 1/20s the semi-implicit order stays bounded, not NaN.
    let s = SPRING_REST;
    for (let i = 0; i < 200; i++) s = stepSpring(s, 1, { stiffness: 120, damping: 14 }, 1 / 20);
    expect(Number.isFinite(s.pos)).toBe(true);
    expect(s.pos).toBeCloseTo(1, 2);
  });

  it("spring.settled-gate — moving is not settled; parked at the target is", () => {
    expect(springSettled({ pos: 1, vel: 0 }, 1, 0.001)).toBe(true);
    expect(springSettled({ pos: 1, vel: 0.5 }, 1, 0.001)).toBe(false); // still moving
    expect(springSettled({ pos: 0.5, vel: 0 }, 1, 0.001)).toBe(false); // not there yet
    expect(springAt(3)).toEqual({ pos: 3, vel: 0 }); // seeded at rest where it starts
  });

  it("spring.clampAbs — the lean saturates instead of tilting past its limit", () => {
    expect(clampAbs(5, 17)).toBe(5);
    expect(clampAbs(50, 17)).toBe(17);
    expect(clampAbs(-50, 17)).toBe(-17);
  });
});
