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
  coatRecipe,
  hasCoat,
  resetCoats,
  type InvitingFields,
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
import { ANCHOR_MARK, deckMap, gestureMap, heapsOf, regrip, stackMap , kindOf , heapKindOf } from "./gestureMap.js";
import { mergeChip, mergeMap, mergeRule, mergeSeats, MERGE_SHARE } from "./mergeMap.js";
import { magnetMap } from "./magnetMap.js";
import { liveMap } from "./liveMap.js";

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
  heapsOf(root, heapKindOf, () => false, RULE)
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
      regrip(root, heapKindOf);
      const named = [...walk(root)]
        .map((n) => fieldsOf<SurfacedFields>(n, "Surfaced")?.surface)
        .filter((s): s is string => !!s);
      expect(named.length, `${what}: a desk that names no surface is not a desk`).toBeGreaterThan(0);
      const missing = [...new Set(named)].filter((s) => !surfaceRecord(s));
      expect(missing, `${what}: named but never registered`).toEqual([]);
    }
  });

  it("desk.a-coat-nobody-registered-is-not-an-error-either — the same trap, one layer down", () => {
    // A COAT IS A NAME TOO. `wash`, `ring`, `censor` are looked up in a registry exactly as a
    // surface is, and a name nobody registered resolves to nothing and paints nothing, in the same
    // silence: the zone declares its aim light, the wiring puts it on, and the glass shows no
    // difference at all. Which is what happened — the light was built, tested and wired, and the
    // desk it was built FOR had never installed a single recipe, so a whole evening's feature was
    // invisible and correct at once.
    //
    // Reset first, so a desk that only works because some OTHER story installed the recipes fails
    // here. That is the same reason the surfaces above are reset: a registry is global, and a test
    // run in one process is the one place where everybody else's installers are already there.
    // EVERY DESK ON THE SHELF, and the total is what has to be non-zero. Asked desk by desk, this
    // would fail on the ones that deliberately light nothing — the live desk answers no zone at all,
    // by its own page's choice — and a guard that has to be edited whenever a desk says less about
    // itself is a guard people learn to edit rather than to read.
    let seen = 0;
    for (const [what, build] of [["magnetism", magnetMap], ["live", liveMap], ["merging", mergeMap], ["gestures", gestureMap]] as const) {
      resetCoats();
      const root = build();
      const named = [...walk(root)]
        .flatMap((n) => {
          const wear = fieldsOf<InvitingFields>(n, "Inviting");
          return wear ? [wear.coat, wear.keen] : [];
        })
        .filter((coat) => hasCoat(coat))
        .map((coat) => coat.recipe);
      // ...AND THE SHELF'S OWN MARKS, which no tree carries: the anchor's landing mark is put on a
      // handle at the moment a hand takes one, and a handle does not exist until something is
      // heaped. A coat nobody can see in a built desk is exactly the one nobody notices is missing.
      named.push(ANCHOR_MARK.recipe);
      seen += named.length;
      expect([...new Set(named)].filter((r) => !coatRecipe(r)), `${what}: named but never registered`).toEqual([]);
    }
    expect(seen, "a shelf where nothing invites anything has nothing to check").toBeGreaterThan(0);
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

  it("merge.a-corner-is-not-a-pile — for a piece that has to be COVERED, and a card does", () => {
    // THE COMPLAINT THIS DESK WAS BUILT FOR. A card flung across a desk stops with its edge over a
    // deal, and under the old rule it was part of it — pick the deal up and the stray came too.
    const barely = desk(card(0, { x: 0, y: 0 }, "up"), card(1, { x: 0.95, y: 0 }, "up"));
    expect(heapIds(barely), "an edge over an edge is two cards").toEqual([]);
    // ...and the same two, pushed together, are one pile. The rule is a THRESHOLD and not a
    // prohibition: nothing here stops a heap forming, it says how much of one it takes.
    const meant = desk(card(0, { x: 0, y: 0 }, "up"), card(1, { x: 0.4, y: 0 }, "up"));
    expect(heapIds(meant).flat().length).toBe(2);
    // And at a share of nothing the old desk is back, exactly — which is what the panel's `0` is for.
    expect(heapsOf(barely, heapKindOf, () => false, mergeRule(0)).length).toBe(1);
  });

  it("merge.a-gathered-piece-only-has-to-be-NEAR — a card has to be under something", () => {
    // "Together" is not one thing on a desk. Cards have to be ON each other; chips and dice are
    // gathered — a pile of chips beside another pile is one pot, and dice thrown together are one
    // roll however they scattered. Nobody stacks dice.
    const near = { x: 0.62, y: 0 }; // a chip's own width apart: clear felt between them
    const gathered = desk(mergeChip("a", 5, { x: 0, y: 0 }), mergeChip("b", 5, near));
    expect(heapIds(gathered), "two chips beside each other are one pot").toEqual([["a", "b"]]);

    // Past the reach they are two piles again, and it is the REACH that decides — the same pair,
    // the same places, and only the number on the panel changed.
    const noReach = desk(mergeChip("a", 5, { x: 0, y: 0 }, undefined, 0), mergeChip("b", 5, near, undefined, 0));
    expect(heapIds(noReach), "with no reach a chip has to be covered, like a card").toEqual([]);

    // ...and a card at exactly the same gap is not a pile at any reach, because a card has none.
    const apart = desk(card(0, { x: 0, y: 0 }, "up"), card(1, { x: 1.2, y: 0 }, "up"));
    expect(heapIds(apart), "cards a card's width apart are two cards").toEqual([]);
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
