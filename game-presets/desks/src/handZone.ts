// THE HAND AT THE AVATAR — a player's own patch of felt, standing where the player is.
//
// The rectangles `liveMap` seats are places the DESK decided on: two boxes at two fixed points, and
// a player is whoever happens to be nearest one. That is backwards on a round table, where where a
// person sits is read out of their own camera (`presence.ts`) and can be anywhere on the rim. So the
// hand is fastened to the AVATAR instead: the picture of the person moves, the patch moves with it,
// and neither has to be told where the other is.
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
  Acceptor,
  add,
  Bounded,
  compose,
  Container,
  canAccept,
  decompose,
  extentOf,
  fieldsOf,
  footprint,
  Grabber,
  Grippable,
  Inviting,
  Owned,
  node,
  NO_COAT,
  Reaching,
  registerLayout,
  registerSurface,
  roundedRect,
  Surfaced,
  Transformable,
  Valued,
  type AcceptRule,
  type Node,
  type Paint,
  type TransformableFields,
  type ValuedFields,
  type Vec,
} from "game-kit";
import { handLayout, PULL, zoneKeen, zoneLine, ZONE_SPREAD, type Spread } from "./felt.js";

/** The key the lock is written under, on the zone's own `Valued`. `1` is locked, `0` is open. */
export const HAND_LOCK = "lock";

/** The mark a hand wears so a desk can find its own again — an id is a name and nothing parses one. */
export const HAND_VALUE = "hand";

/**
 * WHAT A HAND MEASURES, in units.
 *
 * `empty` is a MARK and not a box: wide enough to read as somebody's patch, short enough that four
 * of them round a six-unit felt leave the middle of the table free. `max` is the widest a hand is
 * ever allowed to get — past it the cards overlap instead of the patch spreading, which is what a
 * real hand does and what `handLayout` already knows how to do.
 */
export const HAND = { empty: { w: 1.2, h: 0.6 }, max: { w: 3.4 }, pad: 0.12, radius: 0.22 };

/**
 * HOW FAR THE HAND STANDS OFF ITS AVATAR, in units — and generous, on purpose.
 *
 * An avatar is `Screened`: it is drawn at a size the FELT does not know, held for the eye rather
 * than scaled with the zoom, so on a table seen whole a disc measured at half a unit covers two. A
 * gap taken from the avatar's own box is right in units and wrong on the glass — the patch comes out
 * underneath the person standing on it, which is the one place it must never be. So the hand clears
 * the biggest a disc and its caption reasonably get, and the cost of being wrong the other way is
 * only a little more felt between the two.
 */
const GAP = 1.05;

const HAND_LAYOUT = "hand.row";

/**
 * THE HAND'S OWN SURFACE, one per seat and one per state of the lock.
 *
 * An area is drawn in its OWNER'S colour (`zoneLine`), and a SHUT one is drawn FILLED in that same
 * colour — the patch closed over rather than a patch with a line round it. The border is not touched
 * and could not be: on this shelf a solid outline means "this is the zone about to take the card"
 * (`zoneKeen`), and a lock that spoke in the same line would be saying the opposite thing with it.
 */
export function handSurface(seat: string, locked = false): string {
  return locked ? `hand.zone.${seat}.shut` : `hand.zone.${seat}`;
}

/** The id a hand answers to. Built here, never parsed (`guard.id-is-opaque`). */
export function handId(seat: string): string {
  return `hand ${seat}`;
}

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

/**
 * ONE HAND — the patch, its owner's colour, its arrangement, and the lock's rule already on it.
 *
 * It opens SMALL and OPEN. Small because a hand holding nothing is a label and not a place; open
 * because a desk whose hands started locked would be a desk where the first thing every player has
 * to do is turn their own lock off before anybody can deal to them.
 */
export function handZone(seat: string, ink: Paint, look: Spread = ZONE_SPREAD): Node {
  installHandArt(seat, ink, look);
  return node(
    handId(seat),
    Bounded({ bounds: roundedRect(HAND.empty.w, HAND.empty.h, HAND.radius) }),
    Surfaced({ surface: handSurface(seat) }),
    Transformable({ at: { x: 0, y: 0 } }),
    Container({ layout: HAND_LAYOUT }),
    Acceptor({ accept: handAccept(seat) }),
    Grabber({ grab: "one" }),
    Reaching({ reach: PULL }),
    // Nothing for being merely willing, the whole light for being aimed at: on a desk where every
    // open hand takes every card, "you may put it here" is true of all of them and all the time.
    Inviting({ coat: NO_COAT, keen: zoneKeen(ink) }),
    Owned({ box: seat }),
    // A HAND SAYS IT IS ONE, and says whether it is locked, in the same breath: both are data the
    // far screen reads off the tree, and a state kept anywhere else would be one screen's opinion.
    Valued({ values: { [HAND_VALUE]: 1, [HAND_LOCK]: 0 } }),
  );
}

/** Register everything a hand points at by name. Idempotent — a re-render calls it again. */
export function installHandArt(seat: string, ink: Paint, look: Spread = ZONE_SPREAD): void {
  registerLayout(HAND_LAYOUT, handLayout(look, HAND.pad));
  registerSurface(handSurface(seat), {
    layers: [{ paint: "sunkBg" }],
    radius: HAND.radius,
    stroke: zoneLine(ink),
  });
  registerSurface(handSurface(seat, true), {
    layers: [{ paint: "sunkBg" }, { paint: ink, opacity: SHUT_WASH }],
    radius: HAND.radius,
    stroke: zoneLine(ink),
  });
}

/** How much of the owner's ink a shut hand is washed with — enough to read, not enough to hide a card. */
const SHUT_WASH = 0.22;

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
 * TURN THE LOCK — the one writer, and it writes both halves of it.
 *
 * The number is what the rule reads and what the far screen sees; the grip is what stops a hand
 * reaching IN and taking something out, which no `AcceptRule` can say — accept is asked of a drop
 * and a theft is not one. Two atoms, one act, so they cannot come apart.
 */
export function setHandLock(zone: Node, locked: boolean): void {
  const values = fieldsOf<ValuedFields>(zone, "Valued")?.values ?? {};
  compose(zone, Valued({ values: { ...values, [HAND_LOCK]: locked ? 1 : 0 } }));
  const owner = fieldsOf<{ box: string }>(zone, "Owned")?.box ?? "";
  if (locked) compose(zone, Grippable({ by: [owner] }));
  else decompose(zone, "Grippable");
  // ...and it SAYS SO. A rule nobody can see is a rule a player finds out about by being refused.
  compose(zone, Surfaced({ surface: handSurface(owner, locked) }));
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
 * THE HAND, RESIZED TO WHAT IS IN IT.
 *
 * Empty it is the mark; holding something it is that thing plus the padding, plus a comfortable step
 * for every card after the first — until the ceiling, where it stops and the cards close up instead.
 * The step it grows by is the spread's OWN `gapMax`, so a hand at rest is laid out exactly as wide
 * as it asked to be and `handLayout` has nothing to squeeze.
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
  const wanted = kids.length === 0 ? HAND.empty.w : widest + 2 * HAND.pad + (kids.length - 1) * look.gapMax;
  const w = Math.max(HAND.empty.w, Math.min(HAND.max.w, wanted));
  const h = kids.length === 0 ? HAND.empty.h : Math.max(HAND.empty.h, tallest + 2 * HAND.pad);
  compose(zone, Bounded({ bounds: roundedRect(w, h, HAND.radius) }));
}

/** The four sides a hand may stand on, in the order a tie is broken: below, above, right, left. */
const SIDES: readonly Vec[] = [
  { x: 0, y: 1 },
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: -1, y: 0 },
];

/**
 * PUT THE HAND BESIDE ITS AVATAR — on whichever side has the most felt left before the edge.
 *
 * The side is not a setting because there is nothing to set: a player sitting at the top of a round
 * table has room below them and none above, and one sitting at the right has room to the left. Asked
 * as "which of the four sides leaves the most room to the rim", both fall out of the same line, and
 * a player who drags their avatar somewhere else gets the right answer without anybody deciding it.
 *
 * The room is measured to the HAND'S OWN far corner and not to its centre, because a patch three
 * units wide standing a hair inside the rim is still half off the table. Both nodes are read in the
 * desk's own space, which is where an avatar and a hand both stand.
 */
export function placeHand(root: Node, avatar: Node, zone: Node, edge: number): void {
  const at = fieldsOf<TransformableFields>(avatar, "Transformable")?.at ?? { x: 0, y: 0 };
  const face = footprint(avatar);
  const half = face ? extentOf(face) : { w: 0, h: 0 };
  const box = footprint(zone);
  const size = box ? extentOf(box) : { w: 0, h: 0 };
  const reach = Math.hypot(size.w, size.h) / 2;
  let best: Vec | undefined;
  let most = -Infinity;
  for (const dir of SIDES) {
    const off = Math.abs(dir.x) * (half.w + size.w) / 2 + Math.abs(dir.y) * (half.h + size.h) / 2 + GAP;
    const spot = { x: at.x + dir.x * off, y: at.y + dir.y * off };
    const room = edge - (Math.hypot(spot.x, spot.y) + reach);
    if (room > most) {
      most = room;
      best = spot;
    }
  }
  if (!best) return;
  const own = fieldsOf<TransformableFields>(zone, "Transformable");
  compose(zone, Transformable({ ...(own ?? {}), at: best }));
  // A hand that is not on the desk is on nothing: a caller may hand over a zone standing loose, and
  // placing it is also where it joins the felt whose rim it was just measured against.
  if (zone.parent !== root) add(root, zone);
}
