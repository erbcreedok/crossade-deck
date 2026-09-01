// THE MERGING DESK'S RULES — which pieces become one pile, and which only happen to overlap.
//
// The gesture desks answer that with "do they touch", and touching is a true answer to the wrong
// question: a card that skids to a stop with a corner over two deals joins both of them. What this
// desk adds is three rules, and all three are testable without a glass — they are questions about a
// tree and some outlines, which is why they were built as functions and not as a scene.
//
// The facing rule is the one worth the machinery. It cannot be checked by looking at two cards: the
// SAME two facings in the SAME two places mean "the deck landed on them" or "it landed on the deck"
// depending only on which was drawn last, so every case here is a pair of trees that differ by
// nothing except order.

import { describe, expect, it } from "vitest";
import {
  add,
  Bounded,
  compose,
  Container,
  fieldsOf,
  freeLayout,
  Heaping,
  node,
  rect,
  registerLayout,
  setFacing,
  Surfaced,
  resetSurfaces,
  surfaceRecord,
  Transformable,
  type Node,
  type SurfacedFields,
} from "../../src/index.js";
import { cards as crossadeCards } from "@game-presets/cards";
import { deckMap, gestureMap, heapsOf, regrip, stackMap } from "./gestureMap.js";
import { mergeChip, mergeMap, mergeRule, mergeSeats, MERGE_SHARE } from "./mergeMap.js";

const RULE = mergeRule(MERGE_SHARE);

function desk(...pieces: Node[]): Node {
  registerLayout("merge.free", freeLayout);
  const root = node("desk", Bounded({ bounds: rect(9, 9) }), Container({ layout: "merge.free" }), Surfaced());
  for (const p of pieces) add(root, p);
  return root;
}

/** A card at a place, lying the way it is told to. Composed, never rebuilt: the add-on's card
 * already knows its shape and its two faces, and a hand-made stand-in would be testing the stand-in. */
function card(nth: number, at: { x: number; y: number }, side: "up" | "down"): Node {
  const it = crossadeCards()[nth]!;
  setFacing(it, side);
  compose(it, Transformable({ at }));
  compose(it, Heaping({ heap: "card" }));
  return it;
}

/** The ids of every heap the rule finds, sorted so the assertion is about membership, not order. */
const heapIds = (root: Node): string[][] =>
  heapsOf(root, () => false, RULE)
    .map((g) => g.map((n) => n.id).sort())
    .sort((a, b) => (a[0] ?? "").localeCompare(b[0] ?? ""));

describe("every desk registers what it names", () => {
  it("desk.a-name-nobody-registered-is-not-an-error — which is exactly why it needs a guard", () => {
    // AN UNREGISTERED SURFACE IS SKIPPED IN SILENCE. That is the right behaviour — one bad reference
    // must not take a whole scene down — and it is the reason this is worth checking by machine:
    // the desk simply draws that piece into nothing, and the page looks as though the FEATURE had
    // been switched off rather than as though something were missing.
    //
    // It has now cost two evenings. The handle's picture was first registered by the chip's
    // installer, so a desk with no chips grew handles that could not be seen; then this desk built
    // its own art from scratch and never asked for the map's, so it shipped a screenshot with no
    // felt and no handles. Both times the console said nothing, because nothing was wrong.
    for (const [what, build] of [["merging", mergeMap], ["gestures", gestureMap], ["stacking", stackMap], ["deck", deckMap]] as const) {
      resetSurfaces();
      const root = build();
      // AND THE HANDLES, which is where this first went wrong: a handle is not in the tree until
      // something is heaped, so a desk can register everything it opens with and still have no
      // picture for the one control it grows. Both desks that open with a deck on them grow one
      // here; the others share the same installer, which is what the deck ones prove is called.
      regrip(root);
      const named = [...walk(root)]
        .map((n) => fieldsOf<SurfacedFields>(n, "Surfaced")?.surface)
        .filter((s): s is string => !!s);
      expect(named.length, `${what}: a desk that names no surface is not a desk`).toBeGreaterThan(0);
      const missing = [...new Set(named)].filter((s) => !surfaceRecord(s));
      expect(missing, `${what}: named but never registered`).toEqual([]);
    }
  });
});

/** Every node of a tree, the root included — a desk is one level deep here, but its pieces need not be. */
function* walk(n: Node): Generator<Node> {
  yield n;
  for (const c of n.children) yield* walk(c);
}

describe("what becomes one pile", () => {
  it("merge.only-its-own-pile — a chip heaps with its denomination and with nothing else", () => {
    // Sat right on top of each other, so geometry cannot be what is refusing them.
    const root = desk(
      mergeChip("red a", 5, { x: 0, y: 0 }),
      mergeChip("red b", 5, { x: 0.1, y: 0 }),
      mergeChip("green", 25, { x: 0.05, y: 0 }),
    );
    expect(heapIds(root)).toEqual([["red a", "red b"]]);
  });

  it("merge.a-corner-is-not-a-pile — touching is not belonging, and the share is where the line is", () => {
    // THE COMPLAINT THIS DESK WAS BUILT FOR. A chip flung across a desk stops with its edge over a
    // stack, and under the old rule it was part of it — pick the stack up and the stray comes too.
    const barely = desk(mergeChip("a", 5, { x: 0, y: 0 }), mergeChip("stray", 5, { x: 0.47, y: 0 }));
    expect(heapIds(barely), "an edge over an edge is two chips").toEqual([]);
    // ...and the same two chips, pushed together, are one pile. The rule is a THRESHOLD and not a
    // prohibition: nothing here stops a heap forming, it says how much of one it takes.
    const meant = desk(mergeChip("a", 5, { x: 0, y: 0 }), mergeChip("b", 5, { x: 0.3, y: 0 }));
    expect(heapIds(meant)).toEqual([["a", "b"]]);
    // And at a share of nothing the old desk is back, exactly — which is what the panel's `0` is for.
    expect(heapsOf(barely, () => false, mergeRule(0)).length).toBe(1);
  });

  it("merge.a-mismatch-is-forgiven-at-the-top — and nowhere else", () => {
    // The four cases that asked for the rule, as four trees. In each pair the geometry is identical
    // and only the DRAW ORDER differs, which is the whole claim: what tells a deck landing on cards
    // from a card landing on a deck is which of them arrived last.
    const at = (i: number): { x: number; y: number } => ({ x: i * 0.05, y: 0 });

    // A FACE-DOWN DECK DROPPED ONTO FACE-UP CARDS. The deck is on top, so it is the heap, and the
    // two lying face up underneath keep their own business.
    const deckOnCards = desk(card(0, at(0), "up"), card(1, at(1), "up"), card(2, at(2), "down"), card(3, at(3), "down"));
    expect(heapIds(deckOnCards).flat().length, "the two face-up cards are left out").toBe(2);

    // A FACE-UP CARD DROPPED ONTO A FACE-DOWN PILE. Same facings, same places — and the odd one is
    // now the last drawn, so it is the one that arrived, and it comes along.
    const cardOnDeck = desk(card(2, at(0), "down"), card(3, at(1), "down"), card(0, at(2), "up"));
    expect(heapIds(cardOnDeck).flat().length, "all three, because the face-up one landed on them").toBe(3);

    // AND BOTH MIRRORED, so the rule is about arrival and not about which way up is privileged.
    const upDeckOnDown = desk(card(0, at(0), "down"), card(1, at(1), "down"), card(2, at(2), "up"), card(3, at(3), "up"));
    expect(upDeckOnDown && heapIds(upDeckOnDown).flat().length).toBe(2);
    const downCardOnUp = desk(card(2, at(0), "up"), card(3, at(1), "up"), card(0, at(2), "down"));
    expect(heapIds(downCardOnUp).flat().length).toBe(3);
  });

  it("merge.a-column-is-a-chip-stack — every family stands its own way", () => {
    // A deck's thickness is its edge and a chip stack's is a column, and the difference has to be
    // in the seats or a stack of chips comes up looking like a fanned deck.
    const chips = [mergeChip("a", 5, { x: 0, y: 0 }), mergeChip("b", 5, { x: 0, y: 0 }), mergeChip("c", 5, { x: 0, y: 0 })];
    const column = mergeSeats(chips, 0.6);
    expect(column.every((s) => s.x === 0), "straight up: nothing sideways in a column").toBe(true);
    // ...and it rises: each chip strictly higher than the one below it.
    expect(column[2]!.y).toBeLessThan(column[1]!.y);
    expect(column[1]!.y).toBeLessThan(column[0]!.y);
    // A CARD's is the shelf's own, and it steps sideways as well — which is the tell that the two
    // are not the same answer with a different number.
    const deck = mergeSeats([card(0, { x: 0, y: 0 }, "down"), card(1, { x: 0, y: 0 }, "down")], 0.6);
    expect(deck[1]!.x).not.toBe(0);
  });
});
