// THE HAND AT THE PLACE — the three things that are only true because the hand belongs to a PERSON
// rather than to a spot on the felt: it IS that person's own ring, it grows to what it holds, and it
// can be shut to everybody but its owner.
//
// All three are arithmetic and data, so all three are checkable without a glass and without a
// finger: the size comes off the drawn outline, the ring's place off the seat's own, and the lock
// off the same `AcceptRule` machine a real drop asks. A test that needed a browser for any of them
// would be a test of the wiring, and the wiring has its own.

import { describe, expect, it } from "vitest";
import {
  add,
  Bounded,
  byId,
  caps,
  compose,
  facing,
  fieldsOf,
  Flippable,
  type PoserFields,
  setFacing,
  extentOf,
  footprint,
  GRIP_SPEC,
  grippableBy,
  layoutChildren,
  layoutRecord,
  remove,
  installStockCoats,
  node,
  rect,
  Transformable,
  type Node,
} from "game-kit";
import { flipHand, growHand, HAND, HAND_LAYOUT, handHidden, handLocked, handRoom, handTakes, handWidth, isHand, setHandHidden } from "./handZone.js";
import { chairId, seatChair, setHandLock } from "./seatPlace.js";
import { roundMap, seatPlaces as roundPlaces } from "./roundMap.js";
import { SEATS } from "./liveMap.js";

installStockCoats();

const CARD = { w: 1, h: 1.4 };

const card = (id: string): Node => node(id, Bounded({ bounds: rect(CARD.w, CARD.h) }), Transformable({ at: { x: 0, y: 0 } }));

const size = (n: Node) => extentOf(footprint(n)!);

/** A held place on a desk that deals — which is what a hand now is, and the only thing one is. */
const hand = (seat: string): Node => seatChair(seat, { at: { x: 0, y: 0 } }, { ink: "accent", hand: true });

const walk = (n: Node): Node[] => [n, ...n.children.flatMap(walk)];

describe("the hand at the place", () => {
  it("hand.a-hand-is-a-ring-until-it-holds-a-card — then a box round the row, capped at eight cards, with room below for the grip", () => {
    const zone = hand("south");
    // EMPTY IS A MARK, and a RING: a permanent full-size box on the felt is a hole in the table for
    // a player holding nothing, which on a round desk is most players most of the time.
    expect(size(zone).w).toBeCloseTo(HAND.empty);
    expect(size(zone).h).toBeCloseTo(HAND.empty);

    const widths: number[] = [];
    for (let i = 1; i <= 12; i += 1) {
      add(zone, card(`card ${i}`));
      growHand(zone);
      widths.push(size(zone).w);
    }
    // ONE CARD IS A BOX: the ring becomes the rectangle round the card, and every card after it makes
    // the box at least as wide as the one before — a hand that shrank as it was dealt to would be
    // reporting the opposite of the truth.
    expect(widths[0]!).toBeCloseTo(CARD.w + 2 * HAND.pad);
    for (let i = 1; i < widths.length; i += 1) expect(widths[i]!).toBeGreaterThanOrEqual(widths[i - 1]!);
    // ...AND IT STOPS AT EIGHT. Past that the CARDS close up instead — which is `handLayout`'s job
    // and the reason the box is allowed to stop growing at all.
    expect(widths[7]!).toBeCloseTo(handWidth(8));
    expect(widths[11]!).toBeCloseTo(widths[7]!);
    // A BOX, NOT A RING: as tall as the card plus the padding — plus the ROOM UNDER IT for the
    // hand's own handle (`handRoom`), which is drawn under the cards and must not lie across them.
    expect(size(zone).h).toBeCloseTo(CARD.h + 2 * HAND.pad + handRoom());
    expect(size(zone).h).toBeLessThan(size(zone).w);
    // ...AND THE ROOM IS THE GRIP'S OWN: a wider handle asks for a taller box, so a desk that
    // changes its tab never has to come and edit the hand.
    growHand(zone, undefined, { ...GRIP_SPEC, w: GRIP_SPEC.w * 2 });
    expect(size(zone).h).toBeCloseTo(CARD.h + 2 * HAND.pad + handRoom({ ...GRIP_SPEC, w: GRIP_SPEC.w * 2 }));
    growHand(zone);
    // ...AND THE CARDS SIT ABOVE THAT ROOM, not across the middle of the box: the row is laid out in
    // the part of the box that is the hand's, and the handle hangs in the rest (`handLayout`'s
    // `below`, registered with the same grip the box is grown for — `installSeatArt`).
    const rows = layoutRecord(HAND_LAYOUT)!.place(layoutChildren(zone), footprint(zone));
    for (const at of rows) expect(at!.y).toBeCloseTo(-handRoom() / 2);
    // EMPTIED, IT IS THE RING AGAIN.
    for (const c of [...zone.children]) remove(zone, c);
    growHand(zone);
    expect(size(zone).w).toBeCloseTo(HAND.empty);
    expect(size(zone).h).toBeCloseTo(HAND.empty);
  });

  it("hand.a-hand-is-the-place-itself — one node, standing where its owner sits", () => {
    // THE FAULT THIS EXISTS FOR: a patch beside the ring was a second thing to keep beside a first,
    // and the two were only ever as together as whoever last remembered to re-measure them.
    const desk = roundMap();
    const places = roundPlaces(SEATS.length);
    SEATS.forEach(({ seat }, i) => {
      const ring = byId(desk, chairId(seat))!;
      expect(isHand(ring), "the seat's own ring is the hand").toBe(true);
      const at = (ring.atoms.get("Transformable")!.fields as { at: { x: number; y: number } }).at;
      expect(at.x).toBeCloseTo(places[i]!.at.x);
      expect(at.y).toBeCloseTo(places[i]!.at.y);
    });
    // ...and there is no second patch anywhere on the felt. Every zone on this desk is somebody's
    // ring: no shared tray, no discard, no plate.
    const zones = walk(desk).filter((n) => caps(n).has("Acceptor"));
    expect(zones.length).toBe(SEATS.length);
    for (const zone of zones) {
      expect(isHand(zone)).toBe(true);
      expect(caps(zone).has("Grabber"), "a container with no grab policy gives up an empty load").toBe(true);
      expect(caps(zone).has("ShadowCaster"), "a hand is a place sunk into the felt, not a thing lying on it").toBe(false);
    }
  });

  it("hand.a-locked-hand-is-shut-to-everybody-but-its-owner — and open to everybody without one", () => {
    const zone = hand("south");
    const one = card("card");
    add(zone, card("held"));
    // OPEN IS THE OPENING STATE: a desk whose hands started shut is a desk where dealing is the
    // second thing anybody does.
    expect(handLocked(zone)).toBe(false);
    expect(handTakes(zone, one, "south")).toBe(true);
    expect(handTakes(zone, one, "north")).toBe(true);
    expect(grippableBy(zone.children[0]!, "north")).toBe(true);

    setHandLock(zone, true);
    expect(handLocked(zone)).toBe(true);
    // Coming IN is the rule's answer; going OUT is the grip's. Both, or the hand is shut one way and
    // a stranger simply takes what is in it instead of adding to it.
    expect(handTakes(zone, one, "south")).toBe(true);
    expect(handTakes(zone, one, "north")).toBe(false);
    expect(grippableBy(zone.children[0]!, "south")).toBe(true);
    expect(grippableBy(zone.children[0]!, "north")).toBe(false);
    // A mover who will not say who they are is a stranger: `actor.seat` is a missing path, and a
    // comparison against a missing path is a quiet no.
    expect(handTakes(zone, one)).toBe(false);

    setHandLock(zone, false);
    expect(handTakes(zone, one, "north")).toBe(true);
    // The grip is GONE and not emptied — absence is the off switch, and `by: []` would have been
    // "locked to everybody", which is the exact opposite of an open hand.
    expect(caps(zone).has("Grippable")).toBe(false);
  });

  it("hand.a-hidden-hand-shows-others-the-back — the owner sees what they set, and a flip turns every card in place", () => {
    // HIDING IS THE KIT'S SECOND AXIS OF FACING (`Poser.others`): a hidden hand shows its owner the
    // sides they set and everybody else the back, and it is written on the ZONE, so both screens
    // read one truth and nothing is written to the cards. Open is the opening state.
    const zone = hand("south");
    expect(handHidden(zone)).toBe(false);
    setHandHidden(zone, true);
    expect(handHidden(zone)).toBe(true);
    const rules = fieldsOf<PoserFields>(zone, "Poser")!;
    expect(rules.others).toBe("back");
    expect(rules.owner).toBe("south");
    setHandHidden(zone, false);
    expect(handHidden(zone)).toBe(false);
    expect(fieldsOf<PoserFields>(zone, "Poser")?.others ?? "").toBe("");

    // A FLIP TURNS EVERY CARD IN THE HAND, IN PLACE: each card's own side goes over, and the order
    // is untouched — a flip is not a shuffle and not a status, it is one act on what is there.
    const a = card("a");
    const b = card("b");
    const c = card("c");
    for (const one of [a, b, c]) add(zone, compose(one, Flippable({ flip: "turnOver", back: "cardBack" })));
    setFacing(byId(zone, "b")!, "down");
    flipHand(zone);
    expect(zone.children.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(zone.children.map((n) => facing(n))).toEqual(["down", "up", "down"]);
    flipHand(zone);
    expect(zone.children.map((n) => facing(n))).toEqual(["up", "down", "up"]);
  });
});
