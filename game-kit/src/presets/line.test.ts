// A LINE IS A WALK OUT AND BACK, AND A HEAD IS A NODE OF ITS OWN — the two sentences everything
// below is a consequence of.
//
// The interesting claims are not about how an arrow looks. They are about what the run does not do
// (enclose anything, or move its ends when it is bowed) and about what a head is: a separate node
// with a shape and a record, so it can be filled where the line is a hairline, or be a suit, or
// carry a picture. Sewn into the line's contour none of that would be possible, and the test that
// notices is this one.

import { beforeEach, describe, expect, it } from "vitest";
import { extentOf, footprint, outlineOf, type Point, type Shape } from "../core/atoms/bounded.js";
import { byId, fieldsOf, type Node } from "../core/node.js";
import { arrow, installStockHeads, line, registerHead, resetHeads } from "./line.js";
import { circle } from "./shapes.js";

const FROM: Point = { x: -1, y: 0 };
const TO: Point = { x: 1, y: 0 };
const RUN = { from: FROM, to: TO } as const;
const STOCK = ["pointer", "begin", "stop", "diamond"];

/** The area a contour encloses. Zero means the walk lies on itself, which is what a line is. */
function area(shape: Shape): number {
  const points = outlineOf(shape);
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    sum += a.x * b.y - b.x * a.y;
  }
  return Math.abs(sum) / 2;
}

/** How far the path strays from the straight run between its ends. */
function sideways(shape: Shape): number {
  return Math.max(...outlineOf(shape).map((p) => Math.abs(p.y)));
}

/** How close the path comes to a place — the way to ask "does it go through here". */
function reaches(shape: Shape, place: Point): number {
  return Math.min(...outlineOf(shape).map((p) => Math.hypot(p.x - place.x, p.y - place.y)));
}

/** The parts an arrow came out as, by name — `path`, and an end only when something stands on it. */
const partsOf = (root: Node): readonly string[] => root.children.map((c) => c.id);

function partOf(root: Node, id: string): Node {
  const part = byId(root, id);
  expect(part, `the arrow has no ${id}`).toBeDefined();
  return part!;
}

/** The middle of a part's own box: where it sits, as opposed to how big it is. */
function centreOf(root: Node, id: string): Point {
  const points = outlineOf(footprint(partOf(root, id))!);
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/** The record a part names. The atom holds a REFERENCE, and this is that reference. */
function wornBy(root: Node, id: string): string | undefined {
  return fieldsOf<{ surface: string }>(partOf(root, id), "Surfaced")?.surface;
}

beforeEach(() => {
  resetHeads();
  installStockHeads();
});

describe("a line", () => {
  it("line.a-run-out-and-back-encloses-nothing — a line has an inside only if you draw one", () => {
    const plain = line(RUN);
    expect(outlineOf(plain)).toEqual([FROM, TO]);
    expect(area(plain)).toBeCloseTo(0, 9);
    // And with a curve in it, where the return journey is a reversed cubic rather than a
    // reversed straight run: the same claim, and the one that would break if reversing a
    // handled segment were approximate.
    expect(area(line({ ...RUN, bend: 0.6 }))).toBeCloseTo(0, 6);
  });

  it("line.bend-is-a-number-not-a-second-kind-of-path — zero is straight, and it is the same call", () => {
    expect(sideways(line({ ...RUN, bend: 0 }))).toBeCloseTo(0, 9);
    expect(sideways(line({ ...RUN, bend: 0.5 }))).toBeCloseTo(0.5, 2);
  });

  it("line.a-bend-holds-both-ends — the run bows, it does not move house", () => {
    const bowed = line({ ...RUN, bend: 0.5 });
    expect(outlineOf(bowed)[0]).toEqual(FROM);
    expect(reaches(bowed, TO)).toBeCloseTo(0, 9);
    // The span across the run is the bend and nothing more: an end that drifted would show up
    // here as a taller box than was asked for.
    expect(extentOf(bowed).h).toBeCloseTo(0.5, 2);
  });

  it("line.a-path-is-dragged-through-its-places — not merely pulled towards them", () => {
    const swoosh = line({ ...RUN, through: [{ x: -0.2, y: 0.6 }, { x: 0.4, y: -0.3 }] });
    expect(reaches(swoosh, { x: -0.2, y: 0.6 })).toBeCloseTo(0, 6);
    expect(reaches(swoosh, { x: 0.4, y: -0.3 })).toBeCloseTo(0, 6);
  });

  it("line.a-bend-bows-a-path-that-already-curves — it adds to the places, it does not replace them", () => {
    const spec = { ...RUN, through: [{ x: 0, y: 0.3 }] };
    expect(sideways(line(spec))).toBeCloseTo(0.3, 2);
    expect(sideways(line({ ...spec, bend: 0.4 }))).toBeCloseTo(0.7, 2);
  });
});

describe("and what stands at its ends", () => {
  it("line.a-head-is-its-own-node — not a detour in the line's contour", () => {
    // THE CLAIM THE WHOLE DESIGN RESTS ON. A head sewn into the walk would be stuck with the
    // line's paint and with being a path at all; as a node it has a box and a record of its own.
    expect(partsOf(arrow(RUN))).toEqual(["path"]);
    expect(partsOf(arrow({ ...RUN, endHead: "pointer" }))).toEqual(["path", "end"]);
    // The run's own shape is untouched by the head standing on it.
    expect(footprint(partOf(arrow({ ...RUN, endHead: "pointer" }), "path"))).toEqual(line(RUN));
  });

  it("line.two-ends-are-independent — which is the whole arrow family", () => {
    expect(partsOf(arrow({ ...RUN, startHead: "pointer", endHead: "diamond" }))).toEqual(["path", "end", "start"]);
    // One description used twice: the two heads are mirror images, so they are the same size and
    // sit the same distance from the middle. Two blocks of nearly identical arithmetic is how a
    // double-headed arrow ends up subtly lopsided.
    const both = arrow({ ...RUN, startHead: "pointer", endHead: "pointer" });
    expect(extentOf(footprint(partOf(both, "start"))!)).toEqual(extentOf(footprint(partOf(both, "end"))!));
    expect(centreOf(both, "start").x).toBeCloseTo(-centreOf(both, "end").x, 9);
  });

  it("line.an-unregistered-head-draws-nothing — an unknown name is a content mistake, not a crash", () => {
    expect(partsOf(arrow({ ...RUN, endHead: "nosuch" }))).toEqual(["path"]);
  });

  it("line.each-end-has-its-own-size — a small dot where it starts, a big point where it lands", () => {
    const lopsided = arrow({ ...RUN, startHead: "pointer", endHead: "pointer", startSize: 0.15, endSize: 0.45 });
    expect(extentOf(footprint(partOf(lopsided, "start"))!).w).toBeCloseTo(0.15, 6);
    expect(extentOf(footprint(partOf(lopsided, "end"))!).w).toBeCloseTo(0.45, 6);
  });

  it("line.a-head-stays-within-its-size — one length governs the mark", () => {
    for (const head of STOCK) {
      for (const size of [0.2, 0.5]) {
        const box = extentOf(footprint(partOf(arrow({ ...RUN, endHead: head, endSize: size }), "end"))!);
        expect(box.w, `${head} at ${size} runs long`).toBeLessThanOrEqual(size + 1e-9);
        expect(box.h, `${head} at ${size} runs wide`).toBeLessThanOrEqual(size + 1e-9);
      }
    }
    // And the size is what decides: the same head asked to be bigger IS bigger, or the control
    // is one the picture ignores.
    const big = extentOf(footprint(partOf(arrow({ ...RUN, endHead: "diamond", endSize: 0.5 }), "end"))!);
    const small = extentOf(footprint(partOf(arrow({ ...RUN, endHead: "diamond", endSize: 0.2 }), "end"))!);
    expect(big.w).toBeGreaterThan(small.w);
  });

  it("line.a-head-faces-the-way-the-path-goes — the tip is on the end, the body reaches back", () => {
    for (const spec of [RUN, { from: { x: 0, y: -1 }, to: { x: 0, y: 1 } }, { ...RUN, bend: 0.6 }]) {
      const drawn = arrow({ ...spec, endHead: "pointer", endSize: 0.4 });
      const tip = spec.to;
      const middle = centreOf(drawn, "end");
      const run = outlineOf(footprint(partOf(drawn, "path"))!);
      const before = run[run.length - 2] ?? run[0]!;
      // The head's body sits between the tip and where the path came from: dot the two together
      // and a head turned the wrong way, or not turned at all, comes out negative.
      const back = { x: before.x - tip.x, y: before.y - tip.y };
      const body = { x: middle.x - tip.x, y: middle.y - tip.y };
      expect(back.x * body.x + back.y * body.y, JSON.stringify(spec)).toBeGreaterThan(0);
    }
  });

  it("line.each-end-wears-its-own-record — and neither has to agree with the line", () => {
    // THREE NODES, THREE RECORDS, and that is the point of a head being a node at all: a hairline
    // run can carry a filled point, and the two ends need not match each other either.
    const three = arrow({
      ...RUN,
      startHead: "begin",
      endHead: "pointer",
      surface: "ink",
      startSurface: "trail",
      endSurface: "mark",
    });
    expect(wornBy(three, "path")).toBe("ink");
    expect(wornBy(three, "start")).toBe("trail");
    expect(wornBy(three, "end")).toBe("mark");
    // Unasked, a head wears the line's record — so a plain arrow reads as one thing rather than
    // two that happen to touch.
    const plain = arrow({ ...RUN, startHead: "pointer", endHead: "pointer", surface: "ink" });
    expect(wornBy(plain, "start")).toBe("ink");
    expect(wornBy(plain, "end")).toBe("ink");
  });

  it("line.a-new-head-is-a-registration — nothing here learns its name", () => {
    registerHead("pip", circle(0.5));
    const pipped = arrow({ ...RUN, endHead: "pip", endSize: 0.3 });
    expect(partsOf(pipped)).toEqual(["path", "end"]);
    expect(extentOf(footprint(partOf(pipped, "end"))!).w).toBeCloseTo(0.3, 6);
  });
});
