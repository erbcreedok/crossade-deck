// THE COLLISION DESK'S RULES — who takes up room, in which world, and what else is in the way.
//
// The physics is the kit's and is guarded there (`separate`, and the runtime's own pass). What is
// only ever true HERE is which piece belongs to which world, and that is not a matter of geometry at
// all: a card and a die of exactly the same size would still answer differently, because a card is a
// thing you put things ON.

import { describe, expect, it } from "vitest";
import { add, Bounded, Container, freeLayout, node, rect, registerLayout, Surfaced, type Node } from "../../src/index.js";
import { alsoInTheWay, bumped, dropOf, kindOf, MAP, type DropFeel, type Piece } from "./gestureMap.js";
import { collisionMap, roomOn } from "./collisionMap.js";

const BUMP = { roomFor: roomOn(1), bounce: 0.7, scatter: 2.6 };
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
    const off = { roomFor: () => undefined, bounce: 0.7, scatter: 2.6 };
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
    // Nor the desk's furniture: a warming node takes no room, so it is in nobody's way.
    const warm = map.children.filter((n) => kindOf(n) === "warm");
    expect(warm.length, "there is furniture on this desk to be ignored").toBeGreaterThan(0);
    for (const one of warm) expect(inTheWay).not.toContain(one.id);
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
