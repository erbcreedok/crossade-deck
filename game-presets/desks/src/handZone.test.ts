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
  grippableBy,
  layoutChildren,
  layoutRecord,
  installStockCoats,
  node,
  rect,
  Transformable,
  type Node,
  type TransformableFields,
} from "game-kit";
import { ARCH_R, flipHand, HAND_POSE_DEFAULT, HAND_POSES, HAND_SCALE, handHidden, handLayoutOf, handLocked, handPose, handPoseName, handPoseOf, handTakes, isHand, layHand, setHandHidden, setHandPose, toggledPose, type HandPose } from "./handZone.js";
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
  it("hand.a-hand-lies-in-a-pose-about-the-arch — three toggles, eight poses, and the chair is one size in every one", () => {
    // THE CHAIR DOES NOT GROW: dealt to, it is the same arch, and the cards lie ABOUT it in the pose
    // named on it — three toggles, fan · shrink · tuck, each on or off by itself. Not fanned, the
    // hand lies on the owner's right (a ladder, or shrunk, a stack); fanned, in front on the arc
    // (open, or shrunk, closed to a sliver); tucked, under the chair with a tip past the rim. The
    // numbers are the seat design's, measured off the arch (`ARCH_R`), so a change of pose is a
    // change of name.
    const zone = hand("south");
    const before = size(zone);
    for (let i = 1; i <= 5; i += 1) add(zone, card(`card ${i}`));
    layHand(zone);
    expect(size(zone)).toEqual(before);
    expect(handPose(zone), "a hand opens with nothing on").toEqual(HAND_POSE_DEFAULT);
    const at = (pose: HandPose) => {
      setHandPose(zone, pose);
      expect(fieldsOf<{ layout: string }>(zone, "Container")?.layout).toBe(handLayoutOf(pose));
      const rows = layoutRecord(handLayoutOf(pose))!.place(layoutChildren(zone), footprint(zone));
      return rows.map((p, i) => ({ x: p!.x, y: p!.y, angle: fieldsOf<TransformableFields>(zone.children[i]!, "Transformable")?.angle ?? 0 }));
    };
    const off = HAND_POSE_DEFAULT;
    // THE CARDS IN A CHAIR ARE SMALL — `HAND_SCALE` of a card on the felt, written on each card —
    // and every distance below is in those small cards, so they lie close in to the arch.
    const w = CARD.w * HAND_SCALE;
    const h = CARD.h * HAND_SCALE;
    for (const c of zone.children) expect(fieldsOf<TransformableFields>(c, "Transformable")?.scale).toBe(HAND_SCALE);
    // A LADDER ON THE RIGHT — nothing on: tucked under the rim (its near edge inside the arch), most
    // of it past the arch, each card a step past the one before, every one showing.
    const ladder = at(off);
    expect(ladder[0]!.x - w / 2).toBeLessThan(ARCH_R);
    for (const c of ladder) expect(c.x + w / 2).toBeGreaterThan(ARCH_R);
    for (let i = 1; i < ladder.length; i += 1) expect(ladder[i]!.x - ladder[i - 1]!.x).toBeGreaterThan(0.3 * HAND_SCALE);
    expect(ladder.every((c) => c.angle === 0)).toBe(true);
    // SHRUNK: a stack on the right, at the same near edge, climbing a whisker per card, level — and
    // the climb capped, so fifty-two of them are a deck and not a ladder.
    const stacked = at({ ...off, shrink: true });
    expect(stacked[0]!.x).toBeCloseTo(ladder[0]!.x, 6);
    expect(stacked.every((c) => c.angle === 0)).toBe(true);
    expect(stacked[4]!.x - stacked[0]!.x).toBeGreaterThan(0);
    expect(stacked[4]!.x - stacked[0]!.x).toBeLessThanOrEqual(0.18 * HAND_SCALE + 1e-9);
    // TUCKED ON THE RIGHT: one spot, most of the card behind the arch, its tip past the rim — and
    // shrunk as well, the same spot: there is no distance to close in one spot.
    const tucked = at({ ...off, tuck: true });
    expect(new Set(tucked.map((c) => c.x)).size).toBe(1);
    expect(tucked[0]!.x).toBeLessThan(ARCH_R);
    expect(tucked[0]!.x + w / 2).toBeGreaterThan(ARCH_R);
    expect(tucked[0]!.x + w / 2 - ARCH_R, "a tip, not a card").toBeLessThan(w / 2);
    expect(at({ ...off, tuck: true, shrink: true })).toEqual(tucked);
    // A FAN IN FRONT: above the arch (-y), symmetric, the ends leaning out either way, the middle
    // card level and its bottom edge inside the rim — held against the chair.
    const fanned = at({ ...off, fan: true });
    expect(fanned[2]!.angle).toBeCloseTo(0);
    expect(fanned[0]!.angle).toBeCloseTo(-fanned[4]!.angle);
    expect(fanned[0]!.angle).toBeLessThan(0);
    expect(fanned[0]!.x).toBeCloseTo(-fanned[4]!.x);
    expect(fanned[2]!.y + h / 2).toBeLessThan(ARCH_R);
    expect(fanned[2]!.y + h / 2).toBeGreaterThan(-ARCH_R);
    expect(fanned[2]!.y).toBeLessThan(0);
    // A FAN SHRUNK: the same arc closed — the same middle, a sliver of lean, the ends close in.
    const closed = at({ ...off, fan: true, shrink: true });
    expect(closed[2]!.y).toBeCloseTo(fanned[2]!.y);
    expect(closed[0]!.angle).toBeLessThan(0);
    expect(Math.abs(closed[0]!.angle)).toBeLessThan(Math.abs(fanned[0]!.angle) / 3);
    expect(closed[4]!.x - closed[0]!.x).toBeLessThan((fanned[4]!.x - fanned[0]!.x) / 3);
    // TUCKED IN FRONT — fanned and tucked: one spot, level, its tip past the round rim.
    const front = at({ ...off, fan: true, tuck: true });
    expect(new Set(front.map((c) => c.y)).size).toBe(1);
    expect(front.every((c) => c.angle === 0)).toBe(true);
    expect(front[0]!.y - h / 2).toBeLessThan(-ARCH_R);
    expect(-ARCH_R - (front[0]!.y - h / 2), "a tip, not a card").toBeLessThan(h / 2);
    // ...AND BACK TO A FAN, THE LEAN COMES BACK; back to nothing on, it comes off.
    at({ ...off, fan: true });
    expect(fieldsOf<TransformableFields>(zone.children[0]!, "Transformable")?.angle).toBeLessThan(0);
    at(HAND_POSE_DEFAULT);
    expect(fieldsOf<TransformableFields>(zone.children[0]!, "Transformable")?.angle).toBe(0);
    // ONE PRESS FLIPS ONE TOGGLE and leaves the other two alone.
    expect(toggledPose(off, "fan")).toEqual({ fan: true, shrink: false, tuck: false });
    expect(toggledPose({ fan: true, shrink: true, tuck: false }, "fan")).toEqual({ fan: false, shrink: true, tuck: false });
    expect(HAND_POSES.length, "every combination of the three").toBe(8);
    // EVERY POSE HAS A NAME AND EVERY NAME A POSE.
    for (const pose of HAND_POSES) expect(handPoseOf(handPoseName(pose))).toEqual(pose);
    expect(handPoseOf("upside-down")).toBeUndefined();
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
