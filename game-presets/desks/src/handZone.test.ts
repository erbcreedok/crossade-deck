// THE HAND AT THE AVATAR — the three things that are only true because the hand belongs to a PERSON
// rather than to a spot on the felt: it grows to what it holds, it stands on the side of its avatar
// that has room, and it can be shut to everybody but its owner.
//
// All three are arithmetic and data, so all three are checkable without a glass and without a
// finger: the size comes off the drawn outline, the side off two points, and the lock off the same
// `AcceptRule` machine a real drop asks. A test that needed a browser for any of them would be a
// test of the wiring, and the wiring has its own.

import { describe, expect, it } from "vitest";
import {
  add,
  Bounded,
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
import {
  growHand,
  HAND,
  handLocked,
  handTakes,
  handZone,
  isHand,
  placeHand,
  setHandLock,
} from "./handZone.js";
import { ROUND_R, roundMap } from "./roundMap.js";
import { SEATS } from "./liveMap.js";

installStockCoats();

const CARD = { w: 1, h: 1.4 };

const card = (id: string): Node => node(id, Bounded({ bounds: rect(CARD.w, CARD.h) }), Transformable({ at: { x: 0, y: 0 } }));

const size = (n: Node) => extentOf(footprint(n)!);

const avatarAt = (at: { x: number; y: number }): Node =>
  node("avatar", Bounded({ bounds: rect(0.55, 0.55) }), Transformable({ at }));

describe("the hand at the avatar", () => {
  it("hand.a-hand-is-the-size-of-what-is-in-it — empty it is a mark, full it stops at the ceiling", () => {
    const zone = handZone("south", "accent");
    // EMPTY IS A MARK. A permanent full-size box on the felt is a hole in the table for a player
    // holding nothing, which on a round desk is most players most of the time.
    expect(size(zone).w).toBeCloseTo(HAND.empty.w);
    expect(size(zone).h).toBeCloseTo(HAND.empty.h);

    const widths: number[] = [];
    for (let i = 1; i <= 12; i += 1) {
      add(zone, card(`card ${i}`));
      growHand(zone);
      widths.push(size(zone).w);
    }
    // One card is already wider than the mark, and every card after it is at least as wide as the
    // one before: a hand that shrank as it was dealt to would be reporting the opposite of the truth.
    expect(widths[0]!).toBeGreaterThan(HAND.empty.w);
    for (let i = 1; i < widths.length; i += 1) expect(widths[i]!).toBeGreaterThanOrEqual(widths[i - 1]!);
    // ...and it stops. Past the ceiling the CARDS close up instead — which is `handLayout`'s job and
    // the reason the patch is allowed to stop growing at all.
    expect(Math.max(...widths)).toBeCloseTo(HAND.max.w);
    expect(size(zone).h).toBeGreaterThan(CARD.h);
  });

  it("hand.a-hand-stands-on-the-side-of-its-place-with-room — never off the rim", () => {
    // A PLAYER AT THE TOP OF THE TABLE has felt below them and none above; one at the right has felt
    // to the left. Both fall out of the same question, which is why the side is not a setting.
    const cases: readonly [{ x: number; y: number }, (at: { x: number; y: number }, from: { x: number; y: number }) => void][] = [
      [{ x: 0, y: -ROUND_R + 0.8 }, (at, from) => expect(at.y).toBeGreaterThan(from.y)],
      [{ x: 0, y: ROUND_R - 0.8 }, (at, from) => expect(at.y).toBeLessThan(from.y)],
      [{ x: ROUND_R - 0.8, y: 0 }, (at, from) => expect(at.x).toBeLessThan(from.x)],
      [{ x: -ROUND_R + 0.8, y: 0 }, (at, from) => expect(at.x).toBeGreaterThan(from.x)],
    ];
    for (const [from, check] of cases) {
      const desk = node("desk");
      const place = avatarAt(from);
      const zone = handZone("south", "accent");
      for (let i = 0; i < 4; i += 1) add(zone, card(`c${i}`));
      growHand(zone);
      placeHand(desk, place, zone, ROUND_R);
      const at = footAt(zone);
      check(at, from);
      // ...and it is ON the felt, corner and all: a patch three units wide standing a hair inside
      // the rim is still half off the table.
      const reach = Math.hypot(size(zone).w, size(zone).h) / 2;
      expect(Math.hypot(at.x, at.y) + reach).toBeLessThanOrEqual(ROUND_R);
      expect(zone.parent).toBe(desk);
    }
  });

  it("hand.a-locked-hand-is-shut-to-everybody-but-its-owner — and open to everybody without one", () => {
    const zone = handZone("south", "accent");
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

  it("hand.the-round-desk-seats-one-hand-per-place — and the felt still has no other zone", () => {
    const desk = roundMap();
    const hands = desk.children.filter(isHand);
    expect(hands.length).toBe(SEATS.length);
    for (const { seat } of SEATS) expect(hands.some((h) => h.id.includes(seat))).toBe(true);
    // Every zone on this felt is somebody's hand: the round desk still has no shared tray, no
    // discard and no plate — one surface, and the only places on it belong to people.
    expect(desk.children.filter((n) => caps(n).has("Acceptor")).length).toBe(hands.length);
    for (const hand of hands) {
      expect(caps(hand).has("Grabber"), "a container with no grab policy gives up an empty load").toBe(true);
      expect(caps(hand).has("ShadowCaster"), "a hand is a place sunk into the felt, not a thing lying on it").toBe(false);
    }
  });
});

/** Where a node stands in its owner's space. */
function footAt(n: Node): { x: number; y: number } {
  return (n.atoms.get("Transformable")!.fields as { at: { x: number; y: number } }).at;
}
