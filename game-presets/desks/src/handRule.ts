// WHAT A HAND HOLDS — the rule a dealing desk plays its heaps by, and the whole of what makes a
// hand an ARRAY rather than a patch of felt.
//
// A hand is its owner's cards, and a page that mirrors it — a HUD beside the desk, another screen —
// has to be able to say exactly which events change it. So the array is the hand's CHILDREN, and
// exactly three things mutate it: a drop by the outline into the hand (`liveTable`'s `zones`, which
// re-parents), a lift by the hand's own handle, and a card carried out of it. Nothing else does. A
// card THROWN onto the hand lands where it lands — on the box, half over the outline, crooked —
// and it is not in the hand: it is not a child, a HUD never shows it, and the felt's own rule about
// touching never islands it with the cards inside the box (`joins`). Until:
//
//   1. somebody drops it in properly, by the outline — the zone's own accept rule decides; or
//   2. THE OWNER LIFTS THE HAND BY ITS HANDLE. The handle takes the hand's own cards and every card
//      lying on the box (`held`), and up they come as one run and fall into line — the strays are
//      merged into the hand by the lift, and when the run comes down in the hand they are children.
//
// LOCKED, THE HAND TAKES NOTHING FROM ABOVE: neither a drop (`handAccept`) nor a lift — a shut hand
// lifted by its handle is its own cards and not one more.
//
// The handle is the OWNER'S. `regrip` writes the place's owner on the tab, and the desk's own
// permission (`mayTake`) refuses every other finger: a hand lifted whole by a neighbour is a hand
// dealt away. Other players reach a hand one card at a time, through the box, and only while it
// is open.

import {
  compose,
  extentOf,
  fieldsOf,
  GRIP_GAP,
  GRIP_RATIO,
  heapOf,
  isDrawn,
  isPlaceGrip,
  outlineOf,
  overlapFraction,
  placedOutline,
  stackSeats,
  TOUCHING,
  Transformable,
  transformsOf,
  type BoundedFields,
  type HeapRule,
  type Node,
  type OwnedFields,
  type TransformableFields,
} from "game-kit";
import { fitStep, type Spread } from "./felt.js";
import { growHand, handLocked, isHand } from "./handZone.js";

/**
 * HOW MUCH OF A LOOSE CARD MUST LIE OVER THE BOX for the handle to take it up with the hand.
 *
 * Small on purpose: a card dealt onto a hand by a throw lands crooked and half off the outline, and
 * that is exactly the card the lift is for. A card merely brushing the corner is on the felt.
 */
export const HELD_SHARE = 0.15;

/** WHAT A HAND LOOKS LIKE IN THE AIR — the fan's spread, and the lean of its outermost card. */
export const FAN_SPREAD: Spread = { gapMin: 0.05, gapMax: 0.5, wideMin: 0.16, wideMax: 0.62 };
export const FAN_TILT = 26;

/** A piece heaps by the name it carries (`Heaping`) — cards only, on a dealing desk. */
export function heapKindOf(n: Node): string {
  return heapOf(n) ?? "";
}

/** Every hand on the desk, wherever the desk keeps its chairs — a walk, not a guess at a layer. */
export function handsOf(root: Node): Node[] {
  const out: Node[] = [];
  const walk = (n: Node): void => {
    if (isHand(n)) out.push(n);
    else for (const c of n.children) walk(c);
  };
  walk(root);
  return out;
}

/** Whose handle this is — the owner `regrip` wrote on a place's tab, or nothing for a heap's. */
export function gripOwner(tab: Node): string | undefined {
  if (!isPlaceGrip(tab)) return undefined;
  const box = fieldsOf<OwnedFields>(tab, "Owned")?.box;
  return box === undefined || box === "" ? undefined : box;
}

/** Whether this piece lies in a hand — the one fact `joins` needs. */
function inAHand(n: Node): boolean {
  return n.parent !== null && isHand(n.parent);
}

/**
 * THE HANDS' OWN HANDLES — one per hand holding anything, lifting what is written above.
 *
 * `under` is the hand itself, so the tab always hangs under the box (`heapBox` measures the box in
 * its own frame, so it hangs under the hand's OWN low edge, turned as the hand is); `pieces` is the
 * hand's children first — the order they lie in — and then whatever lies on the box, in the desk's
 * own order, while the hand is open.
 */
function handHolds(share: number, kind: (n: Node) => string): NonNullable<HeapRule["held"]> {
  return (root, aloft) => {
    const poses = transformsOf(root);
    const out: { under: Node; pieces: Node[] }[] = [];
    for (const hand of handsOf(root)) {
      const box = fieldsOf<BoundedFields>(hand, "Bounded")?.bounds;
      const pose = poses.get(hand.id);
      if (!box || !pose) continue;
      const pieces = hand.children.filter((n) => !aloft(n.id) && !isDrawn(n));
      if (!handLocked(hand)) {
        const area = placedOutline(outlineOf(box), pose);
        for (const loose of root.children) {
          if (aloft(loose.id) || isDrawn(loose) || kind(loose) === "") continue;
          const shape = fieldsOf<BoundedFields>(loose, "Bounded")?.bounds;
          const at = poses.get(loose.id);
          if (!shape || !at) continue;
          if (overlapFraction(placedOutline(outlineOf(shape), at), area) >= share) pieces.push(loose);
        }
      }
      out.push({ under: hand, pieces });
    }
    return out;
  };
}

/**
 * A HAND SPLAYED — laid out by its WIDTH, and turned to match.
 *
 * The width is the thing a reader has an opinion about ("a hand may take the whole desk if it has
 * to"), so it is the width the numbers control and the angles that follow: each card stands at the
 * x its share of the spread gives it, and its turn is the angle that x sits at on the arc. The arc
 * itself is derived from the two — the radius is whatever makes the outermost card lean by `tilt` —
 * so a wide hand is a shallow sweep and a narrow one is a steep one, which is what a hand does.
 *
 * The middle card sits exactly where the squared stack would have put it, so a hand opening and
 * closing does not also drift up or down the finger.
 */
export function handFan(look: Spread = FAN_SPREAD, tilt = FAN_TILT): NonNullable<HeapRule["fan"]> {
  return (group, gripW, room) => {
    const step = fitStep(group.length, room, look);
    const half = (step * Math.max(0, group.length - 1)) / 2;
    const arc = tilt > 0 && half > 0 ? half / Math.sin((tilt * Math.PI) / 180) : 0;
    return group.map((piece, i) => {
      const shape = fieldsOf<BoundedFields>(piece, "Bounded")?.bounds;
      const hangs = gripW / GRIP_RATIO / 2 + GRIP_GAP + (shape ? extentOf(shape).h / 2 : 0);
      const x = -half + step * i;
      const a = arc > 0 ? Math.asin(Math.max(-1, Math.min(1, x / arc))) : 0;
      return { at: { x: x || 0, y: -hangs + (arc > 0 ? arc * (1 - Math.cos(a)) : 0) || 0 }, deg: (a * 180) / Math.PI };
    });
  };
}

/**
 * WHAT THE HAND DOES TO WHAT WAS JUST PUT IN IT — squared up and the box grown to fit.
 *
 * The lean a lift put on a card comes off: the fan is how a hand is HELD, not how it lies, and a
 * card in the box lies level to its owner (the box itself is turned to them, `seatChair`). Then the
 * box is re-measured, because it is the size of what is in it.
 */
function handSettles(): NonNullable<HeapRule["settled"]> {
  return (root, ids) => {
    const grown = new Set<Node>();
    for (const id of ids) {
      const piece = findIn(root, id);
      if (!piece || !piece.parent || !isHand(piece.parent)) continue;
      const own = fieldsOf<TransformableFields>(piece, "Transformable");
      compose(piece, Transformable({ ...(own ?? {}), angle: 0 }));
      grown.add(piece.parent);
    }
    for (const hand of grown) growHand(hand);
  };
}

function findIn(root: Node, id: string): Node | undefined {
  if (root.id === id) return root;
  for (const c of root.children) {
    const hit = findIn(c, id);
    if (hit) return hit;
  }
  return undefined;
}

/**
 * THE RULE A DEALING DESK PLAYS BY — the felt's own touching for loose cards, and the hand's own
 * three answers on top of it: what its handle lifts, how it is held, and how it lies.
 */
export function handRule(kind: (n: Node) => string = heapKindOf, share = HELD_SHARE): HeapRule {
  const felt = TOUCHING(kind);
  return {
    ...felt,
    // A CARD IN A HAND IS THE HAND'S: it heaps with nothing on the felt, and nothing on the felt
    // heaps with it — however closely a thrown card lies over it.
    joins: (a, b) => !inAHand(a) && !inAHand(b) && felt.joins(a, b),
    seats: stackSeats,
    held: handHolds(share, kind),
    fan: handFan(),
    settled: handSettles(),
  };
}
