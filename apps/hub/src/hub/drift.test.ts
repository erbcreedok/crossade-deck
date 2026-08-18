// THE LAW THIS FILE EXISTS FOR: the felt crawls, it never runs away, and "reduce motion" stops it
// dead rather than slowing it down.
//
// The arithmetic is here and the clock is not, which is the same split the kit keeps between
// `core/motion` and `render/animator`: a step is checkable without a browser, a frame is not.

import { describe, expect, it } from "vitest";
import { AT_REST, DRIFT, driftStep } from "./drift.js";

describe("the felt's drift", () => {
  it("drift.a-full-period-comes-back-to-the-start — the pattern is seamless", () => {
    // client1's keyframe travels a WHOLE number of tiles in its 90s, which is why its loop shows
    // no seam. Ours has no loop at all — it wraps every tile — so the same claim is the stronger
    // one: after the designed period the felt is exactly where it began.
    const after = driftStep(AT_REST, DRIFT.seconds, 1);
    expect(after.x).toBeCloseTo(0, 10);
    expect(after.y).toBeCloseTo(0, 10);
  });

  it("drift.it-goes-client1s-way — ten tiles across for every six down", () => {
    const after = driftStep(AT_REST, 9, 1);
    // A tenth of the journey: one tile across, six tenths down.
    expect(after.x).toBeCloseTo(0, 10);
    expect(after.y).toBeCloseTo(0.6, 10);
    // And the diagonal itself, read before either axis has wrapped.
    const early = driftStep(AT_REST, 4.5, 1);
    expect(early.x / early.y).toBeCloseTo(DRIFT.tilesX / DRIFT.tilesY, 10);
  });

  it("drift.it-never-leaves-one-tile — an evening of drifting is still a small number", () => {
    let at = AT_REST;
    for (let i = 0; i < 3600; i++) at = driftStep(at, 1, 1);
    expect(at.x).toBeGreaterThanOrEqual(0);
    expect(at.x).toBeLessThan(1);
    expect(at.y).toBeGreaterThanOrEqual(0);
    expect(at.y).toBeLessThan(1);
  });

  it("drift.no-motion-means-no-drift — the switch stops it, it does not slow it", () => {
    const somewhere = driftStep(AT_REST, 7, 1);
    expect(driftStep(somewhere, 60, 0)).toEqual(somewhere);
  });

  it("drift.a-slept-through-frame-is-not-owed — a woken tab does not lurch", () => {
    // rAF hands back one enormous `dt` on the frame a hidden tab wakes on. Nothing is owed for
    // time nobody watched, and the alternative — paying it — is a visible jump on return.
    expect(driftStep(AT_REST, Number.POSITIVE_INFINITY, 1)).toEqual(AT_REST);
    expect(driftStep(AT_REST, Number.NaN, 1)).toEqual(AT_REST);
    expect(driftStep(AT_REST, -1, 1)).toEqual(AT_REST);
  });
});
