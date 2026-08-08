// Ids follow docs/test-plan.md — a failing id names the scenario and the state.
//
// No `resetAtoms()` here, unlike the stand-in suites: these are the REAL atoms, registered
// when their module is imported. Clearing the registry would take their field classes with
// them and leave the factories half-alive.

import { describe, expect, it } from "vitest";
import { caps, node } from "../node.js";
import { Bounded, extentOf, footprint, type Shape } from "./bounded.js";

describe("Bounded", () => {
  it("atom.bounded.default-square — the plainest box there is, said out loud", () => {
    // A square, and it has to be stated rather than inferred: read as a claim about cards it
    // would say "elements are square", which is not what a 1×1 default means.
    expect(footprint(node("b1", Bounded()))).toEqual({ kind: "rect", w: 1, h: 1 });
  });

  it("atom.bounded.absent-is-not-zero — absent is not a zero box", () => {
    // "Occupies nothing" and "is not in the layout at all" are different answers, and a zero
    // rect would quietly give the first one to a node that meant the second.
    expect(footprint(node("b2"))).toBeUndefined();
  });

  it("atom.bounded.bounds-overrides — the instance overrules itself, and nothing else", () => {
    const n = node("b3", Bounded({ size: { kind: "rect", w: 1, h: 1 }, bounds: { kind: "rect", w: 3, h: 2 } }));
    expect(footprint(n)).toEqual({ kind: "rect", w: 3, h: 2 });
  });

  it("atom.bounded.needs-nothing — a box stands on a bare node", () => {
    expect(caps(node("b4", Bounded())).has("Bounded")).toBe(true);
  });

  it("atom.bounded.draws-nothing — a box on its own carries no look at all", () => {
    // Not "it draws an outline you can turn off": there is no fill, border or radius field
    // here to find. A frame belongs to a `surface` record, and the box is visible only to the
    // inspector and to a debug layer that does not exist yet.
    const fields = node("b5", Bounded()).atoms.get("Bounded")!.fields;
    expect(Object.keys(fields).sort()).toEqual(["bounds", "size"]);
  });

  it("atom.bounded.extent-circle — a round shape still answers with a box", () => {
    expect(extentOf({ kind: "circle", r: 1.5 })).toEqual({ w: 3, h: 3 });
  });

  it("atom.bounded.extent-poly — the axis-aligned span of the points", () => {
    const poly: Shape = {
      kind: "poly",
      points: [
        { x: -1, y: 0 },
        { x: 2, y: 0 },
        { x: 0, y: 4 },
      ],
    };
    expect(extentOf(poly)).toEqual({ w: 3, h: 4 });
  });

  it("atom.bounded.extent-empty — no points is no extent, not a crash", () => {
    expect(extentOf({ kind: "poly", points: [] })).toEqual({ w: 0, h: 0 });
  });
});
