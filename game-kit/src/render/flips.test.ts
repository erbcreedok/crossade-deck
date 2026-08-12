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

  it("flip.axis-nan-mirrors-about-the-default — a broken angle must not NaN the matrix", () => {
    // The axis is runtime data and a broken source is a fact of life. A NaN through `reflect`
    // would poison every descendant's transform; the default line (90) is the safe answer.
    const out = flipEffect(card("brokenAxis", { flip: "mirror", turns: 1, axis: Number.NaN }), contextFor(card("b"), 100));
    expect(Number.isFinite(out.pre.a)).toBe(true);
    expect(det(out.pre)).toBeCloseTo(-1); // still a reflection — the turn happened, about 90
  });

  it("flip.negative-turns-count-back — a turn undone is still a whole turn", () => {
    expect(det(flipEffect(card("k", { turns: -1 }), contextFor(card("k"), 100)).pre)).toBeCloseTo(-1);
    expect(det(flipEffect(card("k", { turns: -2 }), contextFor(card("k"), 100)).pre)).toBeCloseTo(1);
  });

  it("flip.huge-turns-keep-parity — a long game does not drift", () => {
    expect(det(flipEffect(card("k", { turns: 1000001 }), contextFor(card("k"), 100)).pre)).toBeCloseTo(-1);
    expect(det(flipEffect(card("k", { turns: 1000000 }), contextFor(card("k"), 100)).pre)).toBeCloseTo(1);
  });

  it("flip.fractional-turns-are-whole-turns — a half-turn animation is the renderer's, not state", () => {
    // The atom stores RESULTS; 1.5 turns is a turn and a half-open animation, and the state is 1.
    expect(det(flipEffect(card("k", { turns: 1.5 }), contextFor(card("k"), 100)).pre)).toBeCloseTo(-1);
  });

  it("flip.reorder-twice-is-home — the deck's back is its own turn", () => {
    const deck = deckOf("deckReorder");
    const rec = flipRecord("deckReorder")!;
    expect(rec.back(rec.turn(deck)).children.map((c) => c.id)).toEqual(deck.children.map((c) => c.id));
  });

  it("flip.empty-and-single-decks-are-unmoved — nothing to reorder is a legal deck", () => {
    const empty = node("bareDeck", Flippable({ flip: "deckReorder", turns: 1 }));
    expect(flipEffect(empty, contextFor(empty, 100)).node.children).toEqual([]);
    const single = node("oneDeck", Flippable({ flip: "deckReorder", turns: 1 }));
    add(single, card("soloCard", {}));
    expect(flipEffect(single, contextFor(single, 100)).node.children.map((c) => c.id)).toEqual(["soloCard"]);
  });

  it("flip.three-levels-sum-and-mirror — the chain has no depth limit worth speaking of", () => {
    const board = node("outerBoard", Flippable({ flip: "mirror", turns: 1 }));
    const tray = node("innerTray", Flippable({ flip: "mirror", turns: 1 }));
    const pawn = card("deepCard", { flip: "turnOver", back: "cardBack", turns: 1 });
    add(board, tray);
    add(tray, pawn);
    // Three odd turns: summed parity odd (content side), and three reflections leave det < 0.
    expect(det(transformsOf(board).get("deepCard")!)).toBeLessThan(0);
    const out = flipEffect(pawn, contextFor(pawn, 100));
    expect(fieldsOf<SurfacedFields>(out.node, "Surfaced")!.surface).toBe("cardBack"); // summed 3 is odd
  });

  it("flip.dangling-recipe-still-counts — the count is data and sums; only the DOING is muted", () => {
    // A deck whose own recipe name dangles still turned: its `turns` is a number on the wire, and
    // the children's summed parity reads it. What is lost is only the deck's own swap/reflection.
    const deck = node("brokenDeck", Flippable({ flip: "nosuch", turns: 1 }));
    const ace = card("chainCard", { flip: "turnOver", back: "cardBack" });
    add(deck, ace);
    expect(fieldsOf<SurfacedFields>(flipEffect(ace, contextFor(ace, 100)).node, "Surfaced")!.surface).toBe("cardBack");
  });

  it("flip.viewer-never-changes-a-flip — the side is shared state, not an onlooker's", () => {
    const ace = card("sharedCard", { flip: "turnOver", back: "cardBack", turns: 1 });
    const a = flipEffect(ace, contextFor(ace, 100, { theme: "dark", debugBounds: false }));
    const b = flipEffect(ace, contextFor(ace, 100, { theme: "light", debugBounds: true }));
    expect(fieldsOf<SurfacedFields>(a.node, "Surfaced")!.surface).toBe(fieldsOf<SurfacedFields>(b.node, "Surfaced")!.surface);
    expect(a.pre).toEqual(b.pre);
  });

  it("flip.fields-cross-the-wire — plain data in, the same turn out", () => {
    // What the atom holds is exactly what a message can carry: rebuild the fields from JSON and
    // the effect answers the same. The recipe stays on this side — the wire moves only the name.
    const fields = { flip: "turnOver", back: "cardBack", turns: 1, axis: 76 };
    const wired = JSON.parse(JSON.stringify(fields)) as typeof fields;
    const ace = card("wiredCard", wired);
    const out = flipEffect(ace, contextFor(ace, 100));
    expect(fieldsOf<SurfacedFields>(out.node, "Surfaced")!.surface).toBe("cardBack");
    expect(det(out.pre)).toBeCloseTo(-1);
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
