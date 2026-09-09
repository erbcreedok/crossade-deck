// THE HAND AT THE PLACE — and the place IS the hand: the chair a seat is drawn as is the container
// its owner's cards lie in (`seatPlace.ts` builds it, this file says what a hand IS and how it LIES).
//
// The rectangles `liveMap` seats are places the DESK decided on: two boxes at two fixed points, and
// a player is whoever happens to be nearest one. That is backwards on a round table, where a person
// sits wherever their own chair is and can be anywhere on the rim. Fastened BESIDE the chair it was
// a second thing to keep beside a first — a patch that had to be re-measured against four sides of
// the felt every time its owner moved. One node says it once: the chair is where that player sits
// AND what they hold. NOT the avatar — the disc is a reading of where its owner is LOOKING, and
// cards fastened to it would slide about under the hand every time they panned.
//
// THE CHAIR DOES NOT GROW. It is the arch of the seat design, one size, and the cards lie AROUND it
// in a POSE — three toggles the owner's HUD flips one at a time (fan · shrink · tuck), and the eight
// combinations they make: on the owner's right as a ladder, a stack or one tucked card, or in front
// of the arch as a fan, open or closed, or one tucked card. A pose is a NAME on the chair
// (`HAND_POSE`), and the arrangement it names is registered here (`handPoseLayout`).
//
// EVERYBODY SEES EVERY HAND, unless its owner HIDES it — and hiding is the kit's own second axis of
// facing (`Poser.others`, read by the flip effect for the eyes a screen is drawn for): the owner
// sees the sides they set and everybody else sees backs. Nothing is written to a card, so a hand
// shown again shows exactly what its owner left. The other half is who may REACH into a hand that
// is not theirs.
//
// THE LOCK IS THAT ANSWER, and it is data on the node rather than a branch anywhere:
//   - the state is a number the zone carries (`Valued`, `HAND_LOCK`), so both screens read one truth;
//   - "may this card come IN" is the zone's own `AcceptRule` over that number and the actor's seat;
//   - "may this card be taken OUT" is `Grippable`, the kit's atom for exactly that, worn while the
//     lock is on and taken off with it — absence is the open hand (CANONS §1, no negation flags).
// Nothing here asks who is playing: the rule is a literal, and the seat arrives with the move.

import {
  canAccept,
  caps,
  compose,
  Container,
  extentOf,
  facing,
  fan,
  fieldsOf,
  Poser,
  type PoserFields,
  registerLayout,
  setFacing,
  stack,
  Transformable,
  Valued,
  GRIP_GAP,
  GRIP_RATIO,
  GRIP_SPEC,
  type AcceptRule,
  type GripSpec,
  type LayoutChild,
  type LayoutRecord,
  type Node,
  type Point,
  type TransformableFields,
  type ValuedFields,
} from "game-kit";
import { fitStep, ZONE_SPREAD, type Spread } from "./felt.js";

/** The key the lock is written under, on the zone's own `Valued`. `1` is locked, `0` is open. */
export const HAND_LOCK = "lock";

/** The mark a hand wears so a desk can find its own again — an id is a name and nothing parses one. */
export const HAND_VALUE = "hand";

/** The key HIDING is written under, on the zone's own `Valued`. `1` is hidden, `0` is shown. */
export const HAND_HIDE = "hide";

/** The key the POSE is written under — one of `HAND_POSES`, the eight the three toggles make. */
export const HAND_POSE = "pose";

/**
 * WHAT A HAND MEASURES, in units — for the copy of it drawn on the glass (`handHud`): `pad` of felt
 * round the row, growing a step (`Spread.gapMax`) per card up to `cards` of them, past which the
 * cards close up instead. The chair on the felt measures nothing here: it is the arch, one size.
 */
export const HAND = { cards: 8, pad: 0.16 };

/**
 * THE THREE TOGGLES OF A HAND — the owner's own model, each on or off by itself, and any of the
 * eight combinations a pose: FAN turns the cards (off, they stand in a row to attention; on, they
 * spread on an arc); SHRINK closes the distance (off, the ordinary step; on, pressed so hard the
 * count is hard to read); TUCK drops them (off, where they lie; on, under the bar on the glass with
 * a sliver showing, under the chair on the felt). One press flips one toggle and nothing else.
 */
export type HandFold = "fan" | "shrink" | "tuck";
export const HAND_FOLDS: readonly HandFold[] = ["fan", "shrink", "tuck"];
export type HandPose = Readonly<Record<HandFold, boolean>>;
/** The pose a chair opens in — nothing on: a row on the glass, a ladder on the owner's right. */
export const HAND_POSE_DEFAULT: HandPose = { fan: false, shrink: false, tuck: false };
/** The eight poses, every combination of the three, the plain one first. */
export const HAND_POSES: readonly HandPose[] = [false, true].flatMap((tuck) =>
  [false, true].flatMap((shrink) => [false, true].map((fan) => ({ fan, shrink, tuck }))),
);
/** The pose with one toggle flipped — what a press on the glass does to the hand. */
export function toggledPose(pose: HandPose, fold: HandFold): HandPose {
  return { ...pose, [fold]: !pose[fold] };
}

/** The name a pose is written and registered under — the toggles that are on, or `plain`. */
export function handPoseName(pose: HandPose): string {
  const on = HAND_FOLDS.filter((fold) => pose[fold]);
  return on.length === 0 ? "plain" : on.join("+");
}
/** The pose a name means, or nothing for a name that is none of the eight. */
export function handPoseOf(name: string): HandPose | undefined {
  return HAND_POSES.find((p) => handPoseName(p) === name);
}

/** The arrangement a hand in this pose lays its cards out in — registered by `installHandPoses`. */
export function handLayoutOf(pose: HandPose): string {
  return `hand.${handPoseName(pose)}`;
}
/** The arrangement the default pose names — what a chair is built with. */
export const HAND_LAYOUT = handLayoutOf(HAND_POSE_DEFAULT);

/**
 * THE ARCH THE CARDS LIE AGAINST, in units — the seat design's 74px chair beside its 34px cards,
 * so a felt card (one unit) is the design's card and the chair is 2.2 of them. Read here rather
 * than off the chair, because a pose is measured against the ARCH and not against whatever shape
 * the chair happens to be drawn as: the number is the design's and the chair is drawn to it.
 */
export const ARCH_R = 1.1;

/**
 * THE POSES, AS NUMBERS — in the chair's own frame, where +y is the owner's side (the flat
 * back of the arch) and -y is the desk (the round front), +x the owner's right.
 *
 * Every position is an edge measured off the arch, as the design measures them: a stack whose
 * near edge stands a little past the rim, a fan whose bottom edge sits INSIDE the rim (the sliver
 * under the arch's face is what makes it read as held against the chair), a tucked card showing
 * only its tip past the rim. The design's pixels, over its 74px chair, in units of `ARCH_R`.
 */
const POSE = {
  /** A side pose's near edge, past the arch's centre — the design's 30px. */
  sideEdge: 0.89,
  /** A side pose's row, a little below the arch's centre — the design's 10px. */
  sideDrop: 0.3,
  /** A tucked side card's near edge — the design's 8px: most of it behind the arch. */
  sideTuck: 0.34,
  /** How far a front fan's bottom edge sits INSIDE the rim. */
  fanIn: 0.24,
  /** How much of a tucked front card shows past the rim — the tip that is pulled on. */
  tuckOut: 0.25,
  /** The fan's arc — the kit's own `fan()`, its width bounded by the spread alone. */
  fan: { spread: 60, radius: 2 },
  /** The fan shrunk — the same arc closed to a sliver of lean per card, so the count is not read. */
  fanShut: { spread: 14, radius: 2 },
  /** A side ladder's room, and the steps it may take in it. */
  ladder: { room: 2.2, look: { gapMin: 0.08, gapMax: 0.55, wideMin: 0, wideMax: 1 } as Spread },
} as const;

/** The widest and tallest of the children — a pose is measured off the cards it holds. */
function cardSize(children: readonly LayoutChild[]): { readonly w: number; readonly h: number } {
  let w = 0;
  let h = 0;
  for (const c of children) {
    if (!c.footprint) continue;
    const size = extentOf(c.footprint);
    w = Math.max(w, size.w);
    h = Math.max(h, size.h);
  }
  return { w: w || 1, h: h || 1.4 };
}

/**
 * WHERE EVERY CARD OF A HAND IN THIS POSE LIES, and at what angle — the one arithmetic both the
 * arrangement (`place`) and the lean (`layHand`) read, so a fan's cards stand exactly where their
 * angles say they do.
 *
 * WHAT THE TOGGLES MEAN ON THE FELT, where a hand lies ABOUT the arch and not across a glass: a
 * fanned hand is in FRONT of the chair, on the arc — shrunk, the arc closes to a sliver; a hand
 * that is not fanned lies on the owner's RIGHT — a ladder, every card showing, or shrunk, a stack;
 * tucked, it goes under the chair with a tip past the rim, in front if fanned and beside if not.
 */
export function posePlan(pose: HandPose, children: readonly LayoutChild[]): readonly { readonly at: Point; readonly angle: number }[] {
  const n = children.length;
  const { w, h } = cardSize(children);
  if (!pose.fan) {
    const y = POSE.sideDrop;
    if (pose.tuck) return children.map(() => ({ at: { x: POSE.sideTuck + w / 2, y }, angle: 0 }));
    if (pose.shrink) {
      const piled = stack(n);
      return piled.map((p) => ({ at: { x: POSE.sideEdge + w / 2 + p.at.x, y: y + p.at.y }, angle: 0 }));
    }
    const step = fitStep(n, POSE.ladder.room, POSE.ladder.look);
    return children.map((_c, i) => ({ at: { x: POSE.sideEdge + w / 2 + step * i, y }, angle: 0 }));
  }
  if (pose.tuck) return children.map(() => ({ at: { x: 0, y: -(ARCH_R + POSE.tuckOut) + h / 2 }, angle: 0 }));
  const middle = -(ARCH_R - POSE.fanIn) - h / 2;
  return fan(n, pose.shrink ? POSE.fanShut : POSE.fan).map((p) => ({ at: { x: p.at.x, y: middle + p.at.y }, angle: p.angle }));
}

/**
 * THE ARRANGEMENT OF ONE POSE — positions only, as every arrangement is; the lean is written by
 * `layHand` off the same plan. NO ADDRESSES: a hand is not a set of slots, a card given to it JOINS
 * it, and where it ends up is a consequence of how many there are, not of where the finger was.
 */
export function handPoseLayout(pose: HandPose): LayoutRecord {
  return { place: (children) => posePlan(pose, children).map((p) => p.at) };
}

let posesInstalled = false;
/** Register the eight arrangements by name. Idempotent — every desk that seats somebody calls it. */
export function installHandPoses(): void {
  if (posesInstalled) return;
  posesInstalled = true;
  for (const pose of HAND_POSES) registerLayout(handLayoutOf(pose), handPoseLayout(pose));
}

/** The pose a hand lies in — the default for a hand that never had one written. */
export function handPose(zone: Node): HandPose {
  const name = fieldsOf<ValuedFields>(zone, "Valued")?.values[HAND_POSE];
  return (typeof name === "string" ? handPoseOf(name) : undefined) ?? HAND_POSE_DEFAULT;
}

/**
 * PUT THE HAND IN A POSE — the name on the node, so both screens read one truth, and the
 * arrangement it names on the container. Then laid (`layHand`), because a pose is also a lean.
 */
export function setHandPose(zone: Node, pose: HandPose): void {
  const own = fieldsOf<ValuedFields>(zone, "Valued")?.values ?? {};
  compose(zone, Valued({ values: { ...own, [HAND_POSE]: handPoseName(pose) } }));
  compose(zone, Container({ layout: handLayoutOf(pose) }));
  layHand(zone);
}

/**
 * A HAND COURTED BY A CARRIED CARD COMES OUT FROM UNDER THE BAR — the owner's rule: a card on its
 * way into the hand must find the hand up, so the tuck toggle goes off (and stays off: it is the
 * pose, written on the chair). Answers whether anything was written, so the caller can tell the room.
 */
export function untuck(zone: Node): boolean {
  const pose = handPose(zone);
  if (!pose.tuck) return false;
  setHandPose(zone, { ...pose, tuck: false });
  return true;
}

/**
 * THE HAND, LAID — every card's lean written off the pose's own plan; where each stands is the
 * arrangement's and is read by the plan. Called whenever the hand changed: a card in, a card out,
 * a pose switched. The chair itself does not change: it is the arch, one size.
 */
export function layHand(zone: Node): void {
  const pose = handPose(zone);
  const children: LayoutChild[] = zone.children.map((c) => ({
    id: c.id,
    footprint: fieldsOf<{ bounds: LayoutChild["footprint"] }>(c, "Bounded")?.bounds,
    at: fieldsOf<TransformableFields>(c, "Transformable")?.at,
  }));
  const plan = posePlan(pose, children);
  zone.children.forEach((card, i) => {
    const own = fieldsOf<TransformableFields>(card, "Transformable");
    const angle = plan[i]?.angle ?? 0;
    if ((own?.angle ?? 0) !== angle) compose(card, Transformable({ ...(own ?? {}), angle }));
  });
}

/**
 * THE ROOM UNDER THE ROW FOR THE HAND'S OWN HANDLE — the tab `regrip` hangs under a hand on the
 * glass, in units. Read off the very spec the tab is drawn from — change the handle and the strip
 * follows, without anybody editing this file.
 */
export function handRoom(grip: Pick<GripSpec, "w"> = GRIP_SPEC): number {
  return grip.w / GRIP_RATIO + GRIP_GAP;
}

/**
 * HOW WIDE A ROW OF THIS MANY CARDS IS, in units — the row at the spread's own step, plus the
 * padding, and never wider than a row of `HAND.cards`. The strip on the glass is measured by it.
 */
export function handWidth(count: number, cardW = 1, look: Spread = ZONE_SPREAD): number {
  const n = Math.min(count, HAND.cards);
  return cardW + (n - 1) * look.gapMax + 2 * HAND.pad;
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
 * HIDE THE HAND — the owner sees the sides they set, everybody else sees backs.
 *
 * The kit's own second axis of facing (`Poser.others`): written on the ZONE, as the lock is, so both
 * screens read one truth and nothing is written to a card — a hidden hand turned back into an open
 * one shows exactly the sides its owner left. `same` is the stock rule for an open hand; the number
 * beside it is what the HUD's control reads its light off, and what the chair's mark reads too.
 */
export function setHandHidden(zone: Node, hidden: boolean): void {
  const own = fieldsOf<ValuedFields>(zone, "Valued")?.values ?? {};
  compose(zone, Valued({ values: { ...own, [HAND_HIDE]: hidden ? 1 : 0 } }));
  const rules = fieldsOf<PoserFields>(zone, "Poser");
  compose(zone, Poser({ ...(rules ?? {}), others: hidden ? "back" : "", owner: handOwner(zone) ?? "" }));
}

/** Whether the hand is hidden. A hand that never had the field is shown, which is what a bare zone is. */
export function handHidden(zone: Node): boolean {
  return fieldsOf<ValuedFields>(zone, "Valued")?.values[HAND_HIDE] === 1;
}

/**
 * TURN EVERY CARD IN THE HAND OVER, IN PLACE. Each card's own side goes over and the order is left
 * alone: a flip is one act on what is there, not a shuffle and not a status — which is why the
 * HUD's control for it has nothing to light.
 */
export function flipHand(zone: Node): void {
  for (const card of zone.children) if (caps(card).has("Flippable")) setFacing(card, facing(card) === "up" ? "down" : "up");
}
