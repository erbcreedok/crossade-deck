// THE FIGURES, HELD TO THEIR ONE PROMISE: each is a path, and none of them is a sort.
//
// The tagged union these replaced put the vocabulary into the TYPE, so a new figure meant a new
// branch in five files. Here it is a new function and nothing downstream changes — which is only
// true while every one of them comes out as the same `Shape`, flattening like every other. That
// is what these check, one figure at a time.

import { describe, expect, it } from "vitest";
import { extentOf, outlineOf } from "../core/atoms/bounded.js";
import { circle, ellipse, polygon, rect, roundedRect, star } from "./shapes.js";

describe("the shapes a designer asks for", () => {
  // Helpers, not sorts. The tagged union they replaced put the vocabulary into the TYPE, so a
  // new shape meant a new branch in five files; here it is a new function and nothing
  // downstream changes.

  it("shapes.a-rect-is-four-runs — and it is centred on the origin", () => {
    expect(extentOf(rect(2, 1))).toEqual({ w: 2, h: 1 });
    for (const p of outlineOf(rect(2, 1))) {
      expect(Math.abs(p.x)).toBeCloseTo(1, 9);
      expect(Math.abs(p.y)).toBeCloseTo(0.5, 9);
    }
  });

  it("shapes.a-circle-is-an-ellipse-with-equal-radii — not a sort, and not a scaled anything", () => {
    expect(outlineOf(circle(1))).toEqual(outlineOf(ellipse(1, 1)));
    // And it is round to the accuracy every drawing program ships: four cubics are within about
    // three parts in ten thousand of a true circle.
    for (const p of outlineOf(circle(1))) expect(Math.hypot(p.x, p.y)).toBeCloseTo(1, 3);
  });

  it("shapes.an-ellipse-is-not-a-squashed-circle — it is the general case", () => {
    expect(extentOf(ellipse(1.2, 0.8))).toEqual({ w: 2.4, h: 1.6 });
  });

  it("shapes.a-polygon-puts-n-corners-on-a-circle", () => {
    expect(outlineOf(polygon(8, 1))).toHaveLength(8);
    // Fewer than three has no inside; asking for two is a mistake, not a shape.
    expect(outlineOf(polygon(1, 1))).toHaveLength(3);
  });

  it("shapes.a-star-alternates-two-radii — which is why it needs no new sort", () => {
    const points = outlineOf(star(5, 1, 0.4));
    expect(points).toHaveLength(10);
    const radii = points.map((p) => Math.hypot(p.x, p.y));
    expect(Math.max(...radii)).toBeCloseTo(1, 9);
    expect(Math.min(...radii)).toBeCloseTo(0.4, 9);
  });

  it("shapes.a-rounded-rect-stays-inside-its-box — rounding takes area, it never adds any", () => {
    for (const p of outlineOf(roundedRect(2, 1, 0.3))) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(0.5 + 1e-9);
    }
    // A radius past half the shorter side is clamped, not rejected: "as round as possible" is a
    // legitimate ask and the answer is a stadium.
    expect(extentOf(roundedRect(2, 1, 5))).toEqual({ w: 2, h: 1 });
    // And zero is exactly the plain box, so nobody is rounded who did not ask.
    expect(outlineOf(roundedRect(2, 1, 0))).toEqual(outlineOf(rect(2, 1)));
  });
});
