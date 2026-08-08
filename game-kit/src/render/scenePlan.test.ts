// The plan is where every visual rule can still be held down by a test. Below it lies Pixi,
// which jsdom cannot run at all — so a rule that slips past this file is a rule nobody checks.

import { beforeEach, describe, expect, it } from "vitest";
import { Bounded } from "../core/atoms/bounded.js";
import { Container, registerLayout, resetLayouts } from "../core/atoms/container.js";
import { freeLayout, rowLayout } from "../core/atoms/layouts.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Transformable } from "../core/atoms/transformable.js";
import { add, node } from "../core/node.js";
import { DEFAULT_VIEWER } from "../core/viewer.js";
import { boundsMarks, originsOf, scenePlan } from "./scenePlan.js";
import { installStockSurfaces, registerSurface, resetSurfaces } from "./surfaces.js";

const box = (w: number, h: number) => Bounded({ size: { kind: "rect", w, h } });
const plan = (root: Parameters<typeof scenePlan>[0]["root"], unit = 100) =>
  scenePlan({ root, unit, width: 800, height: 600, viewer: DEFAULT_VIEWER });

beforeEach(() => {
  resetLayouts();
  registerLayout("free", freeLayout);
  registerLayout("row", rowLayout({ gap: 0 }));
  resetSurfaces();
  installStockSurfaces();
});

describe("scenePlan", () => {
  it("plan.a-box-alone-draws-nothing — the ladder's whole point", () => {
    // Not a faint outline, not a debug rectangle: nothing. The box is real and invisible.
    expect(plan(node("p1", box(1, 1)))).toEqual([]);
  });

  it("plan.surfaced-draws-one-quad — and exactly one", () => {
    expect(plan(node("p2", box(1, 1), Surfaced()))).toHaveLength(1);
  });

  it("plan.the-root-sits-in-the-middle — every catalog page assumes it", () => {
    const [quad] = plan(node("p3", box(1, 1), Surfaced()));
    expect([quad!.x, quad!.y]).toEqual([400, 300]);
  });

  it("plan.units-become-pixels-once — and every length is converted, not just the size", () => {
    // A single length left in units is right on one screen and wrong on the next. `plate` is
    // 0.03 units of border and 0.08 of radius, so at 100px per unit that is 3 and 8.
    const [quad] = plan(node("p4", box(2, 3), Surfaced()));
    expect(quad).toMatchObject({ w: 200, h: 300, borderWidth: 3, radius: 8 });
  });

  it("plan.an-unregistered-record-is-skipped — one bad name is not a dead scene", () => {
    const root = node("p5", Container({ layout: "free" }), Surfaced({ surface: "nosuch" }));
    add(root, node("p6", box(1, 1), Surfaced()));
    // The good node still draws; only the dangling reference is missing.
    expect(plan(root).map((q) => q.id)).toEqual(["p6"]);
  });

  it("plan.a-record-without-a-border-still-fills — re-styling does not move the box", () => {
    const withBorder = plan(node("p7", box(1, 1), Surfaced({ surface: "plate" })))[0]!;
    const without = plan(node("p8", box(1, 1), Surfaced({ surface: "bare" })))[0]!;
    expect(withBorder.border).toBeTruthy();
    expect(without.border).toBeUndefined();
    expect([without.w, without.h]).toEqual([withBorder.w, withBorder.h]);
  });

  it("plan.restyle-reaches-every-node-at-once — the reason a surface is a reference", () => {
    const root = node("p9", Container({ layout: "row" }), Surfaced());
    add(root, node("p10", box(1, 1), Surfaced({ surface: "plate" })));
    add(root, node("p11", box(1, 1), Surfaced({ surface: "plate" })));
    expect(plan(root).filter((q) => q.border).length).toBe(3);

    registerSurface("plate", { fill: "panelBg", radius: 0.08 });
    const after = plan(root);
    expect(after.filter((q) => q.border).length).toBe(0);
    // And nothing moved a pixel: the look went, the boxes stayed.
    expect(after.map((q) => [q.x, q.y, q.w, q.h])).toEqual(plan(root).map((q) => [q.x, q.y, q.w, q.h]));
  });

  it("plan.z-orders-the-paint — higher stands later, ties keep tree order", () => {
    const root = node("p12", Container({ layout: "free" }), Surfaced());
    add(root, node("p13", box(1, 1), Surfaced(), Transformable({ z: 5 })));
    add(root, node("p14", box(1, 1), Surfaced(), Transformable({ z: 1 })));
    expect(plan(root).map((q) => q.id)).toEqual(["p12", "p14", "p13"]);
  });

  it("plan.a-lifted-container-lifts-its-children — z adds up, and it shows here", () => {
    const root = node("p15", Container({ layout: "free" }), Transformable({ z: 10 }));
    const card = node("p16", box(1, 1), Surfaced(), Transformable({ z: 1 }));
    add(root, card);
    expect(plan(root)[0]!.z).toBe(11);
  });
});

describe("bounds marks", () => {
  const marks = (root: Parameters<typeof scenePlan>[0]["root"], debugBounds = true) =>
    boundsMarks({ root, unit: 100, width: 800, height: 600, viewer: { theme: "dark", debugBounds } });

  it("marks.off-by-default — tooling appears because somebody asked, never on its own", () => {
    expect(marks(node("m1", box(1, 1)), false)).toEqual([]);
  });

  it("marks.a-box-becomes-visible — the only way to see one", () => {
    // The whole reason the layer exists: `Bounded` paints nothing, so until this is switched
    // on the box has to be taken on trust.
    expect(marks(node("m2", box(1, 1))).map((m) => m.id)).toEqual(["m2"]);
  });

  it("marks.no-box-no-mark — a node with nothing to outline is not outlined", () => {
    const root = node("m3", Container({ layout: "free" }));
    add(root, node("m4"));
    expect(marks(root)).toEqual([]);
  });

  it("marks.a-rect-is-four-corners — in pixels, around where the node actually sits", () => {
    const [mark] = marks(node("m5", box(2, 1)));
    expect(mark!.points).toEqual([
      { x: 300, y: 250 },
      { x: 500, y: 250 },
      { x: 500, y: 350 },
      { x: 300, y: 350 },
    ]);
  });

  it("marks.a-circle-is-a-polygon — so nothing downstream reads a shape's sort", () => {
    // A renderer handed points has nothing to branch on, which is what keeps `guard.no-kind`
    // true now that a second thing draws.
    const round = Bounded({ size: { kind: "circle", r: 0.5 } });
    const [mark] = marks(node("m6", round));
    expect(mark!.points.length).toBeGreaterThan(8);
    for (const p of mark!.points) {
      expect(Math.hypot(p.x - 400, p.y - 300)).toBeCloseTo(50, 6);
    }
  });

  it("marks.a-poly-keeps-its-points — no bounding box stands in for the real outline", () => {
    const tri = Bounded({
      size: { kind: "poly", points: [{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }] },
    });
    expect(marks(node("m7", tri))[0]!.points).toEqual([
      { x: 300, y: 300 },
      { x: 500, y: 300 },
      { x: 400, y: 400 },
    ]);
  });

  it("marks.follow-the-layout — an outline sits where the node was PLACED", () => {
    const root = node("m8", Container({ layout: "row" }));
    add(root, node("m9", box(1, 1)));
    add(root, node("m10", box(1, 1)));
    // The first point is the top-LEFT corner, so two 1×1 boxes side by side start at 300 and
    // 400 — their centres are 350 and 450.
    const xs = marks(root).map((m) => m.points[0]!.x);
    expect(xs).toEqual([300, 400]);
  });

  it("marks.bounds-override-is-what-is-drawn — the outline tells the truth about the box", () => {
    const n = node("m11", Bounded({ size: { kind: "rect", w: 1, h: 1 }, bounds: { kind: "rect", w: 3, h: 1 } }));
    const [first, , third] = marks(n)[0]!.points;
    expect(third!.x - first!.x).toBe(300);
  });
});

describe("origins", () => {
  it("origins.child-is-owner-plus-layout — read top-down, in one pass", () => {
    const root = node("o1", Container({ layout: "free" }), Transformable({ at: { x: 2, y: 0 } }));
    const child = node("o2", Transformable({ at: { x: 1, y: 1 } }));
    add(root, child);
    expect(originsOf(root).get("o2")).toEqual({ x: 3, y: 1 });
  });

  it("origins.a-placing-layout-wins — the child's own pose is overridden, not added to", () => {
    const root = node("o3", Container({ layout: "row" }));
    add(root, node("o4", box(1, 1), Transformable({ at: { x: 50, y: 50 } })));
    expect(originsOf(root).get("o4")).toEqual({ x: 0, y: 0 });
  });

  it("origins.deep-chain — every level adds its own offset", () => {
    const root = node("o5", Container({ layout: "free" }));
    const mid = node("o6", Container({ layout: "free" }), Transformable({ at: { x: 1, y: 0 } }));
    const leaf = node("o7", Transformable({ at: { x: 0, y: 2 } }));
    add(root, mid);
    add(mid, leaf);
    expect(originsOf(root).get("o7")).toEqual({ x: 1, y: 2 });
  });
});
