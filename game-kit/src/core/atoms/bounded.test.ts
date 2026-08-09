// Ids follow docs/test-plan/ — one file per layer — a failing id names the scenario and the state.
//
// No `resetAtoms()` here, unlike the stand-in suites: these are the REAL atoms, registered
// when their module is imported. Clearing the registry would take their field classes with
// them and leave the factories half-alive.

import { describe, expect, it } from "vitest";
import { caps, fieldsOf, node } from "../node.js";
import { Surfaced, type SurfacedFields } from "./surfaced.js";
import { placeChildren } from "./container.js";
import { Bounded, extentOf, footprint, outlineOf, type Shape } from "./bounded.js";
import { circle, polyline, rect } from "../shapes.js";

describe("Bounded", () => {
  it("atom.bounded.default-square — the plainest box there is, said out loud", () => {
    // A square, and it has to be stated rather than inferred: read as a claim about cards it
    // would say "elements are square", which is not what a 1×1 default means.
    expect(footprint(node("b1", Bounded()))).toEqual(rect(1, 1 ));
  });

  it("atom.bounded.absent-is-not-zero — absent is not a zero box", () => {
    // "Occupies nothing" and "is not in the layout at all" are different answers, and a zero
    // rect would quietly give the first one to a node that meant the second.
    expect(footprint(node("b2"))).toBeUndefined();
  });

  it("atom.bounded.one-field — the box is asked for through one door, and there is one shape behind it", () => {
    // There were two, `size` and an overriding `bounds`. Nothing ever read `size`: this
    // accessor was the only way in and it always answered the override when there was one.
    // Two fields with one observable meaning, and a catalog page teaching a distinction that
    // did not exist. Guarded here rather than left to prose — the pair took a reader a minute
    // to see through, and it had been in the model for weeks.
    const n = node("b3", Bounded({ bounds: rect(3, 2 ) }));
    expect(footprint(n)).toEqual(rect(3, 2 ));
    expect(Object.keys(n.atoms.get("Bounded")!.fields)).toEqual(["bounds"]);
  });

  it("atom.bounded.zero-is-a-box — an area of nothing is a legal shape", () => {
    // A point: an anchor a card flies to, a marker a layout still places. It is NOT the same
    // answer as a node without the atom, and the pair below is the whole distinction — one
    // occupies nothing, the other is not in the layout to be asked.
    expect(extentOf(footprint(node("b6", Bounded({ bounds: rect(0, 0) })))!)).toEqual({ w: 0, h: 0 });
    expect(footprint(node("b7"))).toBeUndefined();
  });

  it("atom.bounded.needs-nothing — a box stands on a bare node", () => {
    expect(caps(node("b4", Bounded())).has("Bounded")).toBe(true);
  });

  it("atom.bounded.draws-nothing — a box on its own carries no look at all", () => {
    // Not "it draws an outline you can turn off": there is no fill, border or radius field
    // here to find. A frame belongs to a `surface` record, and the box is visible only to the
    // inspector and to a debug layer that does not exist yet.
    const fields = node("b5", Bounded()).atoms.get("Bounded")!.fields;
    expect(Object.keys(fields)).toEqual(["bounds"]);
  });

  it("atom.bounded.extent-circle — a round shape still answers with a box", () => {
    expect(extentOf(circle(1.5))).toEqual({ w: 3, h: 3 });
  });

  it("atom.bounded.extent-poly — the axis-aligned span of the points", () => {
    const poly: Shape = polyline([
      { x: -1, y: 0 },
      { x: 2, y: 0 },
      { x: 0, y: 4 },
    ]);
    expect(extentOf(poly)).toEqual({ w: 3, h: 4 });
  });

  it("atom.bounded.extent-empty — no points is no extent, not a crash", () => {
    expect(extentOf(polyline([]))).toEqual({ w: 0, h: 0 });
  });
});

describe("Bounded · a path is a curve", () => {
  // Two cubics closing on themselves: the shape the kit had no way to say until now. A polygon
  // is not a substitute — an arch or a swoosh drawn as straight runs is either visibly faceted
  // or a hundred points nobody can edit, and both showed up the first afternoon anyone drew
  // with it.
  const lens: Shape = {
    start: { x: 1, y: 0 },
    segments: [
      { c1: { x: 0.4, y: 0.6 }, c2: { x: -0.4, y: 0.6 }, to: { x: -1, y: 0 } },
      { c1: { x: -0.4, y: -0.6 }, c2: { x: 0.4, y: -0.6 }, to: { x: 1, y: 0 } },
    ],
  };

  it("atom.bounded.path-flattens-to-points — the consumers below never learn a second primitive", () => {
    // Exactly what already happens to a circle. A renderer handed points has nothing to branch
    // on, which is the rule that lets a debug layer, a dash walk and a second renderer all be
    // written without one of them growing a curve case.
    const points = outlineOf(lens);
    expect(points.length).toBeGreaterThan(20);
    for (const p of points) expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });

  it("atom.bounded.path-does-not-repeat-its-start — a closed region closes itself", () => {
    const points = outlineOf(lens);
    const first = points[0]!;
    const last = points[points.length - 1]!;
    // A duplicated point is a zero-length edge, and a zero-length edge is a corner with no
    // direction — which is precisely what the rounding and the dash walk cannot make sense of.
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeGreaterThan(1e-6);
  });

  it("atom.bounded.path-splits-where-it-turns — adaptive, not a fixed count", () => {
    // A fixed count spends the same points on a gentle bend as on a tight one: faceted where
    // the eye is looking, wasteful where it is not.
    const gentle: Shape = {
      start: { x: -1, y: 0 },
      segments: [
        { c1: { x: -0.4, y: 0.05 }, c2: { x: 0.4, y: 0.05 }, to: { x: 1, y: 0 } },
        { to: { x: -1, y: 0.02 } },
      ],
    };
    expect(outlineOf(lens).length).toBeGreaterThan(outlineOf(gentle).length);
  });

  it("atom.bounded.path-extent-follows-the-curve-not-the-handles", () => {
    // A handle can sit well outside the curve it pulls. Measured on the handles, the layout
    // would space this shape as though it were half again as tall as it draws.
    const { w, h } = extentOf(lens);
    expect(w).toBeCloseTo(2, 2);
    // The handles reach y = ±0.6; a cubic only ever reaches three quarters of that.
    expect(h).toBeLessThan(1.0);
    expect(h).toBeGreaterThan(0.8);
  });
  it("atom.bounded.own-field — the footprint is this node's field and nobody else's", () => {
    // A set record stamps a box at birth and is then out of the picture: the value lives on the
    // node. Two nodes made from one record diverge the moment either is edited, which is the
    // only behaviour that lets a game move ONE card without moving its twin.
    const a = node("bo1", Bounded({ bounds: rect(3, 2) }));
    const b = node("bo2", Bounded({ bounds: rect(3, 2) }));
    expect(footprint(a)).toEqual(footprint(b));
    expect(a.atoms.get("Bounded")!.fields).not.toBe(b.atoms.get("Bounded")!.fields);
  });

  it("atom.bounded.per-record — one look, two boxes", () => {
    // A king and a pawn wear the same surface and are not the same size. The box is declared per
    // NODE and the look is a name pointing at a shared record — tie the two together and every
    // piece in a set is forced to the same footprint.
    const king = node("bo3", Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: "plate" }));
    const pawn = node("bo4", Bounded({ bounds: rect(0.6, 0.6) }), Surfaced({ surface: "plate" }));
    expect(footprint(king)).not.toEqual(footprint(pawn));
    expect(fieldsOf<SurfacedFields>(king, "Surfaced")!.surface).toBe(
      fieldsOf<SurfacedFields>(pawn, "Surfaced")!.surface,
    );
  });

  it("atom.bounded.clamp-not-here — a box is about itself, never about what it holds", () => {
    // Keeping a child inside its owner is an owner's job, and the owner for that is `Container`:
    // it is the atom that knows there ARE children. A `clampChildren` on `Bounded` would give a
    // lone card an opinion about a family it does not have.
    const alone = node("bo5", Bounded({ bounds: rect(1, 1) }));
    expect(Object.keys(alone.atoms.get("Bounded")!.fields)).toEqual(["bounds"]);
    expect(caps(alone).has("Container")).toBe(false);
    expect(placeChildren(alone).size).toBe(0);
  });
});
