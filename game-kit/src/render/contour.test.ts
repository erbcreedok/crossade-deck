// The dash rules are the ones that cannot be checked by looking: a border with a double-length
// dash at the top-left corner looks like a border. So every claim about them is a number here.

import { describe, expect, it } from "vitest";
import { dashContour, offsetContour, perimeter, surfaceOutline } from "./contour.js";
import { type Point } from "../core/atoms/bounded.js";
import { circle, polyline, rect } from "../core/shapes.js";

const lengthOf = (path: readonly Point[]): number => {
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) total += Math.hypot(path[i + 1]!.x - path[i]!.x, path[i + 1]!.y - path[i]!.y);
  return total;
};
const painted = (dashes: readonly (readonly Point[])[]): number => dashes.reduce((sum, d) => sum + lengthOf(d), 0);

describe("surfaceOutline", () => {
  it("contour.a-square-is-four-points — nothing is added when nothing is rounded", () => {
    expect(surfaceOutline(rect(2, 2))).toHaveLength(4);
  });

  it("contour.a-circle-arrives-as-a-polygon — the renderer has no second primitive", () => {
    // The whole reason the plan hands down points: a renderer given a shape would have to tell
    // a circle from a rect, and that branch would spread.
    expect(surfaceOutline(circle(1 )).length).toBeGreaterThan(8);
  });

  it("contour.rounding-belongs-to-the-surface-not-the-box", () => {
    // A rounded rect has corners made of chords, and every point still sits inside the box the
    // model declared — rounding takes area away, it never adds any.
    const points = surfaceOutline(rect(2, 2), 0.5);
    expect(points.length).toBeGreaterThan(4);
    for (const p of points) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(1 + 1e-9);
    }
  });

  it("contour.a-radius-past-half-the-side-is-clamped — an author asking for round gets round", () => {
    // Two corners of a 2×1 cannot both have a radius of 5; the answer is a stadium, not a throw.
    const points = surfaceOutline(rect(2, 1), 5);
    for (const p of points) expect(Math.abs(p.y)).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it("contour.a-polygon-rounds-like-anything-else", () => {
    // Rounding used to be rects only, on the reasoning that a polygon's points are what its
    // author drew. That confused two authors: the points come from whoever drew the SHAPE, the
    // radius from whoever wrote the SURFACE, and the second one is asking for exactly this.
    const corners = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 0, y: 1 }];
    const poly = polyline(corners);
    const rounded = surfaceOutline(poly, 0.4);
    expect(rounded.length).toBeGreaterThan(corners.length);
    // Every corner is cut, never grown: a fillet takes area away, and a rounded shape that
    // reached outside its own box would push a stroke past the layout's spacing.
    for (const p of rounded) {
      expect(Math.abs(p.x)).toBeLessThanOrEqual(1 + 1e-9);
      expect(p.y).toBeLessThanOrEqual(1 + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(-1 - 1e-9);
    }
    // And not one of the drawn corners survives as a sharp point.
    for (const corner of corners) {
      expect(rounded.some((p) => Math.hypot(p.x - corner.x, p.y - corner.y) < 1e-9)).toBe(false);
    }
  });

  it("contour.no-radius-no-rounding — nobody is rounded who did not ask", () => {
    // The default is 0, and at 0 the points must come back exactly as drawn — otherwise every
    // shape in the catalog quietly shrinks the first time this function is touched.
    const corners = [{ x: -1, y: -1 }, { x: 1, y: -1 }, { x: 0, y: 1 }];
    const poly = polyline(corners);
    expect(surfaceOutline(poly, 0)).toEqual(corners);
  });

  it("contour.a-shallow-bend-is-not-a-corner — a curve keeps its own sampling", () => {
    // A circle arrives as a polygon of shallow bends. Rounding those would file the curve down
    // a little on every repaint, and the shape would differ from the box it is painted in.
    const round = circle(1);
    expect(surfaceOutline(round, 0.4)).toEqual(surfaceOutline(round, 0));
  });
});

describe("dashContour", () => {
  it("dash.the-pattern-closes-on-itself — no double-length dash at the start", () => {
    // The documented artifact of a plain dash walk on a closed path: the first and last dash
    // meet and read as one. `stretch` is the default precisely so this cannot happen.
    const dashes = dashContour(surfaceOutline(rect(3, 3)), { on: 0.35, off: 0.2 });
    const lengths = dashes.map(lengthOf);
    const longest = Math.max(...lengths);
    const shortest = Math.min(...lengths);
    expect(longest / shortest).toBeLessThan(1.5);
  });

  it("dash.a-whole-number-of-periods-fits — that is what stretch means", () => {
    const contour = surfaceOutline(rect(2, 3));
    const dashes = dashContour(contour, { on: 0.3, off: 0.15 });
    // Every dash is the same stretched length, so the painted total is n × that length.
    const each = lengthOf(dashes[0]!);
    expect(painted(dashes)).toBeCloseTo(each * dashes.length, 6);
    // And the stretched period stays near the one that was asked for — stretch adjusts, it
    // does not redesign.
    const period = perimeter(contour) / dashes.length;
    expect(period).toBeGreaterThan(0.45 * 0.8);
    expect(period).toBeLessThan(0.45 * 1.25);
  });

  it("dash.width-is-independent-of-the-area — the count grows, the dash does not", () => {
    // The rule the whole design turns on: a border is an operation on a contour, not a picture
    // stretched over one. Four times the perimeter, four times the dashes, same dash.
    const small = dashContour(surfaceOutline(rect(1, 1)), { on: 0.14, off: 0.09 });
    const large = dashContour(surfaceOutline(rect(4, 4)), { on: 0.14, off: 0.09 });
    expect(large.length).toBeGreaterThan(small.length * 3);
    expect(lengthOf(large[0]!)).toBeCloseTo(lengthOf(small[0]!), 1);
  });

  it("dash.every-corner-carries-a-dash — under stroke-dashcorner", () => {
    // Each side is dashed on its own and starts with a dash, so both of its ends are painted.
    // Without it a corner lands wherever the walk happened to be, and a gap on a corner is the
    // one place a dashed border looks broken.
    const dashes = dashContour(surfaceOutline(rect(2, 3)), { on: 0.3, off: 0.2, corner: "dash" });
    const corners = surfaceOutline(rect(2, 3));
    for (const corner of corners) {
      const covered = dashes.some((d) => d.some((p) => Math.hypot(p.x - corner.x, p.y - corner.y) < 1e-6));
      expect(covered, `corner ${corner.x},${corner.y} is not on a dash`).toBe(true);
    }
  });

  it("dash.corner-falls-back-when-there-are-no-corners — a circle is one walk", () => {
    // A rounded contour has no vertex sharp enough to split on, and the honest answer is the
    // plain walk rather than a silently different one.
    const round = surfaceOutline(circle(1 ));
    expect(dashContour(round, { on: 0.2, off: 0.1, corner: "dash" })).toEqual(
      dashContour(round, { on: 0.2, off: 0.1 }),
    );
  });

  it("dash.no-pattern-no-dashes — a zero length is not an infinite loop", () => {
    expect(dashContour(surfaceOutline(rect(1, 1)), { on: 0, off: 0.1 })).toEqual([]);
    expect(dashContour(surfaceOutline(rect(1, 1)), { on: 0.1, off: 0 })).toEqual([]);
  });

  it("dash.gaps-are-real — a dashed contour paints less than a solid one", () => {
    const contour = surfaceOutline(rect(2, 2));
    expect(painted(dashContour(contour, { on: 0.3, off: 0.3 }))).toBeLessThan(perimeter(contour) * 0.6);
  });
});

describe("offsetContour", () => {
  it("offset.inward-shrinks — a square moved in is a smaller square", () => {
    const inner = offsetContour(surfaceOutline(rect(2, 2)), 0.25);
    for (const p of inner) {
      expect(Math.abs(p.x)).toBeCloseTo(0.75, 10);
      expect(Math.abs(p.y)).toBeCloseTo(0.75, 10);
    }
  });

  it("offset.outward-grows — a negative distance is the other way", () => {
    const outer = offsetContour(surfaceOutline(rect(2, 2)), -0.25);
    for (const p of outer) expect(Math.abs(p.x)).toBeCloseTo(1.25, 10);
  });

  it("offset.inside-is-the-contour-s-own — the winding decides, not the caller", () => {
    // The same square, wound the other way. "In" is a property of the shape, so both answers
    // have to be the smaller square — otherwise a pasted outline drawn anticlockwise would
    // wear its border on the outside and nothing would say why.
    const square = surfaceOutline(rect(2, 2));
    const backwards = [...square].reverse();
    for (const p of offsetContour(backwards, 0.25)) expect(Math.abs(p.x)).toBeCloseTo(0.75, 10);
  });

  it("offset.zero-changes-nothing — a centred stroke moves no line", () => {
    const square = surfaceOutline(rect(2, 2));
    expect(offsetContour(square, 0)).toBe(square);
  });

  it("offset.a-round-corner-stays-round — the radius shrinks with the line", () => {
    // The corner arc of a 2 × 2 box with a 0.5 radius is centred at (0.5, 0.5) and 0.5 out.
    // Move the contour in by 0.2 and every one of its points has to be 0.3 from that same
    // centre: a corner that came out of the offset as a bevel or a knot is what a broken
    // dashed border is made of.
    //
    // Not to the last decimal, and the slack is arithmetic rather than sloppiness: what is
    // offset is the CHORDS. Two of them meet at 15° — a quarter split into `CORNER_CHORDS` —
    // and their miter sits `1/cos(7.5°)` of the offset in, so a 0.2 move lands 0.0017 deep.
    // Under a hundredth is the claim; a tighter one would be a test of `CORNER_CHORDS` instead.
    const rounded = surfaceOutline(rect(2, 2), 0.5);
    const inner = offsetContour(rounded, 0.2);
    const arc = inner.filter((p) => p.x > 0.4 && p.y > 0.4);
    expect(arc.length).toBeGreaterThan(3);
    for (const p of arc) expect(Math.hypot(p.x - 0.5, p.y - 0.5)).toBeCloseTo(0.3, 2);
  });

  it("offset.a-spike-is-cut-not-chased — a miter has a limit", () => {
    // A needle: two long edges meeting at a very sharp point. Its inward miter runs a long way
    // up the shape, and left alone one point of a star swallows the rest of it.
    const needle = polyline([
      { x: 0, y: -4 },
      { x: 0.05, y: 0 },
      { x: -0.05, y: 0 },
    ]);
    const inner = offsetContour(surfaceOutline(needle), 0.02);
    for (const p of inner) expect(Math.abs(p.y)).toBeLessThanOrEqual(4);
  });
  it("offset.a-move-past-the-middle-draws-nothing — range, and the shape turning inside out", () => {
    // A 1×1 box asked to move in by 2 came back as a 3×3 box wound the other way, so an
    // inside-aligned dashed border drew itself AROUND the node, three times its size. The
    // winding is the tell: an offset that stays inside a shape cannot reverse it.
    //
    // Nothing is the honest answer — a border thicker than the shape has no inside to sit on —
    // and it reaches the picture as no dashes at all, with the fill still drawn.
    const square = surfaceOutline(rect(1, 1));
    expect(offsetContour(square, 2)).toEqual([]);
    expect(dashContour(offsetContour(square, 2), { on: 0.1, off: 0.1 })).toEqual([]);
    // And the boundary is only crossed when it is crossed: just under half still works.
    expect(offsetContour(square, 0.49).length).toBeGreaterThan(2);
  });

  it("dash.longer-than-the-contour — one dash, not zero and not forever", () => {
    // The walk advances by `dash + gap`, so a period larger than the whole perimeter is the
    // step that either terminates at once or never. It terminates, and what it paints is the
    // contour itself — which is what "a dash longer than the shape" means.
    const dashes = dashContour(surfaceOutline(rect(1, 1)), { on: 100, off: 50 });
    expect(dashes).toHaveLength(1);
    expect(lengthOf(dashes[0]!)).toBeCloseTo(perimeter(surfaceOutline(rect(1, 1))), 6);
  });

  it("dash.a-negative-pattern-draws-nothing — a pattern that cannot exist paints nothing", () => {
    // Negative rather than zero: zero was already refused, and a negative step is the one that
    // walks BACKWARDS forever. Guarded by `on > 0`, which is a different test from `on !== 0`.
    expect(dashContour(surfaceOutline(rect(1, 1)), { on: -1, off: 1 })).toEqual([]);
    expect(dashContour(surfaceOutline(rect(1, 1)), { on: 1, off: -1 })).toEqual([]);
  });
});
