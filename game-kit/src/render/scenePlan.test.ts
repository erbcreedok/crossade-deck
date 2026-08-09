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
import { apply, IDENTITY } from "../core/transform.js";
import { bakePlan, boundsMarks, gridMarks, scenePlan, transformsOf } from "./scenePlan.js";
import { registerAsset } from "./assets.js";
import { installStockSurfaces, registerSurface, resetSurfaces } from "./surfaces.js";
import { circle, polyline, rect } from "../core/shapes.js";
import { inspect } from "../core/inspect.js";

const box = (w: number, h: number) => Bounded({ bounds: rect(w, h) });
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
    // 0.03 units of stroke, so at 100px per unit that is 3.
    const [quad] = plan(node("p4", box(2, 3), Surfaced()));
    expect(quad).toMatchObject({ w: 200, h: 300 });
    expect(quad!.stroke!.width).toBe(3);
  });

  it("plan.the-contour-comes-down-as-points — the renderer has nothing to branch on", () => {
    // Handing down w/h/radius is what made every shape but a rectangle come out rectangular,
    // however carefully the model described it.
    const round = Bounded({ bounds: circle(0.5) });
    // BAKED, because the points a plan hands down are in the node's own space now — the pose is
    // a matrix beside them, and baking is what folds the two together.
    const [quad] = bakePlan(plan(node("p4b", round, Surfaced({ surface: "bare" }))));
    expect(quad!.points.length).toBeGreaterThan(8);
    // Two decimals, not six: a circle is four cubics now, and a cubic approximation of one is
    // accurate to about three parts in ten thousand — a hundredth of a pixel at this size, and
    // the same error every drawing program ships.
    for (const pt of quad!.points) expect(Math.hypot(pt.x - 400, pt.y - 300)).toBeCloseTo(50, 1);
  });

  it("plan.the-radius-rounds-the-contour-not-the-box — paint is not a place", () => {
    // `plate` carries a radius, so its contour has more than four points; the debug outline of
    // the same node keeps the box's sharp corners, because it reports where the box IS.
    const n = node("p4c", box(1, 1), Surfaced({ surface: "plate" }));
    expect(plan(n)[0]!.points.length).toBeGreaterThan(4);
    expect(boundsMarks({ root: n, unit: 100, width: 800, height: 600, viewer: { theme: "dark", debugBounds: true } })[0]!.points).toHaveLength(4);
  });

  it("plan.a-dashed-stroke-arrives-already-cut — as geometry, never as a texture", () => {
    // A textured dash loses joins and caps and its length drifts with the angle of the side it
    // runs along, so a rectangle comes out with shorter dashes on one pair of sides.
    const [quad] = plan(node("p4d", box(2, 2), Surfaced({ surface: "zone" })));
    expect(quad!.stroke!.dashes!.length).toBeGreaterThan(4);
    // A solid stroke says so by ABSENCE, which is not the same as an empty list: an empty list
    // is a pattern that produced no dashes and must draw nothing.
    expect(plan(node("p4e", box(2, 2), Surfaced({ surface: "plate" })))[0]!.stroke!.dashes).toBeUndefined();
  });

  it("plan.layers-come-down-in-order — bottom first, opacity resolved", () => {
    registerSurface("stack", { layers: [{ paint: "sunkBg" }, { paint: "accent", opacity: 0.4 }] });
    const [quad] = plan(node("p4f", box(1, 1), Surfaced({ surface: "stack" })));
    expect(quad!.layers).toEqual([
      { paint: "sunkBg", image: undefined, opacity: 1 },
      { paint: "accent", image: undefined, opacity: 0.4 },
    ]);
  });

  it("plan.an-unregistered-record-is-skipped — one bad name is not a dead scene", () => {
    const root = node("p5", Container({ layout: "free" }), Surfaced({ surface: "nosuch" }));
    add(root, node("p6", box(1, 1), Surfaced()));
    // The good node still draws; only the dangling reference is missing.
    expect(plan(root).map((q) => q.id)).toEqual(["p6"]);
  });

  it("plan.a-record-without-a-stroke-still-fills — re-styling does not move the box", () => {
    const withBorder = plan(node("p7", box(1, 1), Surfaced({ surface: "plate" })))[0]!;
    const without = plan(node("p8", box(1, 1), Surfaced({ surface: "bare" })))[0]!;
    expect(withBorder.stroke).toBeTruthy();
    expect(without.stroke).toBeUndefined();
    expect([without.w, without.h]).toEqual([withBorder.w, withBorder.h]);
  });

  it("plan.restyle-reaches-every-node-at-once — the reason a surface is a reference", () => {
    const root = node("p9", Container({ layout: "row" }), Surfaced());
    add(root, node("p10", box(1, 1), Surfaced({ surface: "plate" })));
    add(root, node("p11", box(1, 1), Surfaced({ surface: "plate" })));
    expect(plan(root).filter((q) => q.stroke).length).toBe(3);

    registerSurface("plate", { layers: [{ paint: "panelBg" }], radius: 0.08 });
    const after = plan(root);
    expect(after.filter((q) => q.stroke).length).toBe(0);
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
    // The outline plus the two strokes of the origin cross — one node, three marks.
    const drawn = marks(node("m2", box(1, 1)));
    expect(drawn.map((m) => m.id)).toEqual(["m2", "m2", "m2"]);
    expect(drawn.filter((m) => m.closed)).toHaveLength(1);
  });


  it("marks.the-origin-is-drawn — the point everything is measured from", () => {
    // A rect is built around its own centre, so its origin IS the centre. A path is not: it
    // carries whatever coordinates its author wrote, and a pasted shape can sit far off its
    // own origin with nothing on screen to say so. The first anyone would learn of it is the
    // shape flying off on its first rotation.
    const offset = node("m12", Bounded({ bounds: polyline([
      { x: 2, y: 2 },
      { x: 3, y: 2 },
      { x: 3, y: 3 },
    ]) }));
    const cross = marks(offset).filter((m) => !m.closed);
    expect(cross).toHaveLength(2);
    // Both arms meet at the ORIGIN — the middle of the view here — not at the middle of the box.
    for (const arm of cross) {
      const mid = { x: (arm.points[0]!.x + arm.points[1]!.x) / 2, y: (arm.points[0]!.y + arm.points[1]!.y) / 2 };
      expect(mid.x).toBeCloseTo(400, 6);
      expect(mid.y).toBeCloseTo(300, 6);
    }
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
    const round = Bounded({ bounds: circle(0.5 ) });
    const [mark] = marks(node("m6", round));
    expect(mark!.points.length).toBeGreaterThan(8);
    for (const p of mark!.points) {
      expect(Math.hypot(p.x - 400, p.y - 300)).toBeCloseTo(50, 1);
    }
  });

  it("marks.a-poly-keeps-its-points — no bounding box stands in for the real outline", () => {
    const tri = Bounded({
      bounds: polyline([{ x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]),
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
    const xs = marks(root)
      .filter((m) => m.closed)
      .map((m) => m.points[0]!.x);
    expect(xs).toEqual([300, 400]);
  });

  it("marks.follow-the-field — the outline is the box, not a square standing in for it", () => {
    const n = node("m11", Bounded({ bounds: rect(3, 1 ) }));
    const [first, , third] = marks(n)[0]!.points;
    expect(third!.x - first!.x).toBe(300);
  });
});

describe("origins", () => {
  // The map holds a TRANSFORM per node now, not a point: a child of a turned hand is placed AND
  // turned, and a sum could only ever say the first half. Where a test wants the position, it
  // asks the transform where the node's own origin lands.
  const origin = (all: ReturnType<typeof transformsOf>, id: string) => {
    const t = all.get(id);
    return t ? apply(t, { x: 0, y: 0 }) : undefined;
  };

  it("origins.child-is-owner-plus-layout — read top-down, in one pass", () => {
    const root = node("o1", Container({ layout: "free" }), Transformable({ at: { x: 2, y: 0 } }));
    const child = node("o2", Transformable({ at: { x: 1, y: 1 } }));
    add(root, child);
    expect(origin(transformsOf(root), "o2")).toEqual({ x: 3, y: 1 });
  });

  it("origins.a-placing-layout-wins — the child's own pose is overridden, not added to", () => {
    const root = node("o3", Container({ layout: "row" }));
    add(root, node("o4", box(1, 1), Transformable({ at: { x: 50, y: 50 } })));
    expect(origin(transformsOf(root), "o4")).toEqual({ x: 0, y: 0 });
  });

  it("origins.deep-chain — every level adds its own offset", () => {
    const root = node("o5", Container({ layout: "free" }));
    const mid = node("o6", Container({ layout: "free" }), Transformable({ at: { x: 1, y: 0 } }));
    const leaf = node("o7", Transformable({ at: { x: 0, y: 2 } }));
    add(root, mid);
    add(mid, leaf);
    expect(origin(transformsOf(root), "o7")).toEqual({ x: 1, y: 2 });
  });
});

describe("the coordinate grid", () => {
  const grid = (unit = 100, debugGrid = true, width = 800, height = 600) =>
    gridMarks({ root: node("g0"), unit, width, height, viewer: { theme: "dark", debugGrid } });

  it("grid.off-by-default — a ruler is reached for, never opened on", () => {
    // Unlike the box outline, no section's lesson is invisible without it.
    expect(grid(100, false)).toEqual([]);
  });

  const units = (marks: readonly { paint: string }[]) => marks.filter((m) => m.paint === "grid");
  const tenths = (marks: readonly { paint: string }[]) => marks.filter((m) => m.paint === "gridMinor");

  it("grid.one-line-per-unit — that is the whole claim", () => {
    // 800 wide at 100px per unit: the centre line plus four each way. Same down the other axis.
    const verticals = units(grid()).filter((m: any) => m.points[0].x === m.points[1].x);
    expect(verticals).toHaveLength(9);
    const xs = verticals.map((m: any) => m.points[0].x).sort((a: number, b: number) => a - b);
    for (let i = 1; i < xs.length; i += 1) expect(xs[i]! - xs[i - 1]!).toBeCloseTo(100, 6);
  });

  it("grid.tenths-are-lines-too — but never the same line", () => {
    // Ruled across like the units, so a width can be read wherever the shape happens to be —
    // and quieter, or the reader counts eleven lines where there are two kinds and the scale
    // stops being one.
    const small = tenths(grid());
    expect(small.length).toBeGreaterThan(units(grid()).length);
    for (const m of small as any[]) {
      expect(m.width).toBeLessThan(1);
      // Full width or full height: a subdivision that stopped at the axis would be a scale to
      // carry to the shape by eye rather than a grid to read against it.
      const spans = (m.points[0].y === 0 && m.points[1].y === 600) || (m.points[0].x === 0 && m.points[1].x === 800);
      expect(spans).toBe(true);
    }
    // And never on top of a whole unit, which already has its own stronger line.
    const unitXs = new Set(units(grid()).map((m: any) => m.points[0].x));
    for (const m of small as any[]) {
      if (m.points[0].x === m.points[1].x) expect(unitXs.has(m.points[0].x)).toBe(false);
    }
  });

  it("grid.tenths-go-when-they-stop-being-readable — a line nobody can resolve is ink", () => {
    // At 50px to the unit a tenth is 5px apart. The whole units are still worth drawing; the
    // subdivision is not, and drawing it anyway would smear the view into a grey field.
    expect(tenths(grid(50))).toEqual([]);
    expect(units(grid(50)).length).toBeGreaterThan(0);
  });

  it("grid.is-ruled-from-the-origin — not from a corner", () => {
    // The lines have to cross where a node with no pose sits, or the zero of the ruler is
    // somewhere no measurement starts from.
    const xs = grid().map((m) => m.points[0]!.x);
    const ys = grid().map((m) => m.points[0]!.y);
    expect(xs).toContain(400);
    expect(ys).toContain(300);
  });

  it("grid.follows-the-etalon — it measures units, so it moves when a unit does", () => {
    expect(units(grid(50)).length).toBeGreaterThan(units(grid(100)).length);
  });

  it("grid.own-ink-and-never-the-box-outline — two layers, told apart at a glance", () => {
    // Drawn in the outline's colour it would be a ruler in the same ink as the thing it is
    // there to measure, and switching both on would be useless.
    for (const mark of grid()) {
      expect(mark.paint === "grid" || mark.paint === "gridMinor").toBe(true);
      expect(mark.closed).toBe(false);
    }
    const box = boundsMarks({
      root: node("g1", Bounded()),
      unit: 100,
      width: 800,
      height: 600,
      viewer: { theme: "dark", debugBounds: true },
    });
    expect(box.every((m) => m.paint === "debug")).toBe(true);
  });

  it("grid.too-fine-to-read-is-not-drawn — a wash of colour is not a grid", () => {
    // Below a few pixels a line per unit hides the scene it exists to measure. Nothing is a
    // better answer than something unreadable.
    expect(grid(3)).toEqual([]);
    expect(grid(0)).toEqual([]);
  });
});

describe("the hybrid: baked or live", () => {

  it("plan.a-zero-unit-is-not-a-division — a container with no size yet", () => {
    // Measured before layout, or hidden, a container reports a unit of zero. `1 / 0` puts NaN
    // through the whole matrix, and everything downstream then reads as "rotated" — because NaN
    // is not equal to zero either — so the plan quietly stops baking. It failed exactly that way
    // the first time a test mounted into a jsdom element.
    const quads = scenePlan({
      root: node("z1", box(1, 1), Surfaced()),
      unit: 0,
      width: 800,
      height: 600,
      viewer: DEFAULT_VIEWER,
    });
    for (const value of Object.values(quads[0]!.transform)) expect(Number.isFinite(value)).toBe(true);
  });
  it("plan.baked-and-live-are-the-same-picture — that is what makes the choice free", () => {
    // The whole claim. A live quad carries a matrix the renderer applies; a baked one carries
    // the same geometry with the matrix folded in. If the two ever differed, the choice would
    // be a bug waiting for whichever one nobody looked at.
    const n = node("h1", box(1, 1), Surfaced(), Transformable({ at: { x: 0.5, y: -0.25 } }));
    const [live] = plan(n);
    const [baked] = bakePlan(plan(n));
    expect(baked!.transform).toEqual(IDENTITY);
    for (const [i, p] of baked!.points.entries()) {
      const same = apply(live!.transform, live!.points[i]!);
      expect(p.x).toBeCloseTo(same.x, 9);
      expect(p.y).toBeCloseTo(same.y, 9);
    }
  });

  it("plan.a-live-quad-keeps-its-points-at-home — around its own origin", () => {
    // Which is what lets the renderer move it without being handed new geometry: the points do
    // not mention where the node is.
    const [quad] = plan(node("h2", box(1, 1), Surfaced(), Transformable({ at: { x: 2, y: 0 } })));
    for (const p of quad!.points) expect(Math.abs(p.x)).toBeLessThanOrEqual(50 + 1e-9);
  });

  it("plan.a-turned-picture-is-not-baked — and a turned CONTOUR is", () => {
    // The refusal is about the PICTURE, not about the angle. A layer's picture is a rect —
    // `x, y, w, h`, aligned to the screen axes — with nowhere to write an angle, so folding a
    // turned card would put the face back straight inside a turned frame.
    //
    // Points have no such trouble. The rule used to say "anything turned" and refused a great
    // many quads that had nothing to lose by it.
    registerAsset("h-face", { src: "face.png", w: 1, h: 1 });
    registerSurface("h-pictured", { layers: [{ paint: "panelBg", image: "h-face" }] });

    const pictured = node("h3", box(1, 1), Surfaced({ surface: "h-pictured" }), Transformable({ angle: 30 }));
    expect(bakePlan(plan(pictured))[0]!.transform).not.toEqual(IDENTITY);

    const drawn = node("h4", box(1, 1), Surfaced(), Transformable({ angle: 30 }));
    expect(bakePlan(plan(drawn))[0]!.transform).toEqual(IDENTITY);

    // And a picture standing straight bakes as it always did — the angle is what it cannot survive.
    const straight = node("h5", box(1, 1), Surfaced({ surface: "h-pictured" }), Transformable({ scale: 2 }));
    expect(bakePlan(plan(straight))[0]!.transform).toEqual(IDENTITY);
  });

  it("plan.baking-keeps-the-stroke-the-width-it-was-authored — and live does not", () => {
    // THE difference between the modes, and the reason there is a choice at all. Live, the
    // matrix scales the stroke with everything else: a card at twice the size wears a border
    // twice as thick. Baked, the geometry is recomputed, so the border keeps the weight
    // somebody chose — what SVG spells `vector-effect: non-scaling-stroke`.
    const big = node("h5", box(1, 1), Surfaced({ surface: "plate" }), Transformable({ scale: 2 }));
    const plain = node("h6", box(1, 1), Surfaced({ surface: "plate" }));
    const authored = plan(plain)[0]!.stroke!.width;
    expect(bakePlan(plan(big))[0]!.stroke!.width).toBeCloseTo(authored, 9);
    // Live hands the same number down and lets the matrix double it on the glass — which is the
    // cheap answer, and the one an animation wants.
    expect(plan(big)[0]!.stroke!.width).toBeCloseTo(authored, 9);
    expect(plan(big)[0]!.transform.a).toBeCloseTo(2, 9);
  });

  it("plan.baking-cuts-the-dashes-again — a pattern is not a picture to be stretched", () => {
    // Mapping the cut polylines would scale the dashes with the node, which is the one thing a
    // dash is defined not to do. Baking cuts them AGAIN along the folded contour, so a zone at
    // twice the size gets twice as many dashes of the same length.
    const zone = (scale: number) =>
      bakePlan(plan(node(`h7${scale}`, box(2, 2), Surfaced({ surface: "zone" }), Transformable({ scale }))));
    const small = zone(1)[0]!.stroke!.dashes!;
    const large = zone(2)[0]!.stroke!.dashes!;
    // The WHOLE polyline, not its first segment: a dash crossing a rounded corner is a fan of
    // short chords, and measuring the first one measures the rounding instead of the dash.
    const lengthOf = (d: readonly { x: number; y: number }[]) =>
      d.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - d[i]!.x, p.y - d[i]!.y), 0);
    expect(large.length).toBeGreaterThan(small.length * 1.5);
    // Within a percent: `stretch` nudges the period so a whole number of them closes the
    // contour, and the two contours are not the same length, so the nudge is not the same.
    expect(lengthOf(large[0]!) / lengthOf(small[0]!)).toBeCloseTo(1, 1);
  });
  it("plan.a-live-stroke-scales-with-the-node — the matrix drags everything under it", () => {
    // The cost of live, stated as a number. A card at twice the size wears a border twice as
    // thick, because the renderer applies ONE matrix and a matrix has no opinion about which of
    // its pixels were a stroke. Baking is what buys the other answer — see the two rows below.
    registerSurface("edged", { layers: [{ paint: "panelBg" }], stroke: { color: "accent", width: 0.03 } });
    const root = node("live", Container());
    add(root, node("card", Bounded({ bounds: rect(1, 1) }), Surfaced({ surface: "edged" }), Transformable({ scale: 2 })));
    const [quad] = scenePlan({ root, unit: 100, width: 600, height: 600, viewer: DEFAULT_VIEWER });
    // Live, the width in the plan is the AUTHORED one and the matrix does the doubling — so the
    // claim is about the matrix, not about the number beside it.
    expect(quad!.transform.a).toBe(2);
    expect(quad!.transform.d).toBe(2);
    const baked = bakePlan([quad!])[0]!;
    expect(baked.stroke!.width).toBe(quad!.stroke!.width);
    expect(baked.transform.a).toBe(1);
  });

  it("root.render-follows-tree — Surfaced decides the picture, the tree decides existence", () => {
    // Two nodes, one painted and one not: the frame holds one quad and the tree holds two. A box
    // with nothing on it is not missing — it is a place taken, and the inspector is where it is
    // visible. Tying "is drawn" to "is there" is what makes an invisible node unfindable.
    registerSurface("plate", { layers: [{ paint: "panelBg" }] });
    const root = node("r", Container());
    add(root, node("painted", Bounded({ bounds: rect(1, 1) }), Surfaced({ surface: "plate" })));
    add(root, node("bare", Bounded({ bounds: rect(1, 1) })));
    const plan = scenePlan({ root, unit: 100, width: 600, height: 600, viewer: DEFAULT_VIEWER });
    expect(plan.map((q) => q.id)).toEqual(["painted"]);
    expect(inspect(root).map((n) => n.id)).toEqual(["r", "painted", "bare"]);
  });
});
