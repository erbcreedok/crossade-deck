// THE LAW THIS FILE EXISTS FOR: the sparkle's shimmer is seamless, "reduce motion" stops it dead,
// and its level never uncovers the felt underneath it or paints it solid — same three claims
// `drift.test.ts` makes for the felt's own crawl, read here off a phase instead of a place.

import { describe, expect, it } from "vitest";
import { TWINKLE, twinkleLevel, twinkleStep } from "./twinkle.js";

describe("the sparkle's shimmer", () => {
  it("twinkle.a-full-period-comes-back-to-the-start — the pattern is seamless", () => {
    const after = twinkleStep(0, TWINKLE.seconds, 1);
    expect(after).toBeCloseTo(0, 10);
  });

  it("twinkle.no-motion-means-no-shimmer — the switch stops it, it does not slow it", () => {
    const somewhere = twinkleStep(0, 1, 1);
    expect(twinkleStep(somewhere, 5, 0)).toBe(somewhere);
  });

  it("twinkle.level-stays-in-its-band — never fully bare, never fully covered", () => {
    for (let phase = 0; phase < 1; phase += 0.01) {
      const level = twinkleLevel(phase);
      expect(level).toBeGreaterThanOrEqual(0);
      expect(level).toBeLessThanOrEqual(0.45);
    }
  });

  it("twinkle.peaks-at-the-ends-troughs-in-the-middle — matches client1's .55→1→.55", () => {
    expect(twinkleLevel(0)).toBeCloseTo(0, 10);
    expect(twinkleLevel(0.5)).toBeCloseTo(0.45, 10);
  });
});
