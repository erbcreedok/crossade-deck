// THE HAND AT THE PLACE — and the place IS the hand: the ring a seat is drawn as is the patch its
// owner's cards lie in (`seatPlace.ts` builds it, this file says what a hand IS).
//
// The rectangles `liveMap` seats are places the DESK decided on: two boxes at two fixed points, and
// a player is whoever happens to be nearest one. That is backwards on a round table, where a person
// sits wherever their own chair is and can be anywhere on the rim. Fastened BESIDE the ring it was
// a second thing to keep beside a first — a patch that had to be re-measured against four sides of
// the felt every time its owner moved, and a dashed box the eye had to learn belonged to the ring a
// gap away from it. One node says it once: the ring is where that player sits AND what they hold.
// NOT the avatar — the disc is a reading of where its owner is LOOKING, and cards fastened to it
// would slide about under the hand every time they panned.
//
// IT IS DYNAMIC, and that is not decoration. A fixed box on a felt this size is a permanent hole in
// the middle of the table for a player holding nothing, and too small for one holding twelve. Empty
// it is a small mark saying only "this is somebody's"; filled it grows to what it holds and stops
// growing at a width the desk can spare, after which the cards close up instead (`handLayout`).
//
// EVERYBODY SEES EVERY HAND. Hiding is a real thing and the kit does it (`Private`, `project`), and
// it is a SECOND subject: a page that hid the cards could not tell a reader whether the other player
// had done nothing or had done something they were not allowed to see. So the cards lie face up and
// what this file is about is the other half — who may REACH into a hand that is not theirs.
//
// THE LOCK IS THAT ANSWER, and it is data on the node rather than a branch anywhere:
//   - the state is a number the zone carries (`Valued`, `HAND_LOCK`), so both screens read one truth;
//   - "may this card come IN" is the zone's own `AcceptRule` over that number and the actor's seat;
//   - "may this card be taken OUT" is `Grippable`, the kit's atom for exactly that, worn while the
//     lock is on and taken off with it — absence is the open hand (CANONS §1, no negation flags).
// Nothing here asks who is playing: the rule is a literal, and the seat arrives with the move.

import {
  Bounded,
  canAccept,
  circle,
  compose,
  extentOf,
  fieldsOf,
  footprint,
  GRIP_GAP,
  GRIP_RATIO,
  GRIP_SPEC,
  roundedRect,
  type AcceptRule,
  type GripSpec,
  type Node,
  type ValuedFields,
} from "game-kit";
import { ZONE_SPREAD, type Spread } from "./felt.js";

/** The key the lock is written under, on the zone's own `Valued`. `1` is locked, `0` is open. */
export const HAND_LOCK = "lock";

/** The mark a hand wears so a desk can find its own again — an id is a name and nothing parses one. */
export const HAND_VALUE = "hand";

/**
 * WHAT A HAND MEASURES, in units.
 *
 * `empty` is the DIAMETER of the mark a hand holding nothing is — a ring, wide enough to read as
 * somebody's place and small enough that four of them round a six-unit felt leave the middle of the
 * table free. The moment it holds a card it is a BOX round the row: `pad` of felt on every side,
 * growing a step (`Spread.gapMax`) per card up to `cards` of them — past that the box stops and the
 * cards close up instead, which is what a real hand does and what `handLayout` already knows how to
 * do. A ring and not a box while empty because an empty box is a hole in the table; a box and not a
 * ring once dealt to because a row of cards is a rectangle, and the circle that holds one is mostly
 * felt.
 */
export const HAND = { empty: 1.35, cards: 8, pad: 0.16 };

/**
 * THE ROOM UNDER THE ROW FOR THE HAND'S OWN HANDLE — the tab `regrip` hangs under a place, in units.
 *
 * The handle is drawn UNDER the cards, and the box holds it: a tab hanging outside the outline is a
 * control that belongs to nothing the eye can see, and one lying across the bottom card covers
 * whatever is on it. So the box is taller by the handle's height and its gap, read off the very spec
 * the tab is drawn from — change the handle and the hand follows, without anybody editing this file.
 */
export function handRoom(grip: Pick<GripSpec, "w"> = GRIP_SPEC): number {
  return grip.w / GRIP_RATIO + GRIP_GAP;
}

/**
 * HOW WIDE A HAND OF THIS MANY CARDS IS, in units — the row at the spread's own step, plus the
 * padding, and never wider than a hand of `HAND.cards`.
 */
export function handWidth(count: number, cardW = 1, look: Spread = ZONE_SPREAD): number {
  const n = Math.min(count, HAND.cards);
  return cardW + (n - 1) * look.gapMax + 2 * HAND.pad;
}

/** The arrangement a hand lays its cards out in — registered where the ring is built. */
export const HAND_LAYOUT = "hand.row";

/**
 * THE LOCK, AS A RULE — take this card unless the hand is locked to somebody who is not you.
 *
 * Read as two branches of one `or`, and the order is the common case first: an open hand takes from
 * anybody, and only a locked one has to ask who is at the other end of the finger.
 *
 * A move with NO actor named is refused by a locked hand, and that is the honest reading rather than
 * an oversight: `actor.seat` is then a missing path, a comparison against a missing path is a quiet
 * no, and a hand that opened for a mover who would not say who they were would be no lock at all.
 */
export function handAccept(seat: string): AcceptRule {
  return { or: [{ not: { eq: [`target.values.${HAND_LOCK}`, 1] } }, { eq: ["actor.seat", seat] }] };
}

/** Whether this node is a hand. Read off what it SAYS, never off the shape of its id. */
export function isHand(n: Node): boolean {
  return Boolean(fieldsOf<ValuedFields>(n, "Valued")?.values[HAND_VALUE]);
}

/** Whose hand this is — the seat it was built for, or `undefined` for a node that is not one. */
export function handOwner(n: Node): string | undefined {
  return isHand(n) ? fieldsOf<{ box: string }>(n, "Owned")?.box : undefined;
}

/** Whether the lock is on. A hand that never had the field is open, which is what a bare zone is. */
export function handLocked(zone: Node): boolean {
  return fieldsOf<ValuedFields>(zone, "Valued")?.values[HAND_LOCK] === 1;
}

/**
 * WOULD THIS HAND TAKE THIS CARD FROM THIS SEAT — the zone's own rule, asked with the actor.
 *
 * Asked here and not left to the drop alone because the ANSWER IS NEEDED EARLIER than the drop: a
 * zone that will refuse the card must not light up inviting it, and a release aimed at one must not
 * be handed over to it. One question, asked in all three places, so a zone cannot light up and then
 * refuse — which is the one way a rule like this is ever seen to be broken.
 */
export function handTakes(zone: Node, el: Node, actor?: string): boolean {
  return canAccept(zone, el, actor) === "allow";
}

/**
 * THE HAND, RESIZED TO WHAT IS IN IT — the chair's own outline, and nothing else about it.
 *
 * Empty it is the ring; holding something it is the BOX round the row — `handWidth` across, a card
 * plus the padding tall, plus the room under the row for the hand's own handle (`handRoom`) — until
 * the ceiling at `HAND.cards`, where the width stops and the cards close up instead (`handLayout`
 * reads the same box back and squeezes them). The step it grows by is the spread's OWN `gapMax`, so
 * a hand at rest is laid out exactly as wide as it asked to be and the layout has nothing to squeeze.
 *
 * Measured off the children's drawn outlines rather than a card's size written down here: a desk
 * that deals something other than cards must not have to come and edit this file.
 */
export function growHand(zone: Node, look: Spread = ZONE_SPREAD, grip: Pick<GripSpec, "w"> = GRIP_SPEC): void {
  const kids = zone.children;
  if (kids.length === 0) {
    compose(zone, Bounded({ bounds: circle(HAND.empty / 2) }));
    return;
  }
  const sizes = kids.map((c) => {
    const shape = footprint(c);
    return shape ? extentOf(shape) : { w: 0, h: 0 };
  });
  const widest = sizes.reduce((w, s) => Math.max(w, s.w), 0);
  const tallest = sizes.reduce((h, s) => Math.max(h, s.h), 0);
  const w = handWidth(kids.length, widest, look);
  const h = tallest + 2 * HAND.pad + handRoom(grip);
  compose(zone, Bounded({ bounds: roundedRect(w, h, HAND.pad) }));
}
