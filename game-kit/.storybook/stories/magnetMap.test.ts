// THE MAGNET'S OWN ARITHMETIC — which zone a release belongs to, and how far "belongs" reaches.
//
// A drop is otherwise decided by a POINT: the finger comes up somewhere and whatever container is
// under that somewhere takes the card. This is the widening of that answer, and it is pure — two
// outlines and a number — so it is checked without a glass, at the exact distances where it turns
// over, which is the one thing a person dragging a card by hand can never do.

import { describe, expect, it } from "vitest";
import { Acceptor, add, Bounded, Container, freeLayout, node, rect, registerLayout, Reaching, Transformable, type Node } from "../../src/index.js";
import { magnetMap, PULL, zoneNear } from "./magnetMap.js";

/** A card off the desk itself — the real shape, not a stand-in built to make the sums come out. */
const leadOf = (desk: Node): Node => desk.children[1]!;

/** Everything is welcome; what these cases are about is WHERE the zone is, not what it will take. */
const ACCEPTS = Acceptor({});

const zoneOf = (desk: Node): Node => desk.children[0]!;

describe("which zone a release belongs to", () => {
  it("magnet.a-release-short-of-the-border-still-belongs — and one further out does not", () => {
    const desk = magnetMap(PULL);
    const zone = zoneOf(desk);
    const lead = leadOf(desk);
    // The zone stands at y = 1.8 and is 2 tall, so its top edge is at 0.8; the card is 1.4 tall, so
    // its own bottom edge is 0.7 below wherever it is released.
    const releasedAt = (y: number): Node | undefined => zoneNear(desk, { x: 0, y }, lead);

    expect(releasedAt(1.8), "squarely inside the border").toBe(zone);
    // Its bottom edge exactly on the border: touching, so nothing has to be forgiven at all.
    expect(releasedAt(0.1), "the card's edge on the border").toBe(zone);
    // A gap of bare felt, within the pull — the whole point of the page.
    expect(releasedAt(0.1 - PULL * 0.6), "a gap smaller than the pull").toBe(zone);
    // ...and past it, nothing. The number is a THRESHOLD and the desk keeps to it.
    expect(releasedAt(0.1 - PULL * 1.4), "a gap bigger than the pull").toBeUndefined();
  });

  it("magnet.no-pull-is-every-other-desk — the release has to land inside the border", () => {
    // Off is not a second code path: it is the same lookup with nothing to forgive, which is what
    // every desk on this shelf said before one of them grew a reach.
    const desk = magnetMap(0);
    const lead = leadOf(desk);
    expect(zoneNear(desk, { x: 0, y: 1.8 }, lead), "inside is still inside").toBe(zoneOf(desk));
    expect(zoneNear(desk, { x: 0, y: 0.05 }, lead), "a hair short of it is now nothing").toBeUndefined();
  });

  it("magnet.the-nearest-zone-takes-it — never the first one somebody added", () => {
    // Two zones within reach of one release is a real arrangement — a desk of player areas — and
    // deciding it by tree order would be deciding it by something no player can see or predict.
    registerLayout("magnet.test.free", freeLayout);
    const desk = node("desk", Bounded({ bounds: rect(9, 9) }), Container({ layout: "magnet.test.free" }));
    const zone = (id: string, x: number): Node =>
      node(id, Bounded({ bounds: rect(1, 1) }), Transformable({ at: { x, y: 0 } }), Container({ layout: "magnet.test.free" }), ACCEPTS, Reaching({ reach: 3 }));
    // BOTH within reach of the release, so the tie is a real one — and added right-first, so
    // first-found and nearest disagree about it.
    add(desk, zone("right", 1));
    add(desk, zone("left", -1));
    const card = node("card", Bounded({ bounds: rect(0.2, 0.2) }));
    expect(zoneNear(desk, { x: -0.2, y: 0 }, card)?.id, "nearer to the left one").toBe("left");
    expect(zoneNear(desk, { x: 0.2, y: 0 }, card)?.id, "and to the right one from the other side").toBe("right");
  });
});
