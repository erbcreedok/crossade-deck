// THE LAW THIS FILE EXISTS FOR: a lift is a TARGET, not a multiplier. Everything below is a way of
// saying that — the same piece wants a different scale on a different glass, and the same glass
// wants a different scale for a different piece.

import { describe, expect, it } from "vitest";
import { node } from "../core/node.js";
import { Bounded } from "../core/atoms/bounded.js";
import { rect } from "../presets/shapes.js";
import { FINGER_PX, acrossOf, glassPerUnit, liftToFit } from "./lift.js";

const FIT = { fingers: 2, max: 4 };

describe("the lift a held piece takes", () => {
  it("lift.a-target-not-a-multiplier — the scale falls out of the finger and the glass", () => {
    // A pack a third of a unit across, on a phone-ish glass: thirty pixels, and two fingers want
    // eighty-eight. Nothing about that number was chosen; every term in it was already known.
    expect(liftToFit(0.33, 94, FIT)).toBeCloseTo((2 * FINGER_PX) / (0.33 * 94), 5);
  });

  it("lift.the-same-piece-on-a-bigger-glass-lifts-less — the etalon is in the arithmetic", () => {
    const small = liftToFit(0.33, 60, FIT);
    const big = liftToFit(0.33, 200, FIT);
    expect(big).toBeLessThan(small);
  });

  it("lift.a-zoomed-in-desk-lifts-less-too — the camera is the same term", () => {
    // Why the zoom belongs here rather than beside it: a piece already big under a zoomed-in
    // camera has nothing to gain from growing, and a lift that ignored the view would fight it.
    const out = liftToFit(0.33, glassPerUnit(94, 0.5), FIT);
    const inn = liftToFit(0.33, glassPerUnit(94, 2), FIT);
    expect(inn).toBeLessThan(out);
  });

  it("lift.a-piece-already-roomy-is-picked-up-at-its-own-size — never below one", () => {
    // A lift that shrank a big piece to "the right size" would be a resize, not a lift.
    expect(liftToFit(3, 94, FIT)).toBe(1);
  });

  it("lift.it-never-grows-past-recognition — the max is the other complaint", () => {
    // A piece blown up past its own identity is a different problem from one too small to touch,
    // and this is the line between them.
    expect(liftToFit(0.02, 94, FIT)).toBe(4);
  });

  it("lift.more-fingers-is-more-room — the lever says what it is for", () => {
    expect(liftToFit(0.33, 94, { fingers: 1, max: 8 })).toBeLessThan(liftToFit(0.33, 94, { fingers: 2, max: 8 }));
  });

  it("lift.a-fatter-finger-asks-for-more — the hand is the thing that does not change", () => {
    expect(liftToFit(0.33, 94, { ...FIT, max: 9, finger: 70 })).toBeGreaterThan(
      liftToFit(0.33, 94, { ...FIT, max: 9 }),
    );
  });

  it("lift.a-piece-with-no-size-lifts-by-one — no width to divide into, and no guess", () => {
    expect(liftToFit(0, 94, FIT)).toBe(1);
    expect(liftToFit(0.33, 0, FIT)).toBe(1);
    expect(acrossOf(node("bare"))).toBe(0);
  });

  it("lift.the-narrow-side-is-what-a-finger-shares — a card is measured across, not along", () => {
    expect(acrossOf(node("card", Bounded({ bounds: rect(0.56, 0.8) })))).toBeCloseTo(0.56, 5);
  });
});
