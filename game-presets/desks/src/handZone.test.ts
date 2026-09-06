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
  extentOf,
  footprint,
  grippableBy,
  installStockCoats,
  node,
  rect,
  Transformable,
  type Node,
} from "game-kit";
import { growHand, HAND, handLocked, handTakes, isHand } from "./handZone.js";
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
  it("hand.a-hand-is-the-size-of-what-is-in-it — empty it is a mark, full it stops at the ceiling", () => {
    const zone = hand("south");
    // EMPTY IS A MARK. A permanent full-size box on the felt is a hole in the table for a player
    // holding nothing, which on a round desk is most players most of the time.
    expect(size(zone).w).toBeCloseTo(HAND.empty);
    expect(size(zone).h).toBeCloseTo(HAND.empty);

    const widths: number[] = [];
    for (let i = 1; i <= 12; i += 1) {
      add(zone, card(`card ${i}`));
      growHand(zone);
      widths.push(size(zone).w);
    }
    // One card is already wider than the mark, and every card after it is at least as wide as the
    // one before: a hand that shrank as it was dealt to would be reporting the opposite of the truth.
    expect(widths[0]!).toBeGreaterThan(HAND.empty);
    for (let i = 1; i < widths.length; i += 1) expect(widths[i]!).toBeGreaterThanOrEqual(widths[i - 1]!);
    // ...and it stops. Past the ceiling the CARDS close up instead — which is `handLayout`'s job and
    // the reason the ring is allowed to stop growing at all.
    expect(Math.max(...widths)).toBeCloseTo(HAND.max);
    // A RING, so it is as tall as it is wide: what is in it lies across a circle and not in a box.
    expect(size(zone).h).toBeCloseTo(size(zone).w);
    expect(size(zone).h).toBeGreaterThan(CARD.h);
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
});
