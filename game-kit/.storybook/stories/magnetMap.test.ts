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
  Valued,
  Transformable,
  type Node,
  type TransformableFields,
} from "../../src/index.js";
import { CARD_SHARE, HELD_SHARE, magnetMap, PULL, zoneHolds, zoneNear } from "./magnetMap.js";
import { heapBox, isGrip, regrip, restsAt } from "./gestureMap.js";
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

  it("magnet.a-handle-is-never-put-anywhere — a zone takes cards, not controls", () => {
    // A handle is a PICTURE of a heap, redrawn wherever that heap ends up. A zone that took one
    // would be given a control to keep — and its row would lay the tab out among the cards as though
    // it were one of them, which is what it did until this line existed.
    const desk = magnetMap(PULL);
    const zone = zoneOf(desk);
    const card = leadOf(desk);
    const tab = node("stack handle 0", Bounded({ bounds: rect(0.6, 0.15) }), Valued({ values: { grip: 0 } }));
    // Released at the very middle of the zone, where a card would certainly be taken.
    expect(zoneNear(desk, { x: 0, y: 1.8 }, card), "a card is taken").toBe(zone);
    expect(zoneNear(desk, { x: 0, y: 1.8 }, tab), "and a handle is not").toBeUndefined();
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


describe("where a throw will come to rest", () => {
  it("magnet.a-throw-is-aimed-too — asked where it will STOP, not where the finger came up", () => {
    // A magnet that only catches a piece put down near a zone is half a magnet: a card flicked at
    // somebody's area is aimed just as plainly as one carried there, and a desk that answered "you
    // let go too far away" to a throw that was going to land in the zone anyway would be refusing
    // the more confident of the two gestures.
    //
    // The sum is exact for the flight the desk actually files: a slide bleeds a fixed amount of
    // speed per second, so `v² / 2a` is the distance, not an estimate.
    const feel = { fall: "settle", throwGain: 1, friction: 2, gravity: 11, bounce: 0, wallBounce: 0, girth: 0, solid: "", scatter: 0 } as const;
    const from = { x: 0, y: 0 };
    // Four units a second against a drag of two: sixteen over four, so four units on.
    expect(restsAt(from, { x: 4, y: 0 }, feel, 99)).toEqual({ x: 4, y: 0 });
    // ...and it keeps the heading, whichever way the hand went.
    const back = restsAt(from, { x: 0, y: -4 }, feel, 99);
    expect(back.x).toBeCloseTo(0, 6);
    expect(back.y).toBeCloseTo(-4, 6);
    // Its OWN share of the hand's speed, because not everything leaves a hand at the hand's speed.
    expect(restsAt(from, { x: 4, y: 0 }, { ...feel, throwGain: 0.5 }, 99).x).toBeCloseTo(1, 6);
    // A hand that was not going anywhere aims where it is: a putting-down is not a throw of nothing.
    expect(restsAt(from, undefined, feel, 99)).toBe(from);
    expect(restsAt(from, { x: 0, y: 0 }, feel, 99)).toBe(from);
    // And with no friction of its own it takes the desk's, or the sum has no drag to divide by.
    const { friction: _own, ...noDrag } = feel;
    expect(restsAt(from, { x: 4, y: 0 }, noDrag, 4).x).toBeCloseTo(2, 6);
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

  it("magnet.a-stale-handle-is-swept-wherever-it-ended-up — not only off the desk's own top", () => {
    // A handle is drawn as a child of the desk, but a desk with zones on it can re-home a node. A
    // tab that found its way inside one would be laid out by that zone as though it were a card, and
    // a sweep that only looked at the desk's own children would never see it again — one stale tab
    // is one control that lifts a heap that is not there.
    const desk = magnetMap();
    const zone = desk.children[0]!;
    laid(desk, 0, { x: 0, y: 1.8 });
    const stowaway = node("stack handle stray", Bounded({ bounds: rect(0.6, 0.15) }), Valued({ values: { grip: 0 } }));
    add(zone, stowaway);
    regrip(desk, undefined, NEVER, undefined, { ...mergeRule(CARD_SHARE), held: zoneHolds(HELD_SHARE) });
    expect(zone.children.filter(isGrip), "the zone holds cards, never controls").toEqual([]);
    // ...and the desk has exactly the handles it should: the zone's own, and the deck's — thirty-odd
    // cards on one spot are a heap like any other, and it is the stray that had to go.
    expect(desk.children.filter(isGrip).length).toBe(2);
  });

  it("magnet.what-the-clock-is-carrying-is-in-nobody-s-zone", () => {
    // The same law every heap on this shelf keeps: a piece in the air is not lying anywhere, and a
    // handle that counted it would pull it back out of its own flight.
    const desk = magnetMap();
    const flying = laid(desk, 0, { x: 0, y: 1.8 });
    expect(zoneHolds(HELD_SHARE)(desk, (id) => id === flying.id)[0]!.pieces.map((n) => n.id)).not.toContain(flying.id);
  });
});
