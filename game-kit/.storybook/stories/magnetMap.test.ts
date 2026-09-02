// THE MAGNET'S OWN ARITHMETIC — which zone a release belongs to, and how far "belongs" reaches.
//
// A drop is otherwise decided by a POINT: the finger comes up somewhere and whatever container is
// under that somewhere takes the card. This is the widening of that answer, and it is pure — two
// outlines and a number — so it is checked without a glass, at the exact distances where it turns
// over, which is the one thing a person dragging a card by hand can never do.

import { describe, expect, it } from "vitest";
import {
  Acceptor,
  add,
  Bounded,
  compose,
  Container,
  fieldsOf,
  freeLayout,
  heapOf,
  node,
  rect,
  registerLayout,
  Reaching,
  Transformable,
  type Node,
  type TransformableFields,
} from "../../src/index.js";
import { CARD_SHARE, HELD_SHARE, magnetMap, PULL, zoneHolds, zoneNear } from "./magnetMap.js";
import { heapBox, isGrip, regrip } from "./gestureMap.js";
import { mergeRule } from "./mergeMap.js";

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


describe("what the zone is holding", () => {
  const NEVER = (): boolean => false;

  /** Put a card of the desk at a place, in root units, and hand it back. */
  function laid(desk: Node, nth: number, at: { x: number; y: number }): Node {
    const card = desk.children.filter((n) => heapOf(n) === "card")[nth]!;
    compose(card, Transformable({ at }));
    return card;
  }

  it("magnet.a-place-holds-what-lies-IN-it — not only what it was handed", () => {
    // Parentage alone is not the answer. A card can end up in somebody's area without anybody
    // giving it to them — pushed there, knocked there, left half across the border — and a zone
    // that counted only what it had been given would leave those on the felt while a player
    // looking at the desk would call them theirs.
    const desk = magnetMap();
    const zone = desk.children[0]!;
    const deep = laid(desk, 0, { x: 0, y: 1.8 }); // squarely inside
    const edge = laid(desk, 1, { x: 0, y: 0.75 }); // half across the border
    const away = laid(desk, 2, { x: 0, y: -2 }); // on the felt, nowhere near
    const holds = zoneHolds(HELD_SHARE)(desk, NEVER);
    expect(holds.length, "one zone, one hold").toBe(1);
    expect(holds[0]!.under, "the handle stands under the ZONE, not under the cards").toBe(zone);
    const ids = holds[0]!.pieces.map((n) => n.id);
    expect(ids).toContain(deep.id);
    expect(ids, "half in is far more than the share, so it is in").toContain(edge.id);
    expect(ids).not.toContain(away.id);
  });

  it("magnet.the-share-is-what-decides — the same card, in and out, on one number", () => {
    const desk = magnetMap();
    // A SLIVER over the border. The zone's top edge is at 0.8 and a card is 1.4 tall, so a card
    // centred at 0.24 has a tenth of itself inside — the exact distance the answer turns over at,
    // which is the one thing a person dragging a card by hand can never aim for.
    const sliver = laid(desk, 0, { x: 0, y: 0.24 });
    const held = (share: number): string[] => zoneHolds(share)(desk, NEVER)[0]!.pieces.map((n) => n.id);
    expect(held(0.05), "a low bar takes it").toContain(sliver.id);
    expect(held(0.5), "a high one does not").not.toContain(sliver.id);
  });

  it("magnet.a-place-s-handle-stands-under-the-PLACE — it does not follow what is in it", () => {
    // A heap's handle is drawn under the heap, because the heap is all there is. A zone's is drawn
    // under the ZONE: the tab belongs to the place, so it is in the same spot whatever is lying in
    // it and however that has been pushed about — which is what makes it findable at all.
    const desk = magnetMap();
    const zone = desk.children[0]!;
    // One card, high inside the zone: its own bottom edge is a long way above the zone's.
    const card = laid(desk, 0, { x: 0, y: 1.3 });
    const held = regrip(desk, undefined, NEVER, undefined, { ...mergeRule(CARD_SHARE), held: zoneHolds(HELD_SHARE) });
    const tab = desk.children.find(isGrip)!;
    expect([...held.get(tab.id)!].map((n) => n.id), "and it lifts the cards, never the zone").toEqual([card.id]);
    const seat = fieldsOf<TransformableFields>(tab, "Transformable")!.at!;
    const under = heapBox(desk, [zone]).bottom;
    expect(seat.y, "just below the zone's own bottom edge").toBeGreaterThan(under);
    expect(seat.y - under, "and only just — a tab is under a thing, not adrift below it").toBeLessThan(0.3);
    // Under the CARD's edge instead, the tab would be most of a card higher up.
    expect(seat.y, "not under the card").toBeGreaterThan(heapBox(desk, [card]).bottom + 0.3);
  });

  it("magnet.what-the-clock-is-carrying-is-in-nobody-s-zone", () => {
    // The same law every heap on this shelf keeps: a piece in the air is not lying anywhere, and a
    // handle that counted it would pull it back out of its own flight.
    const desk = magnetMap();
    const flying = laid(desk, 0, { x: 0, y: 1.8 });
    expect(zoneHolds(HELD_SHARE)(desk, (id) => id === flying.id)[0]!.pieces.map((n) => n.id)).not.toContain(flying.id);
  });
});
