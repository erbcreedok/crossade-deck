// The plan is where every visual rule can still be held down by a test. Below it lies Pixi,
// which jsdom cannot run at all — so a rule that slips past this file is a rule nobody checks.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Bounded } from "../core/atoms/bounded.js";
import { Container, registerLayout, resetLayouts } from "../core/atoms/container.js";
import { freeLayout, rowLayout } from "../core/atoms/layouts.js";
import { ShadowCaster } from "../core/atoms/shadow.js";
import { DEFAULT_LIGHT, DEFAULT_SHADOW, Lit } from "../core/atoms/lit.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Transformable } from "../core/atoms/transformable.js";
import { Oriented } from "../core/atoms/oriented.js";
import { Labeled } from "../core/atoms/labeled.js";
import { type TextMeasure } from "./textMetrics.js";
import { add, node } from "../core/node.js";
import { DEFAULT_VIEWER } from "../core/viewer.js";
import { apply, IDENTITY, move, type Transform } from "../core/transform.js";
import { bakePlan, boundsMarks, gridMarks, scenePlan, transformsOf, type Quad } from "./scenePlan.js";
import { Camera } from "./camera.js";
import { registerAsset } from "./assets.js";
import { registerEffect, resetEffects } from "./effects.js";
import { registerSurface, resetSurfaces } from "./surfaces.js";
import { installStockSurfaces } from "../presets/surfaces.js";
import { polyline } from "../core/path.js";
import { circle, rect } from "../presets/shapes.js";
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

  it("motion.override-relocates-a-quad — a mid-settle pose stands in for the resting one", () => {
    // The one seam the motion runtime draws a settle through: hand the plan a root-unit pose for
    // a node, and it lands there instead of at rest — nothing else in the pipeline learns of it.
    const root = node("p", box(1, 1), Surfaced());
    const [rest] = plan(root); // no override — the quad sits at the resting pose (view centre)
    const overrides = new Map([["p", move(1, 0)]]); // one unit right, in root space
    const [flying] = scenePlan({ root, unit: 100, width: 800, height: 600, viewer: DEFAULT_VIEWER, overrides });
    expect(flying!.x - rest!.x).toBeCloseTo(100); // one unit → 100px at this scale
    expect(flying!.y).toBeCloseTo(rest!.y);
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

  it("plan.a-caster-lays-a-shadow-first — one layer under everything, offset down the light's fall", () => {
    // The shadow is NOT a node: it is a LAYER the plan draws in one pass, under every resting
    // surface — even one that stands taller than the caster. The default lamp hangs top-right of
    // the frame, so the fall is down-left, and the shadow quad wears the caster's id with a
    // suffix nothing can resolve: un-pickable, un-bakeable, un-mistakable for a piece.
    const root = node("sp1", Container({ layout: "free" }), Surfaced());
    add(root, node("piece", box(1, 1.4), Surfaced(), ShadowCaster()));
    add(root, node("tower", box(1, 1), Surfaced(), Transformable({ at: { x: 2, y: 0 }, z: 9 })));
    const quads = plan(root);
    expect(quads[0]!.id).toBe("piece::shadow");
    expect(quads[0]!.layer).toBe("shadow");
    expect(quads.map((q) => q.id).slice(1)).toEqual(["sp1", "piece", "tower"]);
    const piece = quads.find((q) => q.id === "piece")!;
    const shade = quads[0]!;
    expect(shade.transform.e).toBeLessThan(piece.transform.e); // down-LEFT of the piece
    expect(shade.transform.f).toBeGreaterThan(piece.transform.f);
  });

  // A ruler whose answers are chosen here: ten pixels a character, flat. See `textLayout.test.ts`.
  const ruler: TextMeasure = {
    ready: Promise.resolve(),
    measure: (text, font) => ({ width: text.length * 10, ascent: font.size * 0.8, descent: font.size * 0.2 }),
  };
  const planWithRuler = (root: Parameters<typeof scenePlan>[0]["root"]) =>
    scenePlan({ root, unit: 100, width: 800, height: 600, viewer: DEFAULT_VIEWER, measure: ruler });

  it("plan.a-caption-rides-its-nodes-quad — a labelled surface carries its lines in the node's own space", () => {
    const root = node("desk", Container({ layout: "free" }), Surfaced());
    add(root, node("btn", box(3, 1), Surfaced(), Labeled({ label: "ab" })));
    const q = planWithRuler(root).find((x) => x.id === "btn")!;
    expect(q.text?.lines.map((l) => l.text)).toEqual(["ab"]);
    // Pixels, around the node's origin — the same space the contour is in, so the painter needs
    // no second convention.
    expect(q.text!.lines[0]!.x).toBe(-10);
  });

  it("plan.a-caption-needs-no-surface — a node that only speaks draws only its words", () => {
    // The ladder's rule is that a box alone draws nothing. A CAPTION is something to draw, so a
    // node carrying one earns a quad — with no layers and no stroke, because it authored neither.
    const root = node("desk", Container({ layout: "free" }), Surfaced());
    add(root, node("note", box(3, 1), Labeled({ label: "hi" })));
    const q = planWithRuler(root).find((x) => x.id === "note");
    expect(q?.text?.lines.map((l) => l.text)).toEqual(["hi"]);
    expect(q?.layers).toEqual([]);
    expect(q?.stroke).toBeUndefined();
  });

  it("plan.no-ruler-no-caption — without a measurer the plan is the plan it always was", () => {
    // Skipped, not thrown, exactly as an unregistered surface name is. A scene that never asked
    // for text must be byte-for-byte what it was before text existed.
    const root = node("desk", Container({ layout: "free" }), Surfaced());
    add(root, node("btn", box(3, 1), Surfaced(), Labeled({ label: "ab" })));
    // `plan` is the ordinary helper: it hands no measurer, exactly as every scene did before text.
    expect(plan(root).find((x) => x.id === "btn")!.text).toBeUndefined();
    // And with a ruler the very same tree does carry one — so the difference is the ruler alone.
    expect(planWithRuler(root).find((x) => x.id === "btn")!.text).toBeDefined();
  });

  it("plan.a-billboard-ignores-the-owners-turn — the viewer frame severs the angle chain and nothing else", () => {
    // A tray sat down sideways. Both tokens are identical and sit at the same place inside it; the
    // only difference is the frame their turn is read in. The billboard must keep its own 0° while
    // still being WHERE and how BIG the tray put it — a frame that also moved things would be a
    // second layout, which is not what anybody asked of it.
    const root = node("desk", Container({ layout: "free" }), Surfaced());
    const tray = node("tray", box(4, 2), Surfaced(), Container({ layout: "free" }), Transformable({ at: { x: 1, y: 0 }, angle: 30, scale: 2 }));
    add(root, tray);
    add(tray, node("rides", box(1, 1), Surfaced(), Transformable({ at: { x: 0.5, y: 0.25 } })));
    add(tray, node("badge", box(1, 1), Surfaced(), Transformable({ at: { x: 0.5, y: 0.25 } }), Oriented({ orientation: "viewer" })));
    const quads = plan(root);
    const at = (id: string) => quads.find((q) => q.id === id)!.transform;
    const turn = (t: { a: number; b: number }) => (Math.atan2(t.b, t.a) * 180) / Math.PI;
    const size = (t: { a: number; b: number }) => Math.hypot(t.a, t.b);
    // The plain child rides the tray's turn, as `z` and scale ride the chain.
    expect(turn(at("rides"))).toBeCloseTo(30);
    // The billboard inherits none of it.
    expect(turn(at("badge"))).toBeCloseTo(0);
    // Place and size still came down the chain untouched — only the angle was cut.
    expect(at("badge").e).toBeCloseTo(at("rides").e);
    expect(at("badge").f).toBeCloseTo(at("rides").f);
    expect(size(at("badge"))).toBeCloseTo(size(at("rides")));
  });

  it("plan.a-turned-piece-turns-its-silhouette-not-its-shadow — the fall ignores every angle", () => {
    // The canon's law: light does not care how a piece is turned. The SHAPE of the shadow turns
    // with the drawn geometry, but the offset between piece and shadow is the lamp's alone —
    // a shadow parented to a turned node would orbit it, which is why it is a layer, not a child.
    const flat = plan(withPiece(0));
    const turned = plan(withPiece(60));
    const offset = (quads: readonly Quad[]): { x: number; y: number } => {
      const p = quads.find((q) => q.id === "piece")!;
      const s = quads.find((q) => q.id === "piece::shadow")!;
      return { x: s.transform.e - p.transform.e, y: s.transform.f - p.transform.f };
    };
    expect(offset(turned).x).toBeCloseTo(offset(flat).x);
    expect(offset(turned).y).toBeCloseTo(offset(flat).y);
    // And the silhouette DID turn: the turned shadow's transform carries the rotation.
    expect(plan(withPiece(60)).find((q) => q.id === "piece::shadow")!.transform.b).not.toBeCloseTo(0);

    function withPiece(angle: number) {
      const root = node(`spin${angle}`, Container({ layout: "free" }), Surfaced());
      add(root, node("piece", box(1, 1.4), Surfaced(), Transformable({ angle }), ShadowCaster()));
      return root;
    }
  });

  it("plan.a-billboard-stands-out-of-a-laid-back-desk — the cloth lies, the cards stand", () => {
    // A desk laid back is drawn short, and everything lying on it with it. What a table actually
    // looks like is the cloth lying and the CARDS standing: full height, where they sit. That is
    // `Oriented: "viewer"` doing what it always said — a node framed to the onlooker is indifferent
    // to how the world it stands in is turned — and it is the same sentence for a tilt as for a turn.
    const desk = node("d", Container({ layout: "free" }));
    add(desk, node("lying", Bounded({ bounds: rect(1, 1) }), Surfaced(), Transformable({ at: { x: 0, y: 2 } })));
    add(
      desk,
      node(
        "standing",
        Bounded({ bounds: rect(1, 1) }),
        Surfaced(),
        Transformable({ at: { x: 0, y: 2 } }),
        Oriented({ orientation: "viewer" }),
      ),
    );
    const c = new Camera({ minZoom: 0.1, maxZoom: 8 });
    c.setScreen(400, 300);
    c.setContent({ x: -10, y: -10, w: 20, h: 20 }, 40);
    c.pitch = 60;
    const quads = scenePlan({
      root: desk,
      unit: 40,
      width: 400,
      height: 300,
      viewer: DEFAULT_VIEWER,
      view: c.transform(),
      pitch: c.pitch,
    });
    const box = (id: string): { h: number; y: number } => {
      const q = quads.find((k) => k.id === id)!;
      const ys = q.points.map((p) => apply(q.transform, p).y);
      return { h: Math.max(...ys) - Math.min(...ys), y: q.y };
    };
    const lying = box("lying");
    const standing = box("standing");
    // Half height against full — the squash is cos 60 — and the SAME seat: standing a node up must
    // not walk it up the screen, or every piece but the one in the middle would drift.
    expect(standing.h).toBeCloseTo(lying.h * 2, 4);
    expect(standing.y).toBeCloseTo(lying.y, 6);
    // And with no pitch the two are the same node twice: the frame costs nothing when nothing is tilted.
    const flat = scenePlan({ root: desk, unit: 40, width: 400, height: 300, viewer: DEFAULT_VIEWER });
    const flatH = (id: string): number => {
      const q = flat.find((k) => k.id === id)!;
      const ys = q.points.map((p) => apply(q.transform, p).y);
      return Math.max(...ys) - Math.min(...ys);
    };
    expect(flatH("standing")).toBeCloseTo(flatH("lying"), 9);
  });

  it("plan.a-shadow-under-a-camera-keeps-its-length-in-units — and its direction on the glass", () => {
    // Two laws at once, and the camera is where they can finally disagree. The fall is a length in
    // UNITS laid down in SCREEN pixels: measured against the etalon instead of against the view in
    // force, it holds a constant pixel length while everything around it grows, and a piece slides
    // down onto its own shadow as the reader zooms in. And the DIRECTION is the frame's, never the
    // desk's — the lamp is in the top right of the FRAME, so turning the camera must not swing the
    // shadow round the piece.
    const desk = node("d", Container({ layout: "free" }));
    add(desk, node("piece", Bounded({ bounds: rect(1, 1) }), Surfaced(), ShadowCaster()));
    const c = new Camera({ minZoom: 0.1, maxZoom: 8 });
    c.setScreen(400, 300);
    c.setContent({ x: -10, y: -10, w: 20, h: 20 }, 50);
    const fallAt = (): { x: number; y: number } => {
      const quads = scenePlan({ root: desk, unit: 50, width: 400, height: 300, viewer: DEFAULT_VIEWER, view: c.transform() });
      const s = quads.find((q) => q.id === "piece::shadow")!;
      const p = quads.find((q) => q.id === "piece")!;
      return { x: s.x - p.x, y: s.y - p.y };
    };
    const near = fallAt();
    c.setZoom(2);
    const far = fallAt();
    expect(far.x).toBeCloseTo(near.x * 2, 6);
    expect(far.y).toBeCloseTo(near.y * 2, 6);
    // …and the turn leaves the fall pointing exactly where it pointed.
    c.turnTo(90);
    const turned = fallAt();
    expect(turned.x).toBeCloseTo(far.x, 6);
    expect(turned.y).toBeCloseTo(far.y, 6);
  });

  it("plan.height-deepens-the-shadow — z is the source, the fall's length is its consequence", () => {
    const at = (z: number): number => {
      const root = node(`h${z}`, Container({ layout: "free" }));
      add(root, node("piece", box(1, 1), Surfaced(), Transformable({ z }), ShadowCaster()));
      const quads = plan(root);
      const p = quads.find((q) => q.id === "piece")!;
      const s = quads.find((q) => q.id === "piece::shadow")!;
      return Math.hypot(s.transform.e - p.transform.e, s.transform.f - p.transform.f);
    };
    expect(at(3)).toBeGreaterThan(at(0));
    expect(at(0)).toBeGreaterThan(0); // resting on the desk still shows a hair of shadow
  });

  it("plan.the-desks-lamp-sets-the-depth — Lit.shadow on the root scales the fall and the ink", () => {
    // The coefficients are the DESK's data, not the engine's numbers: a root that doubles `base`
    // and darkens the ink casts a longer, darker shadow; a piece cannot bring its own depth.
    const cast = (shadow?: { base: number; perZ: number; lifted: number; opacity: number }) => {
      const root = node("d", Container({ layout: "free" }), ...(shadow ? [Lit({ light: DEFAULT_LIGHT, shadow })] : []));
      add(root, node("piece", box(1, 1), Surfaced(), Transformable(), ShadowCaster()));
      const quads = plan(root);
      const p = quads.find((q) => q.id === "piece")!;
      const s = quads.find((q) => q.id === "piece::shadow")!;
      return { fall: Math.hypot(s.transform.e - p.transform.e, s.transform.f - p.transform.f), ink: s.layers[0]!.opacity };
    };
    const stock = cast();
    const deep = cast({ ...DEFAULT_SHADOW, base: DEFAULT_SHADOW.base * 2, opacity: 0.9 });
    expect(deep.fall).toBeCloseTo(stock.fall * 2, 5);
    expect(deep.ink).toBe(0.9);
    expect(stock.ink).toBe(DEFAULT_SHADOW.opacity);
  });

  it("plan.a-stack-casts-once — the pile's shadow is the pile's, a detached card casts its own", () => {
    const pile = node("pile", box(2, 2), Container({ layout: "free" }), Surfaced(), ShadowCaster());
    const card = node("card", box(1, 1.4), Surfaced(), ShadowCaster());
    add(pile, card);
    expect(plan(pile).filter((q) => q.layer === "shadow").map((q) => q.id)).toEqual(["pile::shadow"]);
    // The same card standing alone casts alone.
    const loose = node("loose", Container({ layout: "free" }));
    add(loose, node("card", box(1, 1.4), Surfaced(), ShadowCaster()));
    expect(plan(loose).filter((q) => q.layer === "shadow").map((q) => q.id)).toEqual(["card::shadow"]);
  });

  it("plan.a-stacks-shadow-wears-its-content — the column's shadow is the column, not the slot", () => {
    // A tableau slot is 1×1.4; six cards down it spread far below. The stack casts ONCE, and
    // what falls is the wrap of what it HOLDS — a slot-sized shadow under a long column would
    // say the cards float. An empty pile is its own box again: the wrap of nothing is the slot.
    const full = node("pileF", box(1, 1.4), Container({ layout: "free" }), Surfaced(), ShadowCaster());
    add(full, node("low", box(1, 1.4), Surfaced(), Transformable({ at: { x: 0, y: 2.4 } })));
    const tall = plan(full).find((q) => q.id === "pileF::shadow")!;
    const empty = node("pileE", box(1, 1.4), Container({ layout: "free" }), Surfaced(), ShadowCaster());
    const flat = plan(empty).find((q) => q.id === "pileE::shadow")!;
    expect(tall.h).toBeGreaterThan(flat.h + 100); // 2.4 units further down at 100px/u
    expect(flat.h).toBeCloseTo(140);
  });

  it("plan.the-hand-deepens-the-shadow — a HELD caster's fall stretches, a flying one's does not", () => {
    // The HAND is what lifts. A card held in one grows and its shadow must answer, or the pop reads
    // as inflation rather than lift — so `carried` lengthens the fall, and it ends with the gesture.
    // `raised` alone must NOT: that set also holds every node the clock is flying, and a card on its
    // way to a seat is not standing higher above the desk at the far end than at the near one.
    const at = (hint: { raised?: ReadonlySet<string>; carried?: ReadonlySet<string> } = {}): number => {
      const root = node("fly", Container({ layout: "free" }));
      add(root, node("piece", box(1, 1), Surfaced(), ShadowCaster()));
      const quads = scenePlan({ root, unit: 100, width: 800, height: 600, viewer: DEFAULT_VIEWER, ...hint });
      const p = quads.find((q) => q.id === "piece")!;
      const s = quads.find((q) => q.id === "piece::shadow")!;
      return Math.hypot(s.transform.e - p.transform.e, s.transform.f - p.transform.f);
    };
    const held = new Set(["piece"]);
    expect(at({ carried: held })).toBeGreaterThan(at());
    expect(at({ raised: held })).toBeCloseTo(at()); // flight is not height — only the hand is
  });

  it("plan.a-shadow-lies-the-way-the-piece-does — it turns and grows with the drawn pose, and still waits at the seat", () => {
    // A shadow is the piece's OWN outline, so the way the piece is lying is the way the shadow
    // lies: a die tumbling over its seat and a shadow that will not turn are two statements about
    // one object. WHERE it falls is the separate law above — the seat, unless a hand has it.
    const root = node("f3", Container({ layout: "free" }));
    add(root, node("piece", box(2, 1), Surfaced(), ShadowCaster()));
    const plan = (over?: Map<string, Transform>): readonly Quad[] =>
      scenePlan({ root, unit: 100, width: 800, height: 600, viewer: DEFAULT_VIEWER, ...(over ? { overrides: over } : {}) });
    const shadow = (quads: readonly Quad[]): Quad => quads.find((q) => q.id === "piece::shadow")!;
    const still = shadow(plan());
    // A quarter turn IN PLACE — nothing has travelled, and the shadow must turn with it.
    const turned = shadow(plan(new Map([["piece", { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 }]])));
    expect(Math.abs(still.transform.b)).toBeCloseTo(0, 5);
    expect(Math.abs(turned.transform.b)).toBeCloseTo(1, 5);
    expect(turned.transform.e).toBeCloseTo(still.transform.e, 5); // and it did not move off the seat
    expect(turned.transform.f).toBeCloseTo(still.transform.f, 5);
    // The hop is a scale, and the shadow answers it the same way.
    const grown = shadow(plan(new Map([["piece", { a: 1.5, b: 0, c: 0, d: 1.5, e: 0, f: 0 }]])));
    expect(Math.hypot(grown.transform.a, grown.transform.b)).toBeCloseTo(Math.hypot(still.transform.a, still.transform.b) * 1.5, 5);
    // A piece the clock has carried AWAY still leaves its shadow at the seat — the law is untouched.
    const flown = shadow(plan(new Map([["piece", { a: 1, b: 0, c: 0, d: 1, e: 3, f: 0 }]])));
    expect(flown.transform.e).toBeCloseTo(still.transform.e, 5);
  });

  it("plan.a-shadow-follows-the-hand-not-the-flight — held it travels, flying it waits at the rest", () => {
    // The one law about a shadow in motion. A finger holding a piece has it OFF the desk, so the
    // shadow travels under it. A piece the clock is flying — a settle, a throw, a slide, a turn —
    // is on its way to a seat and is not standing at any point of the flight: its shadow waits at
    // the rest pose it is heading for, or it would announce a landing at every frame on the way.
    const root = node("f1", Container({ layout: "free" }));
    add(root, node("piece", box(1, 1), Surfaced(), ShadowCaster()));
    const away = new Map([["piece", { a: 1, b: 0, c: 0, d: 1, e: 2, f: 0 }]]);
    const plan = (over?: typeof away, carried?: ReadonlySet<string>): readonly Quad[] =>
      scenePlan({
        root,
        unit: 100,
        width: 800,
        height: 600,
        viewer: DEFAULT_VIEWER,
        ...(over ? { overrides: over } : {}),
        ...(carried ? { carried } : {}),
      });
    const at = (quads: readonly Quad[], id: string): number => quads.find((q) => q.id === id)!.transform.e;
    const hand = new Set(["piece"]);
    const still = plan();
    const grabbed = plan(undefined, hand); // in hand, not yet moved — the deepening is already in
    const held = plan(away, hand);
    const flying = plan(away);
    expect(at(held, "piece")).toBeCloseTo(at(still, "piece") + 200); // 2 units at 100px/u
    expect(at(held, "piece::shadow")).toBeCloseTo(at(grabbed, "piece::shadow") + 200); // shadow along
    expect(at(flying, "piece")).toBeCloseTo(at(still, "piece") + 200); // the piece flies just the same
    expect(at(flying, "piece::shadow")).toBeCloseTo(at(still, "piece::shadow")); // its shadow does not
  });

  it("plan.a-raised-node-paints-last — flight beats height, and the quad still tells the resting truth", () => {
    // A node in FLIGHT (carried by a finger, easing home, mid-flip) must not slide UNDER a pile
    // that happens to stand taller — the eye expects the moving card on top of everything it
    // crosses. `raised` is that word, an ORDERING hint only: the quad's `z` keeps reporting the
    // resting height, so inspection and any later reader see the tree's truth, not the flight's.
    const root = node("r1", Container({ layout: "free" }), Surfaced());
    add(root, node("low", box(1, 1), Surfaced(), Transformable({ z: 0 })));
    add(root, node("high", box(1, 1), Surfaced(), Transformable({ z: 5 })));
    const input = { root, unit: 100, width: 800, height: 600, viewer: DEFAULT_VIEWER };
    // Resting: height orders the paint.
    expect(scenePlan(input).map((q) => q.id)).toEqual(["r1", "low", "high"]);
    // The low card takes flight: it paints LAST, over the tall pile it crosses.
    const flying = scenePlan({ ...input, raised: new Set(["low"]) });
    expect(flying.map((q) => q.id)).toEqual(["r1", "high", "low"]);
    expect(flying.find((q) => q.id === "low")!.z).toBe(0);
    // Two in flight keep their OWN height order — the hint lifts a group, it does not shuffle it.
    expect(scenePlan({ ...input, raised: new Set(["low", "high"]) }).map((q) => q.id)).toEqual([
      "r1",
      "low",
      "high",
    ]);
  });
});

describe("a partial layer", () => {
  it("plan.a-partial-layer-carries-its-clip — the fraction becomes points here, not in the painter", () => {
    // `part` is a clip, and the clip is GEOMETRY — so it is computed in the plan, where a unit
    // test holds it down, and the painter only obeys a mask it is handed. Bottom-up, like a level.
    registerSurface("quarterFace", { layers: [{ paint: "panelBg", part: 0.25 }] });
    const quad = plan(node("gauge", box(1, 2), Surfaced({ surface: "quarterFace" })))[0]!;
    const clip = quad.layers[0]!.clip!;
    const ys = clip.map((p) => p.y);
    const xs = clip.map((p) => p.x);
    expect(Math.min(...ys)).toBeCloseTo(50); // 2u tall at 100px/u: the box runs -100..100, a quarter is 50..100
    expect(Math.max(...ys)).toBeCloseTo(100);
    expect(Math.min(...xs)).toBeCloseTo(-50);
    expect(Math.max(...xs)).toBeCloseTo(50);
  });

  it("plan.a-whole-layer-has-no-clip — absent means the whole face, not a full-size mask", () => {
    registerSurface("wholeFace", { layers: [{ paint: "panelBg" }] });
    const quad = plan(node("gauge", box(1, 1), Surfaced({ surface: "wholeFace" })))[0]!;
    expect(quad.layers[0]!.clip).toBeUndefined();
  });
});

describe("the seam walks the SHOWN node", () => {
  // The second half of the seam — children and surface both come from the SHOWN node: when an
  // effect substitutes a node (a board's other face is a whole other subtree), the plan must draw
  // the substitute's CHILDREN too, not paint the swapped surface over the original's children. The
  // effect here is anonymous on purpose — this is the seam's contract, no recipe is named.
  beforeEach(() => resetEffects());
  afterEach(() => resetEffects());

  const swapTo = (targetId: string, substitute: ReturnType<typeof node>) =>
    registerEffect((n) => ({ node: n.id === targetId ? substitute : n, pre: IDENTITY }));

  const swapped = () => {
    const shown = node("ironBoard", box(4, 3), Surfaced());
    add(shown, node("pizzaSlice", box(1, 1), Surfaced()));
    swapTo("oakBoard", shown);
    const board = node("oakBoard", box(4, 3), Surfaced());
    add(board, node("oakStack", box(1, 1.4), Surfaced()));
    return board;
  };

  it("plan.substitute-children-are-drawn — the swap brings its whole subtree", () => {
    expect(plan(swapped()).map((q) => q.id)).toContain("pizzaSlice");
  });

  it("plan.original-children-are-not — the front's content does not bleed through the back", () => {
    expect(plan(swapped()).map((q) => q.id)).not.toContain("oakStack");
  });

  it("plan.substitute-children-have-transforms — transformsOf covers the shown tree", () => {
    expect(transformsOf(swapped()).has("pizzaSlice")).toBe(true);
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
