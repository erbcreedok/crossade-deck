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
    expect(out.filter?.name).toBe("mosaic");
    expect(out.filter?.params.strength).toBeCloseTo(0.5);
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
});
