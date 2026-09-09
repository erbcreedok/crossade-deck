// WHAT A HAND HOLDS — the rule a dealing desk plays its heaps by, and the whole of what makes a
// hand an ARRAY rather than a patch of felt.
//
// A hand is its owner's cards, and a page that mirrors it — a HUD on the owner's glass, another
// screen — has to be able to say exactly which events change it. So the array is the hand's
// CHILDREN, and exactly two things mutate it: a drop by the outline into the hand (`liveTable`'s
// `zones`, which re-parents — into one's own chair or a neighbour's), and a card carried out of it
// through its picture on the owner's glass. Nothing else does. A card THROWN onto the hand lands
// where it lands — on the box, half over the outline, crooked — and it is not in the hand: it is
// not a child, a HUD never shows it, and the felt's own rule about touching never islands it with
// the cards inside the box (`joins`). It is a felt heap of its own until somebody drops it in
// properly, by the outline — the zone's own accept rule decides.
//
// THE CARDS AT A CHAIR ARE AN INDICATOR. Small (`HAND_SCALE`), close in to the arch, laid in the
// chair's pose — real nodes that travel with the chair and are seen by everybody — and NOT played
// with on the felt: no handle lifts them, no finger takes one off the chair, no tap turns one. The
// hand is played from on its owner's own glass, one picture at a time (`handHud`), and a card
// taken there is the card in the chair, in the hand from the first frame. The size is the chair's:
// put on by the lay (`layHand`), taken off by the settle that finds the card somewhere else.
//
// LOCKED, THE HAND TAKES NOTHING FROM ABOVE (`handAccept`). Other players reach a hand only by
// putting a card into it, and only while it is open.

import {
  compose,
  extentOf,
  fieldsOf,
  GRIP_GAP,
  GRIP_RATIO,
  heapOf,
  isPlaceGrip,
  stackSeats,
  TOUCHING,
  Transformable,
  type BoundedFields,
  type HeapRule,
  type Node,
  type OwnedFields,
  type TransformableFields,
} from "game-kit";
import { fitStep, type Spread } from "./felt.js";
import { layHand, isHand } from "./handZone.js";

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
      if (!piece || !piece.parent) continue;
      const own = fieldsOf<TransformableFields>(piece, "Transformable");
      if (!isHand(piece.parent)) {
        // OUT OF A HAND, A CARD IS ITS OWN SIZE AGAIN: the size a chair drew it at (`HAND_SCALE`)
        // is the chair's and comes off with the chair.
        if (own?.scale !== undefined && own.scale !== 1) {
          const { scale: _drawn, ...rest } = own;
          compose(piece, Transformable(rest));
        }
        continue;
      }
      compose(piece, Transformable({ ...(own ?? {}), angle: 0 }));
      grown.add(piece.parent);
    }
    for (const hand of grown) layHand(hand);
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
 * answers on top of it: how it is held, and how it lies.
 *
 * NO HANDLE UNDER A HAND. The cards at a chair are an indicator of the hand, not a heap to lift:
 * nothing takes them off the felt — one card at a time through their pictures on the owner's glass
 * is the whole of how a hand is played from. A card thrown onto the box is on the felt, in a heap
 * of its own if it touches another, until somebody puts it in properly.
 */
export function handRule(kind: (n: Node) => string = heapKindOf): HeapRule {
  const felt = TOUCHING(kind);
  return {
    ...felt,
    joins: (a, b) => !inAHand(a) && !inAHand(b) && felt.joins(a, b),
    seats: stackSeats,
    fan: handFan(),
    settled: handSettles(),
  };
}
