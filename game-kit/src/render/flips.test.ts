import { beforeEach, describe, expect, it } from "vitest";
import { add, fieldsOf, node } from "../core/node.js";
import { Bounded } from "../core/atoms/bounded.js";
import { Surfaced, type SurfacedFields } from "../core/atoms/surfaced.js";
import { Flippable } from "../core/atoms/flippable.js";
import { contextFor } from "../core/resolve.js";
import { type Transform } from "../core/transform.js";
import { rect } from "../presets/shapes.js";
import { flipEffect, flipNames, flipRecord, installStockFlips, resetFlips } from "./flips.js";
import { resetEffects } from "./effects.js";
import { transformsOf } from "./scenePlan.js";

const det = (t: Transform): number => t.a * t.d - t.b * t.c;
const card = (id: string, ...f: Parameters<typeof Flippable>) =>
  node(id, Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: "front" }), Flippable(...f));

describe("flips — the registry and the effect", () => {
  beforeEach(() => {
    resetEffects();
    resetFlips();
    installStockFlips();
  });

  it("flip.register-and-lookup — a recipe is found by name, a dangling one is undefined", () => {
    expect(flipNames()).toContain("mirror");
    expect(flipNames()).toContain("turnOver");
    expect(flipRecord("nosuch")).toBeUndefined();
  });

  it("flip.mirror-reflects-and-swaps-nothing — pure geometry, the default", () => {
    const mirror = flipRecord("mirror")!;
    expect(mirror.reflects).toBe(true);
    const n = card("knightPawn", { flip: "mirror", turns: 1 });
    expect(mirror.turn(n)).toBe(n); // the same node — the geometry does all the work
  });

  it("flip.effect-reflects-on-own-odd-parity — a turned node mirrors, an even one does not", () => {
    expect(det(flipEffect(card("k", { turns: 1 }), contextFor(card("k"), 100)).pre)).toBeCloseTo(-1);
    expect(flipEffect(card("k", { turns: 0 }), contextFor(card("k"), 100)).pre).toEqual({
      a: 1, b: 0, c: 0, d: 1, e: 0, f: 0,
    });
  });

  it("flip.effect-swaps-content-on-summed-odd — a card in a turned stack shows its back", () => {
    const stack = node("deckStack", Flippable({ turns: 1 }));
    const ace = card("aceCard", { flip: "turnOver", back: "cardBack", turns: 0 });
    add(stack, ace);
    const out = flipEffect(ace, contextFor(ace, 100));
    // Summed parity is odd (stack 1 + card 0), so the shown node wears the back surface.
    expect(fieldsOf<SurfacedFields>(out.node, "Surfaced")!.surface).toBe("cardBack");
  });

  it("flip.turnOver-empty-back-shows-the-front — a turn never blanks the card", () => {
    const out = flipEffect(card("blankBack", { flip: "turnOver", back: "", turns: 1 }), contextFor(card("b"), 100));
    expect(fieldsOf<SurfacedFields>(out.node, "Surfaced")!.surface).toBe("front");
  });

  it("flip.dangling-recipe-leaves-the-node-unturned — not thrown, not reflected", () => {
    const out = flipEffect(card("weird", { flip: "nosuch", turns: 1 }), contextFor(card("w"), 100));
    expect(out.node.id).toBe("weird");
    expect(det(out.pre)).toBeCloseTo(1); // no reflection from a recipe that does not exist
  });

  it("flip.two-reflections-cancel — a card turned inside a turned stack is upright again (case A)", () => {
    // Through the real transformsOf: the stack's reflection and the card's own compose down the
    // chain, and two of them make the determinant positive again.
    const stack = node("deckStack", Flippable({ flip: "mirror", turns: 1 }));
    const one = card("oneTurn", { flip: "mirror", turns: 0 });
    const two = card("twoTurns", { flip: "mirror", turns: 1 });
    add(stack, one);
    add(stack, two);
    const t = transformsOf(stack);
    expect(det(t.get("oneTurn")!)).toBeLessThan(0); // stack's reflection alone — mirrored
    expect(det(t.get("twoTurns")!)).toBeGreaterThan(0); // stack's plus its own — cancelled
  });

  it("flip.no-flippable-is-left-alone — a node that cannot turn is untouched", () => {
    const plain = node("rock", Bounded({ bounds: rect(1, 1) }), Surfaced({ surface: "front" }));
    const out = flipEffect(plain, contextFor(plain, 100));
    expect(out.node).toBe(plain);
    expect(det(out.pre)).toBeCloseTo(1);
  });
});
