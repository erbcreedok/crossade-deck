import { beforeEach, describe, expect, it } from "vitest";
import { add, fieldsOf, node } from "../core/node.js";
import { Bounded } from "../core/atoms/bounded.js";
import { Surfaced, type SurfacedFields } from "../core/atoms/surfaced.js";
import { Flippable } from "../core/atoms/flippable.js";
import { Transformable } from "../core/atoms/transformable.js";
import { contextFor } from "../core/resolve.js";
import { apply, type Transform } from "../core/transform.js";
import { rect } from "../presets/shapes.js";
import { contentSwap, flipEffect, flipNames, flipRecord, installStockFlips, registerFlip, resetFlips } from "./flips.js";
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

  const deckOf = (flip: string) => {
    const deck = node("royalDeck", Flippable({ flip, turns: 1 }));
    add(deck, card("aceCard", { flip: "turnOver", back: "cardBack" }));
    add(deck, card("kingCard", { flip: "turnOver", back: "cardBack" }));
    add(deck, card("jackCard", { flip: "turnOver", back: "cardBack" }));
    return deck;
  };

  it("flip.deckReorder-reverses-the-children — the whole deck turns as one thing", () => {
    const deck = deckOf("deckReorder");
    const out = flipEffect(deck, contextFor(deck, 100));
    expect(out.node.children.map((c) => c.id)).toEqual(["jackCard", "kingCard", "aceCard"]);
    expect(det(out.pre)).toBeCloseTo(-1); // the deck mirrors — a physical turn, not a shuffle
    expect(deck.children.map((c) => c.id)).toEqual(["aceCard", "kingCard", "jackCard"]); // a clone, not a mutation
  });

  it("flip.deckReorder-cards-turn-through-the-chain — no per-card bookkeeping", () => {
    // The recipe only reorders. Each card's back comes from the SUMMED parity — deck 1 + card 0 —
    // resolved by the card's OWN recipe, exactly as a mirror-flipped stack already works.
    const deck = deckOf("deckReorder");
    const ace = deck.children[0]!;
    expect(fieldsOf<SurfacedFields>(flipEffect(ace, contextFor(ace, 100)).node, "Surfaced")!.surface).toBe("cardBack");
  });

  it("flip.deckChildren-keeps-the-order — the client2 alt mode, cards turn in place", () => {
    const deck = deckOf("deckChildren");
    const out = flipEffect(deck, contextFor(deck, 100));
    expect(out.node.children.map((c) => c.id)).toEqual(["aceCard", "kingCard", "jackCard"]);
    const ace = deck.children[0]!;
    expect(fieldsOf<SurfacedFields>(flipEffect(ace, contextFor(ace, 100)).node, "Surfaced")!.surface).toBe("cardBack");
  });

  it("flip.directionFlip-reverses-without-a-mirror — the row reads RTL, the glyphs stay readable", () => {
    const row = node("letterRow", Flippable({ flip: "directionFlip", turns: 1 }));
    add(row, card("aTile", {}));
    add(row, card("bTile", {}));
    add(row, card("cTile", {}));
    const out = flipEffect(row, contextFor(row, 100));
    expect(out.node.children.map((c) => c.id)).toEqual(["cTile", "bTile", "aTile"]);
    expect(det(out.pre)).toBeCloseTo(1); // no reflection — that is the whole trade against mirror
  });

  it("flip.contentSwap-substitutes-the-subtree — the back lives in the recipe's registration", () => {
    // The consumer registers the OTHER face as their own recipe — the atom only names it. This is
    // the owner's shape verbatim: references/config in the atom, the mechanism in the registry.
    const iron = node("ironBoard", Bounded({ bounds: rect(4, 3) }), Surfaced({ surface: "iron" }));
    add(iron, node("pizzaSlice", Bounded({ bounds: rect(1, 1) }), Surfaced({ surface: "pizza" })));
    registerFlip("story.ironBack", contentSwap(() => iron));
    const board = node("oakBoard", Bounded({ bounds: rect(4, 3) }), Surfaced({ surface: "oak" }),
      Flippable({ flip: "story.ironBack", turns: 1 }));
    const out = flipEffect(board, contextFor(board, 100));
    expect(out.node.id).toBe("ironBoard");
    expect(out.node.children[0]!.id).toBe("pizzaSlice");
    expect(det(out.pre)).toBeCloseTo(1); // substitution, not reflection
  });

  it("flip.contentSwap-even-parity-shows-the-front — the swap is the turn, not the node", () => {
    const iron = node("ironBoard", Bounded({ bounds: rect(4, 3) }), Surfaced({ surface: "iron" }));
    registerFlip("story.ironBack", contentSwap(() => iron));
    const board = node("oakBoard", Bounded({ bounds: rect(4, 3) }), Surfaced({ surface: "oak" }),
      Flippable({ flip: "story.ironBack", turns: 2 }));
    expect(flipEffect(board, contextFor(board, 100)).node).toBe(board);
  });

  it("flip.move-then-flip-mirrors-the-live-state — case D, nothing is stored", () => {
    // A child is MOVED, then the board flips: the mirror lands on where the child is NOW. The
    // recipe stores nothing — the reflection composes over the live pose, so the last state is
    // what turns.
    const board = node("oakBoard", Flippable({ flip: "mirror", turns: 1 }));
    const pawn = node("pawnPiece", Bounded({ bounds: rect(1, 1) }), Surfaced({ surface: "front" }),
      Transformable({ at: { x: 2, y: 0.5 } }));
    add(board, pawn);
    const t = transformsOf(board);
    const at = apply(t.get("pawnPiece")!, { x: 0, y: 0 });
    expect(at.x).toBeCloseTo(-2); // mirrored across the board's Y axis, from the LIVE 2
    expect(at.y).toBeCloseTo(0.5);
  });
});
