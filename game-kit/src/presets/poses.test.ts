import { describe, expect, it } from "vitest";
import { cascade, fan, stack } from "./poses.js";

describe("pose presets", () => {
  it("pose.a-fan-is-symmetric — the middle stands still and the ends mirror", () => {
    const hand = fan(5, { spread: 60, radius: 2 });
    // The middle card of an odd hand rests exactly where a single card would: no turn, no move.
    expect(hand[2]).toEqual({ at: { x: 0, y: 0 }, angle: 0 });
    // The ends mirror: same drop, opposite swing. A fan built from one edge would pass any
    // "five cards, sixty degrees" check and hang the whole hand off to one side.
    expect(hand[0]!.angle).toBe(-hand[4]!.angle);
    expect(hand[0]!.at.x).toBeCloseTo(-hand[4]!.at.x, 10);
    expect(hand[0]!.at.y).toBeCloseTo(hand[4]!.at.y, 10);
    // And the ends hang BELOW the middle — the wrist is under the cards, not over them.
    expect(hand[0]!.at.y).toBeGreaterThan(0);
  });

  it("pose.a-fan-spread-is-the-whole-arc — first card to last, not per card", () => {
    const hand = fan(4, { spread: 90 });
    expect(hand[3]!.angle - hand[0]!.angle).toBeCloseTo(90, 10);
    // One card is no fan: it comes back unposed rather than turned to the arc's edge.
    expect(fan(1)).toEqual([{ at: { x: 0, y: 0 }, angle: 0 }]);
  });

  it("pose.a-stack-climbs-evenly — thickness is position, one drift per card", () => {
    const pile = stack(3, { drift: { x: 0.05, y: -0.02 } });
    expect(pile[0]).toEqual({ at: { x: 0, y: 0 }, angle: 0 });
    expect(pile[2]!.at.x).toBeCloseTo(0.1, 10);
    expect(pile[2]!.at.y).toBeCloseTo(-0.04, 10);
  });

  it("pose.a-cascade-steps-evenly — the same march, spaced to be read", () => {
    const run = cascade(4, { step: { x: 0.1, y: 0.3 } });
    expect(run.map((p) => p.at)).toEqual([
      { x: 0, y: 0 },
      { x: 0.1, y: 0.3 },
      { x: 0.2, y: 0.6 },
      { x: 0.30000000000000004, y: 0.8999999999999999 },
    ]);
  });

  it("pose.a-dealt-pose-writes-no-z — and no scale: the layout's law, held at runtime too", () => {
    // The type already has no room for a height, but a type erases — and a preset that slipped
    // `z` in would raise a lifted hand twice. Scanned over every preset, not one.
    for (const dealt of [fan(6), stack(6), cascade(6)]) {
      for (const pose of dealt) {
        expect(Object.keys(pose).sort()).toEqual(["angle", "at"]);
      }
    }
  });

  it("pose.nobody-is-dealt-nothing — zero or less is an empty hand, not an error", () => {
    expect(fan(0)).toEqual([]);
    expect(stack(-2)).toEqual([]);
    expect(cascade(2.7)).toHaveLength(2);
  });
});
