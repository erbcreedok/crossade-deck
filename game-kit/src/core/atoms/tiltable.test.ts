import { describe, expect, it } from "vitest";
import { type Atom } from "../atom.js";
import { node } from "../node.js";
import { Transformable } from "./transformable.js";
import { Tiltable, tiltAngle, tiltStops, nextTilt } from "./tiltable.js";

const token = (...extra: Atom[]) => node("t", Transformable({ at: { x: 0, y: 0 } }), ...extra);

describe("Tiltable", () => {
  it("tilt.default-two-stops — upright and tapped-sideways out of the box", () => {
    expect(tiltStops(token(Tiltable({})))).toEqual([0, 90]);
  });

  it("tilt.angle-at-a-stop — the index picks the degree", () => {
    expect(tiltAngle(token(Tiltable({ stops: [0, 120, 240] })), 1)).toBe(120);
  });

  it("tilt.out-of-range-clamps — a tap never points a node nowhere", () => {
    const t = token(Tiltable({ stops: [0, 120, 240] }));
    expect(tiltAngle(t, 9)).toBe(240);
    expect(tiltAngle(t, -3)).toBe(0);
  });

  it("tilt.tap-advances-to-the-next-stop", () => {
    expect(nextTilt(token(Tiltable({ stops: [0, 90] })), 0)).toBe(1);
  });

  it("tilt.tap-wraps-past-the-last — untap by tapping again", () => {
    expect(nextTilt(token(Tiltable({ stops: [0, 90], wrap: true })), 1)).toBe(0);
  });

  it("tilt.tap-rests-on-last-without-wrap", () => {
    expect(nextTilt(token(Tiltable({ stops: [0, 90, 180], wrap: false })), 2)).toBe(2);
  });

  it("tilt.single-stop-never-moves", () => {
    expect(nextTilt(token(Tiltable({ stops: [0] })), 0)).toBe(0);
  });

  it("tilt.no-tiltable-no-angle-and-index-frozen", () => {
    const bare = token();
    expect(tiltAngle(bare, 0)).toBeUndefined();
    expect(tiltStops(bare)).toEqual([]);
    expect(nextTilt(bare, 4)).toBe(4);
  });
});
