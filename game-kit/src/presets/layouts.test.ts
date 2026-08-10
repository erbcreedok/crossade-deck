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
});
