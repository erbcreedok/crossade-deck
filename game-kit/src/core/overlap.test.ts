// Touching, and the groups it makes — pure geometry, stepped by hand.

import { describe, expect, it } from "vitest";
import { outlineOf } from "./atoms/bounded.js";
import { circle, rect } from "../presets/shapes.js";
import { move, rotate, compose } from "./transform.js";
import { islands, outlinesTouch, placedOutline } from "./overlap.js";

const boxAt = (w: number, h: number, x: number, y: number, deg = 0) =>
  placedOutline(outlineOf(rect(w, h)), deg ? compose(move(x, y), rotate(deg)) : move(x, y));

describe("touching", () => {
  it("overlap.boxes-apart-do-not-touch — and the same pair moved together do", () => {
    const a = boxAt(1, 1, 0, 0);
    expect(outlinesTouch(a, boxAt(1, 1, 2, 0))).toBe(false);
    expect(outlinesTouch(a, boxAt(1, 1, 0.5, 0)), "edge to edge is a touch").toBe(true);
    expect(outlinesTouch(a, boxAt(1, 1, 0.4, 0.4)), "corner over corner").toBe(true);
    // Apart on ONE axis is apart: a pair side by side in x and overlapping in y is still two things.
    expect(outlinesTouch(a, boxAt(1, 1, 1.4, 0.2))).toBe(false);
  });

  it("overlap.slack-is-what-a-player-calls-touching — a hair's gap still counts", () => {
    // "Touching" to a player is not the mathematician's word: two cards a hair apart on a felt read
    // as touching, and a heap that would not form until the pixels met would feel broken.
    const a = boxAt(1, 1, 0, 0);
    const b = boxAt(1, 1, 1.05, 0);
    expect(outlinesTouch(a, b)).toBe(false);
    expect(outlinesTouch(a, b, 0.1)).toBe(true);
    // And slack does not join things that are genuinely apart.
    expect(outlinesTouch(a, boxAt(1, 1, 1.5, 0), 0.1)).toBe(false);
  });

  it("overlap.a-turned-box-is-tested-turned — the axes are the shape's own, not the world's", () => {
    // Two boxes whose upright boxes would overlap and whose turned outlines do not: a test on
    // bounding boxes alone would call this a touch, which is how a heap swallows a piece beside it.
    const upright = boxAt(1, 1, 0, 0);
    // Their upright boxes overlap in the square [0.24, 0.5]²; the shapes themselves do not meet,
    // because the turned one presents a corner and its near EDGE lies past the other's corner.
    const turned = boxAt(1, 1, 0.95, 0.95, 45);
    expect(outlinesTouch(upright, turned)).toBe(false);
    expect(outlinesTouch(upright, boxAt(1, 1, 0.75, 0.75, 45)), "closer, and the corner reaches in").toBe(true);
  });

  it("overlap.a-circle-is-its-own-outline — a round piece is not tested as a square", () => {
    const chip = placedOutline(outlineOf(circle(0.5)), move(0, 0));
    // Diagonally out at the corner of the square the circle is inscribed in: a box test would touch.
    expect(outlinesTouch(chip, placedOutline(outlineOf(circle(0.5)), move(0.8, 0.8)))).toBe(false);
    expect(outlinesTouch(chip, placedOutline(outlineOf(circle(0.5)), move(0.9, 0)))).toBe(true);
    // An empty outline touches nothing rather than everything — a node with no box is not a heap.
    expect(outlinesTouch(chip, [])).toBe(false);
  });
});

describe("islands", () => {
  it("overlap.a-chain-is-one-island — touching is transitive, and the ends need not meet", () => {
    // Three in a row where the ends do not meet are still one heap. A rule that grouped pairs only
    // would leave a player holding two halves of a thing they can plainly see is one.
    const boxes = [boxAt(1, 1, 0, 0), boxAt(1, 1, 0.9, 0), boxAt(1, 1, 1.8, 0), boxAt(1, 1, 5, 0)];
    expect(outlinesTouch(boxes[0]!, boxes[2]!), "the ends do not touch").toBe(false);
    const groups = islands(boxes, (a, b) => outlinesTouch(a, b));
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(3);
    expect(groups[1]).toHaveLength(1);
  });

  it("overlap.a-lone-piece-is-its-own-island — and the order is the order it came in", () => {
    // Stable, so a heap does not renumber itself between frames for no reason anyone can see.
    const ids = ["a", "b", "c"];
    expect(islands(ids, () => false)).toEqual([["a"], ["b"], ["c"]]);
    expect(islands(ids, (x, y) => (x === "a" && y === "c") || (x === "c" && y === "a"))).toEqual([["a", "c"], ["b"]]);
    expect(islands([], () => true)).toEqual([]);
  });
});
