// The pure settle arithmetic — no clock, no GPU, so a plain unit test holds it.

import { describe, expect, it } from "vitest";
import { move } from "./transform.js";
import { DEFAULT_TUNING, easing, flipScale, installStockEasings, resetEasings, sample, tune } from "./motion.js";

describe("motion", () => {
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
