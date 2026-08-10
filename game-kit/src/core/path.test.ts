// WHAT A DRAWING TOOL ACTUALLY WRITES.
//
// The `d` a reader pastes comes out of Figma, Illustrator or an `.svg` file, and each of them
// writes it differently: absolute or relative, `C` or the `S` shorthand, quadratics from a font
// tool, `H`/`V` for the straight runs. A parser that handled one of those dialects would be a
// parser that worked for whoever guessed right — the same failure the `points` control was
// written to avoid.

import { describe, expect, it } from "vitest";
import { extentOf, outlineOf } from "./atoms/bounded.js";
import { fromSvgPath, joinPath, polyline } from "./path.js";

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

describe("two paths sewn into one", () => {
  // A route out of pieces, a rail an animation runs along, a trail continued by another: all of
  // them are one piece used again somewhere else, and the piece must not deform when it lands.
  const first = polyline([
    { x: 0, y: 0 },
    { x: 1, y: 0 },
  ]);
  const second = polyline([
    { x: 5, y: 5 },
    { x: 5.5, y: 1 },
    { x: 6, y: 5 },
  ]);

  it("path.joined-starts-where-the-first-ended — one place, not a gap and not a doubled point", () => {
    const both = joinPath(first, second);
    expect(both.start).toEqual(first.start);
    // The seam contributes no segment of its own: two segments in, three in the join, and the
    // place they meet at is the first path's end.
    expect(both.segments).toHaveLength(first.segments.length + second.segments.length);
    expect(both.segments[0]!.to).toEqual({ x: 1, y: 0 });
    expect(both.segments[1]!.to).toEqual({ x: 1.5, y: -4 });
  });

  it("path.joining-moves-the-second-whole — it is picked up, not redrawn", () => {
    const both = joinPath(first, second);
    const before = second.segments.map((seg) => ({ x: seg.to.x - second.start.x, y: seg.to.y - second.start.y }));
    const landed = both.segments.slice(first.segments.length);
    const seam = both.segments[first.segments.length - 1]!.to;
    // Every place of the second path sits exactly where it sat relative to its own start. A
    // rebuilt path would be right at the ends and wrong in the middle, which is the failure
    // nobody notices until the fifth piece of a rail.
    expect(landed.map((seg) => ({ x: seg.to.x - seam.x, y: seg.to.y - seam.y }))).toEqual(before);
  });

  it("path.joining-is-a-chain — a third piece continues from the second", () => {
    const chained = joinPath(joinPath(first, second), first);
    const places = [chained.start, ...chained.segments.map((seg) => seg.to)];
    // The last place is the first piece's own run laid down again from wherever the second ended
    // — one unit on from the seam at (2, 0), and not back at the origin it was drawn around.
    expect(places[places.length - 1]).toEqual({ x: 3, y: 0 });
  });
});
