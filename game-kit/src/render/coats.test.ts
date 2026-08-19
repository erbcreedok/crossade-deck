import { beforeEach, describe, expect, it } from "vitest";
import { add, node, type Node } from "../core/node.js";
import { Bounded } from "../core/atoms/bounded.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Coated, type Coat } from "../core/atoms/coated.js";
import { contextFor } from "../core/resolve.js";
import { DEFAULT_VIEWER, withViewer } from "../core/viewer.js";
import { rect } from "../presets/shapes.js";
import { coatEffect, coatNames, coatRecipe, installStockCoats, registerCoat, resetCoats } from "./coats.js";
import { resetEffects } from "./effects.js";
import { type RuntimeCoat } from "./effects.js";
import { scenePlan } from "./scenePlan.js";
import { registerSurface } from "./surfaces.js";
import { DEFAULT_VIEWER as VIEWER } from "../core/viewer.js";

/** A drawable box, optionally coated — the effect only paints a node with an area. */
function box(id: string, ...coats: Coat[]): Node {
  const atoms = coats.length ? [Coated(coats.length === 1 ? { self: coats[0]! } : { cast: coats[0]!, self: coats[1]! })] : [];
  return node(id, Bounded({ bounds: rect(1, 1) }), Surfaced({ surface: "plate" }), ...atoms);
}

const coatsOf = (n: Node, viewer = DEFAULT_VIEWER): readonly RuntimeCoat[] =>
  coatEffect(n, contextFor(n, 100, viewer)).coats ?? [];

describe("coats — the registry and the effect", () => {
  beforeEach(() => {
    resetEffects();
    resetCoats();
    installStockCoats();
  });

  it("coat.register-and-lookup — a recipe is found by the name the atom points at", () => {
    expect(coatNames()).toContain("wash");
    expect(coatRecipe("wash")).toBeTypeOf("function");
    expect(coatRecipe("nosuch")).toBeUndefined();
  });

  it("coat.dangling-recipe-is-skipped — an unknown recipe leaves the node bare, does not throw", () => {
    const n = node("shard", Bounded({ bounds: rect(1, 1) }), Surfaced({ surface: "plate" }), Coated({ self: { recipe: "nosuch", level: 1, tint: "accent" } }));
    expect(() => coatsOf(n)).not.toThrow();
    expect(coatsOf(n)).toEqual([]);
  });

  it("coat.wash-opacity-follows-level — one recipe, the magnitude is the parameter", () => {
    const at = (level: number): number | undefined => coatRecipe("wash")!({ recipe: "wash", level, tint: "" }).layers![0]!.opacity;
    expect(at(0.3)).toBeCloseTo(0.3);
    expect(at(0.9)).toBeCloseTo(0.9);
    expect(at(0.9)!).toBeGreaterThan(at(0.3)!);
  });

  it("coat.level-clamps — a broken magnitude is safe, never a NaN through the matrix", () => {
    const at = (level: number): number | undefined => coatRecipe("wash")!({ recipe: "wash", level, tint: "" }).layers![0]!.opacity;
    expect(at(Number.NaN)).toBe(0);
    expect(at(-5)).toBe(0);
    expect(at(999)).toBe(1);
    expect(at(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("coat.tint-empty-is-the-recipe-default — a named tint is used, empty falls to the recipe's", () => {
    const paintOf = (tint: Coat["tint"]): unknown => coatRecipe("wash")!({ recipe: "wash", level: 1, tint }).layers![0]!.paint;
    expect(paintOf("")).toBe("stageBg");
    expect(paintOf("accent")).toBe("accent");
    expect(paintOf({ token: "spin", param: 0.5 })).toEqual({ token: "spin", param: 0.5 });
  });

  it("coat.ring-weight-grows-with-level — the selection ring is a stroke, thickening with the number", () => {
    const width = (level: number): number => coatRecipe("ring")!({ recipe: "ring", level, tint: "accent" }).stroke!.width;
    expect(width(1)).toBeGreaterThan(width(0));
  });

  it("coat.censor-names-a-filter — the mask is a wash plus a shader named for the painter", () => {
    const out = coatRecipe("censor")!({ recipe: "censor", level: 0.5, tint: "" });
    expect(out.layers).toHaveLength(1);
    expect(out.filter?.name).toBe("blur");
    expect(out.filter?.params.strength).toBeCloseTo(0.5);
  });

  it("coat.fill-covers-a-fraction — the blueprint completes as the level grows", () => {
    // A DIFFERENT KIND of mark: not an overlay's opacity but a CLIP — the coat covers `level` of
    // the face and stops, so a plan under construction reads as partly drawn, not partly faded.
    const layer = (level: number) => coatRecipe("fill")!({ recipe: "fill", level, tint: "" }).layers![0]!;
    expect(layer(0.3).part).toBeCloseTo(0.3);
    expect(layer(0.3).opacity ?? 1).toBe(1); // the covered part is SOLID — that is the whole difference from wash
    expect(layer(Number.NaN).part).toBe(0); // a broken magnitude fills nothing, never throws
  });

  it("coat.self-coats-own-face — an own coat does not fall to the children", () => {
    const parent = box("wardedDoor", { recipe: "ring", level: 1, tint: "accent" });
    const child = box("innerPane");
    add(parent, child);
    expect(coatsOf(parent)).toHaveLength(1); // the ring is on the door
    expect(coatsOf(child)).toEqual([]); // and not on its child
  });

  it("coat.cast-cascades-to-children — a tray's freeze greys the figures on it", () => {
    const tray = node("frozenTray", Bounded({ bounds: rect(3, 2) }), Surfaced({ surface: "plate" }), Coated({ cast: { recipe: "wash", level: 0.6, tint: "stageBg" } }));
    const figure = box("iceFigure");
    add(tray, figure);
    expect(coatsOf(figure)).toHaveLength(1);
    expect(coatsOf(figure)[0]!.layers![0]!.opacity).toBeCloseTo(0.6);
  });

  it("coat.empty-cast-still-inherits — carrying Coated for a self ring does not block the tray's cast", () => {
    // The empty default is transparent to the cascade: the child's own `cast` is unset, so the
    // tray's still reaches it — plus the child's own `self` ring on top. Two coats.
    const tray = node("frozenTray", Bounded({ bounds: rect(3, 2) }), Surfaced({ surface: "plate" }), Coated({ cast: { recipe: "wash", level: 0.6, tint: "stageBg" } }));
    const figure = box("selectedFigure", { recipe: "ring", level: 1, tint: "accent" });
    add(tray, figure);
    expect(coatsOf(figure)).toHaveLength(2); // inherited wash, own ring
  });

  it("coat.nested-casts-nearest-wins — the closest owner's word is the one that lands", () => {
    // Two casts up the chain: the room dims everything, the tray inside freezes ITS things. A
    // figure on the tray wears the tray's cast alone — the nearest set recipe shadows the one
    // above, the ordinary meaning of overriding an inherited value.
    const room = node("dimRoom", Bounded({ bounds: rect(6, 4) }), Surfaced({ surface: "plate" }), Coated({ cast: { recipe: "wash", level: 0.9, tint: "stageBg" } }));
    const tray = node("innerTray", Bounded({ bounds: rect(3, 2) }), Surfaced({ surface: "plate" }), Coated({ cast: { recipe: "wash", level: 0.2, tint: "accent" } }));
    const figure = box("trayFigure");
    add(room, tray);
    add(tray, figure);
    expect(coatsOf(figure)).toHaveLength(1);
    expect(coatsOf(figure)[0]!.layers![0]!.opacity).toBeCloseTo(0.2); // the tray's, not the room's
  });

  it("coat.clear-stops-the-cascade — a spotlight is a dim on the root and a clear on the lit subtree", () => {
    const room = node("darkRoom", Bounded({ bounds: rect(5, 5) }), Surfaced({ surface: "plate" }), Coated({ cast: { recipe: "wash", level: 0.7, tint: "stageBg" } }));
    const litCorridor = node("litCorridor", Bounded({ bounds: rect(1, 3) }), Surfaced({ surface: "plate" }), Coated({ cast: { recipe: "clear", level: 0, tint: "" } }));
    const dimTile = box("dimTile");
    add(room, litCorridor);
    add(room, dimTile);
    // Everything in the room is dimmed...
    expect(coatsOf(dimTile)[0]?.layers?.[0]?.opacity).toBeCloseTo(0.7);
    // ...except the lit corridor, whose clear draws nothing.
    expect(coatsOf(litCorridor).flatMap((c) => c.layers ?? [])).toEqual([]);
  });

  it("coat.no-area-no-coat — a node with no surface to paint on is skipped, cast still passes down", () => {
    const bare = node("phantom", Coated({ cast: { recipe: "wash", level: 1, tint: "stageBg" } }));
    const child = box("shownChild");
    add(bare, child);
    expect(coatsOf(bare)).toEqual([]); // nothing to coat here
    expect(coatsOf(child)).toHaveLength(1); // but the cast reached the child
  });

  it("coat.effect-ignores-viewer — a coat is shared state, never read off the onlooker plane", () => {
    // Two viewers over one truth must see the same coat: privacy is a projected field, not the
    // viewer channel. If the effect ever read `ctx.viewer`, these would differ.
    const n = box("contestedTile", { recipe: "wash", level: 0.4, tint: "accent" });
    const dark = coatsOf(n, DEFAULT_VIEWER);
    const light = coatsOf(n, withViewer(DEFAULT_VIEWER, { theme: "light" }));
    expect(light).toEqual(dark);
  });

  // ---- the modifiers — what the recipe can be held to when the light itself cannot ----------

  it("coat.polychrome-is-a-shader — the iridescence is NAMED for the painter, not cut out of layers", () => {
    // A hue that drifts across a face and over time is not a stack of films, and the attempt to
    // make it one read as stripes. What a unit test CAN hold down is the naming: the recipe hands
    // over a filter and the numbers it runs on, and everything that turns those into light lives
    // in the one file jsdom cannot run.
    const out = coatRecipe("polychrome")!({ recipe: "polychrome", level: 0.5, tint: { token: "spin", param: 0.25 } });
    expect(out.filter?.name).toBe("polychrome");
    expect(out.filter!.params.hue).toBeCloseTo(0.25); // the place on the wheel rides the parametric tint
    expect(out.filter!.params.strength).toBeCloseTo(0.45); // and the level says how much of it
    expect(JSON.parse(JSON.stringify(out.filter))).toEqual(out.filter); // a name and numbers, never a shader
  });

  it("coat.foil-is-a-shader — the sliding glint is a filter, the rim stays a stroke", () => {
    const out = coatRecipe("foil")!({ recipe: "foil", level: 0.4, tint: "" });
    expect(out.filter?.name).toBe("foil");
    expect(out.filter!.params.strength).toBeCloseTo(0.34);
    // The rim runs along the CONTOUR, and a filter over the face cannot own a contour — so the
    // hairline is still a stroke, and that split is the honest one rather than a leftover.
    expect(out.stroke?.color).toBe("text");
  });

  it("coat.modifiers-cut-no-bands — a moving sheen is never approximated by slices of the face", () => {
    // The regression the pair exists to prevent. `part` cuts the face at a HARD edge, which is the
    // right mark for a gauge and the wrong one for light: stacked, they read as a flag. Whatever
    // else these two recipes grow, they may not grow that again.
    for (const recipe of ["foil", "polychrome"]) {
      const layers = coatRecipe(recipe)!({ recipe, level: 1, tint: "" }).layers ?? [];
      expect(layers.length, recipe).toBeGreaterThan(0);
      expect(layers.map((l) => l.part).filter((p) => p !== undefined), recipe).toEqual([]);
    }
  });

  // ---- through the whole plan: the coat reaches the quad, folded blindly --------------------

  const plan = (n: Node) => {
    registerSurface("plate", { layers: [{ paint: "panelBg" }] });
    return scenePlan({ root: n, unit: 100, width: 400, height: 400, viewer: VIEWER }).find((q) => q.id === n.id);
  };

  it("coat.reaches-the-quad — a wash lands as an extra layer OVER the surface's own", () => {
    const quad = plan(box("manaShard", { recipe: "wash", level: 0.8, tint: "accent" }));
    // The record's one layer, and the coat's on top of it.
    expect(quad!.layers).toHaveLength(2);
    expect(quad!.layers[0]!.paint).toBe("panelBg");
    expect(quad!.layers[1]!.paint).toBe("accent");
    expect(quad!.layers[1]!.opacity).toBeCloseTo(0.8);
  });

  it("coat.filter-reaches-the-quad — a censor names a filter the painter will build", () => {
    const quad = plan(box("hiddenTrap", { recipe: "censor", level: 0.5, tint: "" }));
    expect(quad!.filter?.name).toBe("blur");
    // Serialisable: the plan carries the name and numbers, never the shader.
    expect(JSON.parse(JSON.stringify(quad!.filter))).toEqual(quad!.filter);
  });

  it("coat.ring-overrides-the-stroke — a ring is the quad's border while it lasts", () => {
    const quad = plan(box("wardedDoor", { recipe: "ring", level: 1, tint: "accent" }));
    // The plate has no stroke of its own, so the ring provides it.
    expect(quad!.stroke?.color).toBe("accent");
    expect(quad!.stroke!.width).toBeGreaterThan(0);
  });
});
