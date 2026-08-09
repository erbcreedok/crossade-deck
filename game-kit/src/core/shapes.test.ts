// WHAT A DRAWING TOOL ACTUALLY WRITES.
//
// The `d` a reader pastes comes out of Figma, Illustrator or an `.svg` file, and each of them
// writes it differently: absolute or relative, `C` or the `S` shorthand, quadratics from a font
// tool, `H`/`V` for the straight runs. A parser that handled one of those dialects would be a
// parser that worked for whoever guessed right — the same failure the `points` control was
// written to avoid.

import { describe, expect, it } from "vitest";
import { extentOf, outlineOf } from "./atoms/bounded.js";
import { circle, ellipse, fromSvgPath, polygon, rect, roundedRect, star } from "./shapes.js";

const box = (d: string) => extentOf(fromSvgPath(d)!);

describe("an SVG path, pasted", () => {
  it("path.absolute-cubics — the plain case every tool can write", () => {
    const shape = fromSvgPath("M 1 0 C 0.4 0.6 -0.4 0.6 -1 0 C -0.4 -0.6 0.4 -0.6 1 0 Z")!;
    expect(shape.segments).toHaveLength(2);
    expect(outlineOf(shape).length).toBeGreaterThan(20);
    expect(box("M 1 0 C 0.4 0.6 -0.4 0.6 -1 0 C -0.4 -0.6 0.4 -0.6 1 0 Z").w).toBeCloseTo(2, 2);
  });

  it("path.relative-is-the-same-shape — lower case is an offset, not a dialect", () => {
    const absolute = box("M 0 0 L 2 0 L 2 1 L 0 1 Z");
    const relative = box("m 0 0 l 2 0 l 0 1 l -2 0 z");
    expect(relative).toEqual(absolute);
  });

  it("path.a-quadratic-is-a-cubic — converted rather than declined", () => {
    // Font tools and some exporters write `Q`. One segment kind in the model means one
    // flattening routine; the conversion is exact, so nothing is lost by doing it here.
    const q = fromSvgPath("M -1 0 Q 0 -1 1 0 Q 0 1 -1 0 Z")!;
    expect(outlineOf(q).length).toBeGreaterThan(12);
    expect(box("M -1 0 Q 0 -1 1 0 Q 0 1 -1 0 Z").h).toBeCloseTo(1, 1);
  });

  it("path.shorthands-mirror-the-last-handle — S and T are not decoration", () => {
    // `S` means "the handle you would expect", and expecting it wrongly bends the curve the
    // other way — a mistake that looks like a design choice rather than a bug.
    const written = box("M -1 0 C -0.5 -0.8 0.5 -0.8 1 0 C 1.5 0.8 -1.5 0.8 -1 0 Z");
    const shorthand = box("M -1 0 C -0.5 -0.8 0.5 -0.8 1 0 S -1.5 0.8 -1 0 Z");
    expect(shorthand.w).toBeCloseTo(written.w, 6);
    expect(shorthand.h).toBeCloseTo(written.h, 6);
  });

  it("path.h-and-v-are-lines — the straight runs a tool writes short", () => {
    expect(box("M -1 -1 H 1 V 1 H -1 Z")).toEqual({ w: 2, h: 2 });
  });

  it("path.a-missing-close-still-encloses — the region closes itself", () => {
    // A `Z` is how a tool SAYS closed; a region is closed because it is a region.
    expect(box("M -1 -1 H 1 V 1 H -1")).toEqual(box("M -1 -1 H 1 V 1 H -1 Z"));
  });

  it("path.an-arc-fails-loudly — the one command not handled", () => {
    // Dropping the segment would leave a shape quietly missing its rounded end, and nothing on
    // screen would say why. Nothing at all is the honest answer until arcs are converted.
    expect(fromSvgPath("M 0 0 L 1 0 A 1 1 0 0 1 0 0 Z")).toBeUndefined();
  });

  it("path.nonsense-is-nothing — not a half-parsed shape", () => {
    expect(fromSvgPath("")).toBeUndefined();
    expect(fromSvgPath("hello")).toBeUndefined();
    // One segment is a line out and back: it encloses nothing, and drawing it would be a
    // hairline nobody asked for.
    expect(fromSvgPath("M 0 0 L 1 1")).toBeUndefined();
  });
});

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
