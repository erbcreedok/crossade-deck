import { beforeEach, describe, expect, it } from "vitest";
import { add, node } from "../core/node.js";
import { Bounded } from "../core/atoms/bounded.js";
import { Container, placeChildren, registerLayout, resetLayouts } from "../core/atoms/container.js";
import { Transformable } from "../core/atoms/transformable.js";
import { gridLayout, radialLayout, slotsLayout } from "./layouts.js";
import { rect } from "./shapes.js";

// Placed through a real tree, not by calling `place` with hand-built children: what these
// presets promise is what a CONTAINER does with them, footprints and fallbacks included.

const box = (w: number, h: number) => Bounded({ bounds: rect(w, h) });

beforeEach(() => resetLayouts());

describe("gridLayout", () => {
  it("preset.grid.reading-order — left to right first, then the next row down", () => {
    registerLayout("grid", gridLayout({ columns: 2 }));
    const root = node("g1", Container({ layout: "grid" }));
    ["a", "b", "c", "d"].forEach((id) => add(root, node(`g1${id}`, box(1, 1))));
    const placed = placeChildren(root);
    expect(placed.get("g1a")).toEqual({ x: -0.5, y: -0.5 });
    expect(placed.get("g1b")).toEqual({ x: 0.5, y: -0.5 });
    expect(placed.get("g1c")).toEqual({ x: -0.5, y: 0.5 });
    expect(placed.get("g1d")).toEqual({ x: 0.5, y: 0.5 });
  });

  it("preset.grid.tracks-fit-their-largest — one wide member widens the whole column", () => {
    // The grid fits its members rather than cutting them to a constant: a 2-wide card in the
    // first column pushes the WHOLE second column outward, including the row it is not in.
    registerLayout("grid", gridLayout({ columns: 2 }));
    const root = node("g2", Container({ layout: "grid" }));
    add(root, node("g2wide", box(2, 1)));
    add(root, node("g2b", box(1, 1)));
    add(root, node("g2c", box(1, 1)));
    const placed = placeChildren(root);
    // Columns 2 and 1 wide, total 3: middles at −0.5 and 1.
    expect(placed.get("g2b")).toEqual({ x: 1, y: -0.5 });
    expect(placed.get("g2c")!.x).toBe(-0.5); // the narrow card centres in the wide column
  });

  it("preset.grid.a-cell-is-an-address — the partial last row keeps its columns", () => {
    // Three children on a 2-wide grid: the third stands under the FIRST column, not recentred
    // between the two. A card that moves when its neighbour leaves is a card the reader loses.
    registerLayout("grid", gridLayout({ columns: 2 }));
    const root = node("g3", Container({ layout: "grid" }));
    ["a", "b", "c"].forEach((id) => add(root, node(`g3${id}`, box(1, 1))));
    expect(placeChildren(root).get("g3c")!.x).toBe(placeChildren(root).get("g3a")!.x);
  });

  it("preset.grid.gap-stands-between-tracks — N tracks get N−1 gaps, on both axes", () => {
    registerLayout("grid", gridLayout({ columns: 2, gap: 0.5 }));
    const root = node("g4", Container({ layout: "grid" }));
    ["a", "b", "c", "d"].forEach((id) => add(root, node(`g4${id}`, box(1, 1))));
    const placed = placeChildren(root);
    expect(placed.get("g4b")!.x - placed.get("g4a")!.x).toBeCloseTo(1.5, 9);
    expect(placed.get("g4c")!.y - placed.get("g4a")!.y).toBeCloseTo(1.5, 9);
  });

  it("preset.grid.items-move-within-their-cell — justify and align spend no track space", () => {
    // A small card in a track widened by a big neighbour: `start` presses it to the cell's
    // left/top edge, `end` to the opposite one — and the tracks themselves do not move.
    const at = (justifyItems: "start" | "end", alignItems: "start" | "end") => {
      resetLayouts();
      registerLayout("grid", gridLayout({ columns: 2, justifyItems, alignItems }));
      const root = node(`g5-${justifyItems}-${alignItems}`, Container({ layout: "grid" }));
      add(root, node("g5small", box(1, 1)));
      add(root, node("g5tall", box(2, 3)));
      return placeChildren(root).get("g5small")!;
    };
    // Tracks: column 1 wide (small alone), row 3 tall (the neighbour). Cell middle x = −1, so
    // justify cannot move the small card across — its cell is exactly its width. Down the cell
    // it has a unit of room each way: (1−3)/2 = ∓1 off the row middle at 0.
    expect(at("start", "start")).toEqual({ x: -1, y: -1 });
    expect(at("end", "end")).toEqual({ x: -1, y: 1 });
  });

  it("preset.grid.columns-below-one-clamp-to-one — zero and negative both give a single column", () => {
    // `Math.max(1, Math.floor(columns))` is the guard: a column count under one cannot make a
    // grid with no columns (a divide-by-zero waiting to happen), so it clamps to one. The result
    // is an honest vertical stack, not a throw and not an empty answer.
    const stack = (columns: number) => {
      resetLayouts();
      registerLayout("grid", gridLayout({ columns }));
      const root = node(`gz-${columns}`, Container({ layout: "grid" }));
      ["a", "b", "c"].forEach((id) => add(root, node(`gz${columns}${id}`, box(1, 1))));
      return placeChildren(root);
    };
    // One column, three unit rows: middles at −1, 0, 1 down the y-axis, all at x 0.
    expect(stack(0).get("gz0a")).toEqual({ x: 0, y: -1 });
    expect(stack(0).get("gz0c")).toEqual({ x: 0, y: 1 });
    expect(stack(-3).get("gz-3a")).toEqual({ x: 0, y: -1 }); // negative clamps the same way
  });

  it("preset.grid.fractional-columns-floor-to-whole — 2.7 columns is 2, not 3 and not a fraction", () => {
    // A cell count is a whole thing; `Math.floor` drops the fraction rather than rounding or
    // erroring. 2.7 lays out exactly as 2 would — the same reading order, the same seams.
    registerLayout("grid", gridLayout({ columns: 2.7 }));
    const root = node("gf1", Container({ layout: "grid" }));
    ["a", "b", "c", "d"].forEach((id) => add(root, node(`gf1${id}`, box(1, 1))));
    const placed = placeChildren(root);
    expect(placed.get("gf1a")).toEqual({ x: -0.5, y: -0.5 });
    expect(placed.get("gf1b")).toEqual({ x: 0.5, y: -0.5 });
    expect(placed.get("gf1c")).toEqual({ x: -0.5, y: 0.5 }); // wrapped after two, as a 2-grid does
  });

  it("preset.grid.empty-is-a-no-op — no children, no places, no throw", () => {
    // The degenerate tree, the one where the row/column track loops run zero times: it must
    // produce nothing rather than divide by an empty track set.
    registerLayout("grid", gridLayout({ columns: 2 }));
    const root = node("ge1", Container({ layout: "grid" }));
    expect(placeChildren(root).size).toBe(0);
  });
});

describe("slotsLayout", () => {
  it("preset.slots.taken-in-tree-order — seat one goes to the first child", () => {
    registerLayout("seats", slotsLayout({ slots: [{ x: -2, y: 0 }, { x: 2, y: 1 }] }));
    const root = node("s1", Container({ layout: "seats" }));
    add(root, node("s1a", box(1, 1)));
    add(root, node("s1b", box(1, 1)));
    expect(placeChildren(root).get("s1a")).toEqual({ x: -2, y: 0 });
    expect(placeChildren(root).get("s1b")).toEqual({ x: 2, y: 1 });
  });

  it("preset.slots.overflow-keeps-its-own-pose — a seventh guest is not a crash", () => {
    // A child beyond the slots is answered `undefined`: its own pose stands, exactly as under
    // `free`, and the children that DID fit do not shuffle to absorb it.
    registerLayout("seats", slotsLayout({ slots: [{ x: -2, y: 0 }] }));
    const root = node("s2", Container({ layout: "seats" }));
    add(root, node("s2a", box(1, 1)));
    add(root, node("s2late", box(1, 1), Transformable({ at: { x: 5, y: 5 } })));
    expect(placeChildren(root).get("s2a")).toEqual({ x: -2, y: 0 });
    expect(placeChildren(root).get("s2late")).toEqual({ x: 5, y: 5 });
  });

  it("preset.slots.empty-slots-keep-every-pose — no seats means the layout becomes `free`", () => {
    // The overflow rule taken to its limit: with an empty slot list EVERY child is beyond the
    // seats, so every child is answered `undefined` and keeps its own pose. A slots layout with
    // nothing prepared degrades exactly into the canvas, not into a pile at the origin.
    registerLayout("seats", slotsLayout({ slots: [] }));
    const root = node("se1", Container({ layout: "seats" }));
    add(root, node("se1a", box(1, 1), Transformable({ at: { x: 1, y: 1 } })));
    add(root, node("se1b", box(1, 1), Transformable({ at: { x: 2, y: 2 } })));
    expect(placeChildren(root).get("se1a")).toEqual({ x: 1, y: 1 });
    expect(placeChildren(root).get("se1b")).toEqual({ x: 2, y: 2 });
  });

  it("preset.slots.spare-slots-go-unused — more seats than guests leaves the extra seats empty", () => {
    // The other imbalance: three seats, one guest. The guest takes seat one and the two spare
    // seats simply do nothing — a slot is offered, never forced, so there is no phantom to place.
    registerLayout("seats", slotsLayout({ slots: [{ x: -2, y: 0 }, { x: 2, y: 0 }, { x: 5, y: 5 }] }));
    const root = node("sp1", Container({ layout: "seats" }));
    add(root, node("sp1a", box(1, 1)));
    const placed = placeChildren(root);
    expect(placed.get("sp1a")).toEqual({ x: -2, y: 0 });
    expect(placed.size).toBe(1); // the two spare seats produced no entries
  });
});

describe("radialLayout", () => {
  it("preset.radial.the-full-circle-shares-evenly — and no doubled seat at the seam", () => {
    // Four at radius 1 from twelve o'clock, clockwise: top, right, bottom, left. Screen y runs
    // down, so "top" is −y — the same sense `Transformable.angle` turns.
    registerLayout("table", radialLayout({ radius: 1 }));
    const root = node("r1", Container({ layout: "table" }));
    ["a", "b", "c", "d"].forEach((id) => add(root, node(`r1${id}`, box(0.2, 0.2))));
    const placed = placeChildren(root);
    expect(placed.get("r1a")!.x).toBeCloseTo(0, 9);
    expect(placed.get("r1a")!.y).toBeCloseTo(-1, 9);
    expect(placed.get("r1b")!.x).toBeCloseTo(1, 9);
    expect(placed.get("r1b")!.y).toBeCloseTo(0, 9);
    expect(placed.get("r1d")!.x).toBeCloseTo(-1, 9);
  });

  it("preset.radial.an-arc-is-walked-end-to-end — the fan's fencepost, not the circle's", () => {
    // Three across 180° starting at −90°: left, top, right — both ends TAKEN, where the full
    // circle would stop a step short of the seam.
    registerLayout("arc", radialLayout({ radius: 2, start: -90, sweep: 180 }));
    const root = node("r2", Container({ layout: "arc" }));
    ["a", "b", "c"].forEach((id) => add(root, node(`r2${id}`, box(0.2, 0.2))));
    const placed = placeChildren(root);
    expect(placed.get("r2a")!.x).toBeCloseTo(-2, 9);
    expect(placed.get("r2b")!.y).toBeCloseTo(-2, 9);
    expect(placed.get("r2c")!.x).toBeCloseTo(2, 9);
  });

  it("preset.radial.a-seat-is-a-point — facing the middle is the child's own angle", () => {
    // The place answer carries no rotation BY TYPE, so the only thing to pin at runtime is
    // that a lone guest stands where `start` says and the tree was not written to.
    registerLayout("table", radialLayout({ radius: 1, start: 90 }));
    const root = node("r3", Container({ layout: "table" }));
    const guest = node("r3a", box(0.2, 0.2), Transformable({ at: { x: 9, y: 9 } }));
    add(root, guest);
    const placed = placeChildren(root).get("r3a")!;
    expect(placed.x).toBeCloseTo(1, 9);
    expect(placed.y).toBeCloseTo(0, 9);
  });

  it("preset.radial.zero-radius-stacks-at-the-origin — every seat collapses onto one point", () => {
    // Radius scales the sin/cos, so a radius of zero puts every child at {0,0} — a legal degenerate
    // circle, a stack. No throw, no NaN: the angles are still computed, they just land nowhere.
    registerLayout("table", radialLayout({ radius: 0 }));
    const root = node("rz1", Container({ layout: "table" }));
    ["a", "b", "c", "d"].forEach((id) => add(root, node(`rz1${id}`, box(0.2, 0.2))));
    const placed = placeChildren(root);
    for (const id of ["a", "b", "c", "d"]) {
      expect(placed.get(`rz1${id}`)!.x).toBeCloseTo(0, 9);
      expect(placed.get(`rz1${id}`)!.y).toBeCloseTo(0, 9);
    }
  });

  it("preset.radial.zero-sweep-stacks-on-one-seat — no arc means everyone at the start angle", () => {
    // Sweep of zero over several children: the step is 0/(n−1) = 0, so every child sits at `start`.
    // The seats overlap on a single point of the circle — degenerate, but deterministic and silent.
    registerLayout("arc", radialLayout({ radius: 1, sweep: 0 }));
    const root = node("rs1", Container({ layout: "arc" }));
    ["a", "b", "c"].forEach((id) => add(root, node(`rs1${id}`, box(0.2, 0.2))));
    const placed = placeChildren(root);
    for (const id of ["a", "b", "c"]) {
      expect(placed.get(`rs1${id}`)!.x).toBeCloseTo(0, 9); // start 0 → twelve o'clock
      expect(placed.get(`rs1${id}`)!.y).toBeCloseTo(-1, 9);
    }
  });

  it("preset.radial.negative-radius-mirrors — a radius below zero flips the seat through the centre", () => {
    // Nothing forbids a negative radius; it just multiplies sin/cos by a negative, mirroring the
    // point through the origin. The lone child that would sit ABOVE at radius 1 sits BELOW at −1.
    registerLayout("table", radialLayout({ radius: -1 }));
    const root = node("rn1", Container({ layout: "table" }));
    add(root, node("rn1a", box(0.2, 0.2)));
    const placed = placeChildren(root).get("rn1a")!;
    expect(placed.x).toBeCloseTo(0, 9);
    expect(placed.y).toBeCloseTo(1, 9); // +y is DOWN the screen — mirrored from the usual −1
  });

  it("preset.radial.nan-radius-poisons-the-seat — garbage radius flows through to NaN, no guard", () => {
    // The preset shares the core's trait: no `Number.isFinite` check. A NaN radius makes both
    // coordinates NaN and the call still returns — a poisoned point, not a thrown error.
    registerLayout("table", radialLayout({ radius: NaN }));
    const root = node("rp1", Container({ layout: "table" }));
    add(root, node("rp1a", box(0.2, 0.2)));
    const placed = placeChildren(root).get("rp1a")!;
    expect(Number.isNaN(placed.x)).toBe(true);
    expect(Number.isNaN(placed.y)).toBe(true);
  });
});
