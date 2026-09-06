// THE COLLISION DESK'S RULES — who takes up room, in which world, and what else is in the way.
//
// The physics is the kit's and is guarded there (`separate`, and the runtime's own pass). What is
// only ever true HERE is which piece belongs to which world, and that is not a matter of geometry at
// all: a card and a die of exactly the same size would still answer differently, because a card is a
// thing you put things ON.

import { describe, expect, it } from "vitest";
import { add, Bounded, caps, Container, freeLayout, node, rect, registerLayout, Surfaced, type Node } from "../../src/index.js";
import { alsoInTheWay, bumped, dropOf, kindOf, MAP, shoves, thrown, type DropFeel, type Piece } from "./gestureMap.js";
import { collisionMap, roomOn } from "./collisionMap.js";

const BUMP = { roomFor: roomOn(1), bounce: 0.7, scatter: 2.6, holds: true };
const feel = (n: Node): DropFeel => bumped(dropOf(n), n, BUMP);

/**
 * The desk's pieces of one sort — by what they ARE and never by what they are called.
 *
 * `guard.id-is-opaque` caught the first draft of this file reading names, and was right to: an id
 * says WHICH, never WHAT, and a test that sorts by name is a test that passes on the day somebody
 * renames a piece and stops meaning anything.
 */
const piecesOf = (desk: Node, sort: Piece): Node[] => desk.children.filter((n) => kindOf(n) === sort);

describe("what is solid to what", () => {
  it("collision.every-piece-throws-a-shadow — dice, chips and cards alike", () => {
    const desk = collisionMap();
    for (const sort of ["die", "chip", "card"] as const) {
      const some = piecesOf(desk, sort);
      expect(some.length, sort).toBeGreaterThan(0);
      for (const piece of some) expect(caps(piece).has("ShadowCaster"), sort).toBe(true);
    }
  });

  it("collision.everything-is-solid-except-a-card-to-a-not-card", () => {
    // ONE WORLD FOR THE THINGS AND ONE FOR THE PAPER. A die knocks a die and a chip; a card is
    // solid only to a card. Not a size question — the two would answer this way at any size.
    const desk = collisionMap();
    const die = piecesOf(desk, "die")[0]!;
    const chip = piecesOf(desk, "chip")[0]!;
    const card = piecesOf(desk, "card")[0]!;
    expect(feel(die).solid).toBe(feel(chip).solid);
    expect(feel(card).solid).not.toBe(feel(die).solid);
    // ...and all three take room, or "solid" would be a word about nothing.
    for (const piece of [die, chip, card]) expect(feel(piece).girth).toBeGreaterThan(0);
    // Its OWN size, and the three are three sizes: one number could only be right for one of them.
    expect(feel(die).girth).not.toBeCloseTo(feel(chip).girth, 3);
  });

  it("collision.the-switch-takes-the-room-away-from-everybody", () => {
    // Off is not a second code path: it is the same throw with every piece answering zero, which is
    // what every piece on every other desk answers already.
    const desk = collisionMap();
    const off = { roomFor: () => undefined, bounce: 0.7, scatter: 2.6, holds: true };
    for (const piece of [...piecesOf(desk, "die"), ...piecesOf(desk, "chip"), ...piecesOf(desk, "card")]) {
      const dead = bumped(dropOf(piece), piece, off);
      expect(dead.girth).toBe(0);
      expect(dead.scatter, "and nothing fans out either — a run with no room is a run as it was").toBe(0);
    }
    // And with no panel at all the desk's own answer stands: only the die takes room anywhere else
    // on the shelf, which is what keeps a deck of thirty-six cards a deck.
    const card = piecesOf(desk, "card")[0]!;
    expect(dropOf(card).girth).toBe(0);
    expect(dropOf(piecesOf(desk, "die")[0]!).girth).toBeGreaterThan(0);
  });
});

describe("a putting-down does not shove", () => {
  it("collision.only-a-throw-knocks-the-furniture-about — and `thrown` means one thing, not two", () => {
    // Without this a desk has to pick one wrong answer and live with it: either a die dropped from
    // above buries the chip it lands on, or setting a die down next to a chip flicks it across the
    // felt. What tells the two apart is the only thing that differs — whether the hand was going
    // anywhere — and the desk is the only one who knows.
    expect(shoves(0), "let go standing still").toBe(false);
    expect(shoves(4), "sent somewhere").toBe(true);

    // ...ON A DESK THAT ASKED FOR THE DISTINCTION. A desk that did not is untouched: everything that
    // reaches anything shoves it, however gently it was let go, which is what `Mechanics/Collision`
    // has always done and must go on doing. Two desks, two answers, and neither is the other's bug.
    expect(shoves(0, false), "the plain desk, unchanged").toBe(true);
    expect(shoves(4, false)).toBe(true);

    // ONE DEFINITION OF THE WORD, and neither of these two holds it. What counts as a flick is
    // decided once, where the hand is, and in the terms the hand moves in (`flickOf`, on the glass);
    // what arrives here is a throw that has already been decided, so "was there a throw" is "is
    // there any speed left". A second threshold at this end would be a second definition, and the
    // day they drifted there would be a release that flies without shoving and nobody able to say
    // why — which is why the number `THROWN_AT` does not appear below this line at all.
    const desk = collisionMap();
    const card = piecesOf(desk, "card")[0]!;
    for (const speed of [0, 0.001, 1, 40]) {
      // A card settles rather than flies, so `thrown` is answering on speed alone — which is the
      // half of it this shares.
      expect(shoves(speed, true), `at ${speed}`).toBe(thrown(card, speed));
    }
  });
});

describe("what else is in the way", () => {
  const desk = (): Node => {
    registerLayout("merge.free", freeLayout);
    return node("map", Bounded({ bounds: rect(MAP.w, MAP.h) }), Container({ layout: "merge.free" }), Surfaced());
  };

  it("collision.what-is-lying-there-is-in-the-way-too — but only what could be hit", () => {
    // A piece at rest is not a body: it landed, its seat was written, the physics forgot it. So a
    // die thrown across a desk sails over every chip already on the felt and stops on one — the same
    // complaint, wearing "but it was not moving" as an excuse.
    const map = collisionMap();
    const dice = piecesOf(map, "die");
    const chips = piecesOf(map, "chip");
    const cards = piecesOf(map, "card");
    const thrown = new Set(dice.map((n) => n.id));
    const inTheWay = alsoInTheWay(map, thrown, new Set([feel(dice[0]!).solid]), feel).map((n) => n.id);
    // The chips are: same world, not in the run.
    for (const chip of chips) expect(inTheWay, "a chip on the felt is in a thrown die's way").toContain(chip.id);
    // The cards are not: a different world, and nothing in this throw can reach them.
    for (const card of cards) expect(inTheWay, "a card is thin air to a die").not.toContain(card.id);
    // Neither is anything already in the run — it has a body of its own already.
    for (const one of dice) expect(inTheWay).not.toContain(one.id);
  });

  it("collision.a-throw-into-no-world-disturbs-nothing — which is every other desk on the shelf", () => {
    // The pieces are there and they even take room; nothing is being thrown into their world, so
    // nothing is woken. A desk pays for this feature only on the throws that need it.
    const map = collisionMap();
    expect(alsoInTheWay(map, new Set(), new Set(), feel)).toEqual([]);
    // And a desk with nothing on it has nothing to wake, which is the boring half of the same law.
    expect(alsoInTheWay(desk(), new Set(), new Set(["hard"]), feel)).toEqual([]);
  });
});
