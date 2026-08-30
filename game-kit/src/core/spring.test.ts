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
  it("spring.a-frame-lands-where-the-spring-REALLY-is — stepped exactly, at any stiffness and any dt", () => {
    // A STIFF SPRING STEPPED BY EULER OVERSHOOTS ITS FIRST FRAME, badly, and it is not a rounding
    // error. A card pulled out of a pack over 220 ms crosses three units; that is a stiffness of
    // eight hundred, and one 16 ms step of `vel += f·dt; pos += vel·dt` moved it 0.66 units where
    // the spring is really at 0.25. Two and a half times too far, on the ONE frame a player is
    // watching for the card to leave the deck — so what they saw was a card that was suddenly out.
    //
    // A damped spring has a closed form. Stepping it exactly costs two exponentials and is stable
    // at any stiffness and any frame time, which also means a slow phone and a fast one draw the
    // same motion rather than merely a similar one.
    const cfg = { stiffness: 815, damping: 2 * Math.sqrt(815) }; // response 0.22s, critically damped
    const exact = (t: number): number => {
      // The analytic critical-damping solution from rest, as a fraction of the distance covered.
      const w = Math.sqrt(cfg.stiffness);
      return 1 - Math.exp(-w * t) * (1 + w * t);
    };
    const d = 2.9;
    for (const dt of [1 / 60, 1 / 30, 1 / 120]) {
      let s = springAt(0);
      for (let k = 1; k <= 12; k++) {
        s = stepSpring(s, d, cfg, dt);
        expect(s.pos, `stiff spring at dt=${dt.toFixed(4)}, frame ${k}`).toBeCloseTo(d * exact(k * dt), 4);
      }
    }
    // AND THE FRAME RATE DOES NOT CHANGE THE MOTION. The same second of spring, stepped three ways.
    const after = (dt: number): number => {
      let s = springAt(0);
      for (let t = 0; t < 0.5 - 1e-9; t += dt) s = stepSpring(s, d, cfg, dt);
      return s.pos;
    };
    expect(after(1 / 30)).toBeCloseTo(after(1 / 240), 6);
    // A SPRING THAT IS THERE STAYS THERE, and one asked for no time at all does not move.
    expect(stepSpring(springAt(d), d, cfg, 1 / 60)).toEqual({ pos: d, vel: 0 });
    expect(stepSpring({ pos: 1, vel: 5 }, d, cfg, 0)).toEqual({ pos: 1, vel: 5 });
    // UNDERDAMPED still overshoots — the juice is a real behaviour, not a stepping artefact.
    const loose = { stiffness: 200, damping: 6 };
    let s = springAt(0);
    let most = 0;
    for (let k = 0; k < 240; k++) {
      s = stepSpring(s, 1, loose, 1 / 240);
      most = Math.max(most, s.pos);
    }
    expect(most, "it goes past and comes back").toBeGreaterThan(1.2);
    // OVERDAMPED never does.
    let o = springAt(0);
    let past = 0;
    for (let k = 0; k < 480; k++) {
      o = stepSpring(o, 1, { stiffness: 200, damping: 60 }, 1 / 240);
      past = Math.max(past, o.pos);
    }
    expect(past).toBeLessThanOrEqual(1 + 1e-9);
  });

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
    // the finger keeps moving. That trail is what makes it a SPEED reader rather than a position: a
    // carried run rides the finger 1:1 and reads this spring's `vel` for its lean and its throw.
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
