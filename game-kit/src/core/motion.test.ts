// The pure settle arithmetic — no clock, no GPU, so a plain unit test holds it.

import { describe, expect, it } from "vitest";
import { move, type Transform } from "./transform.js";
import { DEFAULT_TUNING, easing, flipScale, installStockEasings, resetEasings, sample, tune, type Motion } from "./motion.js";

describe("motion", () => {
  it("motion.a-settle-TURNS-and-never-collapses — the short way round, not through nothing", () => {
    // FROM A REAL TRACE: a card dealt to a player shrank from 1.78 to 0.12 and grew back over eight
    // frames, its turn jumping 180° at the narrowest point. It reads as a blink, and every card
    // arriving in a hand did it.
    //
    // The cause was here. A pose was eased by lerping the MATRIX — a, b, c, d one at a time — and
    // two poses a half-turn apart have those four exactly negated, so halfway through the lerp is
    // the ZERO matrix: the node has no size at all. A quarter-turn apart it merely shrinks; a
    // half-turn apart it disappears. Nothing in this tree may vanish and come back, which is the
    // same law as nothing may teleport.
    //
    // A pose is a place, a size and a TURN, and a turn is eased as a turn — the short way round.
    const turned = (deg: number, scale = 1): Transform => ({
      a: Math.cos((deg * Math.PI) / 180) * scale,
      b: Math.sin((deg * Math.PI) / 180) * scale,
      c: -Math.sin((deg * Math.PI) / 180) * scale,
      d: Math.cos((deg * Math.PI) / 180) * scale,
      e: 0,
      f: 0,
    });
    const m: Motion = { from: turned(-104.786), to: turned(75.214), startMs: 0, durMs: 100, ease: "linear" };
    for (let k = 0; k <= 10; k++) {
      const t = sample(m, k * 10).transform;
      expect(Math.hypot(t.a, t.b), `a half-turn is a turn, not a disappearance (t=${k / 10})`).toBeCloseTo(1, 6);
    }
    // AND IT GOES THE SHORT WAY. Half a turn either way is the same distance, so what is asserted
    // here is a quarter: from 170° to -170° is forty degrees across the seam, not three hundred and
    // twenty back through zero.
    const seam: Motion = { from: turned(170), to: turned(-170), startMs: 0, durMs: 100, ease: "linear" };
    const mid = sample(seam, 50).transform;
    expect((Math.atan2(mid.b, mid.a) * 180) / Math.PI, "across the seam, not the long way").toBeCloseTo(180, 4);
    // The SIZE is eased as a size, so a card growing as it turns does both at once and neither
    // through zero.
    const grows: Motion = { from: turned(0, 2), to: turned(180, 1), startMs: 0, durMs: 100, ease: "linear" };
    expect(Math.hypot(sample(grows, 50).transform.a, sample(grows, 50).transform.b)).toBeCloseTo(1.5, 6);
    // A REFLECTION IS NOT A TURN, and it must survive: a face-down card wears a negative scale, and
    // a settle that quietly turned it back would show the wrong side of it.
    const flipped: Transform = { a: -1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    const still: Motion = { from: flipped, to: flipped, startMs: 0, durMs: 100, ease: "linear" };
    expect(sample(still, 50).transform.a).toBeCloseTo(-1, 6);
    expect(sample(still, 50).transform.d).toBeCloseTo(1, 6);
  });

  it("motion.lerps-to-its-target — start is from, end is to, and a late read is clamped", () => {
    const m = { from: move(0, 0), to: move(10, 4), startMs: 100, durMs: 200, ease: "linear" };
    // At the start it sits at `from` and is not done; unregistered `linear` falls back to identity.
    expect(sample(m, 100).transform.e).toBe(0);
    expect(sample(m, 100).done).toBe(false);
    // Halfway is halfway on every component.
    const mid = sample(m, 200);
    expect(mid.transform.e).toBeCloseTo(5);
    expect(mid.transform.f).toBeCloseTo(2);
    // At and past the end it is exactly `to`, and done — a late frame never overshoots.
    expect(sample(m, 300)).toMatchObject({ done: true });
    expect(sample(m, 300).transform.e).toBe(10);
    expect(sample(m, 9999).transform.e).toBe(10);
    // A read before the start clamps to `from` rather than reading a negative t.
    expect(sample(m, 50).transform.e).toBe(0);
  });

  it("motion.eases-and-clamps — a named easing shapes the flight and a zero span snaps", () => {
    resetEasings();
    installStockEasings();
    // easeOut leaves fast and arrives gently: past halfway at the midpoint, and pinned at the ends.
    expect(easing("easeOut")(0)).toBe(0);
    expect(easing("easeOut")(1)).toBe(1);
    expect(easing("easeOut")(0.5)).toBeGreaterThan(0.5);
    // A zero-length settle is a snap: done from the first read, already at `to`.
    const snap = { from: move(0, 0), to: move(9, 0), startMs: 0, durMs: 0, ease: "linear" };
    expect(sample(snap, 0)).toMatchObject({ done: true });
    expect(sample(snap, 0).transform.e).toBe(9);
  });

  it("motion.flip-squeezes-to-an-edge-at-the-midpoint — full, nothing, full", () => {
    // The card's projected width as it turns: face-on at both ends, edge-on halfway — which is
    // exactly where the content swaps, unseen. Symmetric about the midpoint.
    expect(flipScale(0)).toBeCloseTo(1);
    expect(flipScale(0.5)).toBeCloseTo(0);
    expect(flipScale(1)).toBeCloseTo(1);
    expect(flipScale(0.25)).toBeCloseTo(flipScale(0.75)); // symmetric
    expect(flipScale(0.25)).toBeGreaterThan(0);
    expect(flipScale(0.25)).toBeLessThan(1);
    // Clamped: an early or late read never widens past full or reads a negative turn.
    expect(flipScale(-1)).toBeCloseTo(1);
    expect(flipScale(2)).toBeCloseTo(1);
  });
  it("motion.tune-patches-the-defaults — a partial over the record, undefined does not erase", () => {
    expect(tune()).toBe(DEFAULT_TUNING);
    const t = tune({ settleMs: 240, lift: undefined });
    expect(t.settleMs).toBe(240);
    expect(t.lift).toBe(DEFAULT_TUNING.lift); // undefined in the patch keeps the default
    expect(t.followStiffness).toBe(DEFAULT_TUNING.followStiffness);
    // The record is flat and every field is a number or a registry name — what a control can hold.
    for (const v of Object.values(DEFAULT_TUNING)) expect(["number", "string"]).toContain(typeof v);
  });
});
