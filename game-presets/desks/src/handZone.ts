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
  type AcceptRule,
  type Node,
  type ValuedFields,
} from "game-kit";
import { ZONE_SPREAD, type Spread } from "./felt.js";

/** The key the lock is written under, on the zone's own `Valued`. `1` is locked, `0` is open. */
export const HAND_LOCK = "lock";

/** The mark a hand wears so a desk can find its own again — an id is a name and nothing parses one. */
export const HAND_VALUE = "hand";

/**
 * WHAT A HAND MEASURES, in units — a DIAMETER, because the hand is the ring the seat is drawn as.
 *
 * `empty` is a MARK and not a box: wide enough to read as somebody's place, small enough that four
 * of them round a six-unit felt leave the middle of the table free. `max` is the widest a hand is
 * ever allowed to get — past it the cards overlap instead of the ring spreading, which is what a
 * real hand does and what `handLayout` already knows how to do.
 *
 * A DIAMETER AND NOT A WIDTH: a row of cards is laid across the ring, and the circle that holds a
 * row `w` wide and `h` tall is the one whose diameter is their diagonal. Measured by the width
 * alone, the corners of the end cards would sit outside the very outline that is supposed to hold
 * them, on every hand of more than one card.
 */
export const HAND = { empty: 1.35, max: 4.2, pad: 0.16 };

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
 * THE HAND, RESIZED TO WHAT IS IN IT — the ring's own diameter, and nothing else about it.
 *
 * Empty it is the mark; holding something it is the DIAGONAL of the row lying in it plus the
 * padding — the smallest circle that actually contains what it was given — until the ceiling, where
 * it stops and the cards close up instead (`handLayout` reads the same box back and squeezes them).
 * The step it grows by is the spread's OWN `gapMax`, so a hand at rest is laid out exactly as wide
 * as it asked to be and the layout has nothing to squeeze.
 *
 * Measured off the children's drawn outlines rather than a card's size written down here: a desk
 * that deals something other than cards must not have to come and edit this file.
 */
export function growHand(zone: Node, look: Spread = ZONE_SPREAD): void {
  const kids = zone.children;
  const sizes = kids.map((c) => {
    const shape = footprint(c);
    return shape ? extentOf(shape) : { w: 0, h: 0 };
  });
  const widest = sizes.reduce((w, s) => Math.max(w, s.w), 0);
  const tallest = sizes.reduce((h, s) => Math.max(h, s.h), 0);
  const row = kids.length === 0 ? 0 : widest + (kids.length - 1) * look.gapMax;
  const wanted = kids.length === 0 ? HAND.empty : Math.hypot(row, tallest) + 2 * HAND.pad;
  const d = Math.max(HAND.empty, Math.min(HAND.max, wanted));
  compose(zone, Bounded({ bounds: circle(d / 2) }));
}
