// WHICH ZONE A RELEASE BELONGS TO, when a zone is a place with a size rather than a pixel.
//
// It lives in the kit because two consumers now ask it: the catalog's magnetism page, which is
// ABOUT the reach, and a product desk where a card is let go of near somebody's hand. Asked twice
// the two answers would drift, and "did that card go into my hand" is the one question two screens
// at one desk may not disagree about.

import { caps, fieldsOf, type Node } from "../core/node.js";
import { reachOf } from "../core/atoms/reaching.js";
import { outlineOf, type BoundedFields } from "../core/atoms/bounded.js";
import { move, type Vec } from "../core/transform.js";
import { outlinesTouch, placedOutline } from "../core/overlap.js";
import { transformsOf } from "./scenePlan/index.js";

/**
 * THE ZONE A RELEASE BELONGS TO — the one whose REACH the point falls inside, and the nearest of
 * them if a release is near two.
 *
 * The wiring's own answer is "the container under this point" (`DragOptions.zoneAt`), which is exact
 * and exactly wrong for a hand: a player aiming at their area moves the card over there and lets go,
 * and "over there" is a place with a size, not a pixel. This widens the answer by the zone's own
 * reach and changes nothing else — the same accept rule, the same re-parent, the same layout.
 *
 * NEAREST and not first-found, because two zones a card's width apart would otherwise be decided by
 * the order somebody added them to the desk, which is not a thing a player can see or predict.
 */
export function zoneNear(root: Node, at: Vec, lead: Node): Node | undefined {
  // THE HANDLE IS EXACTLY WHAT TO ASK ABOUT when there is one. A run carried by its tab is a run
  // whose ANCHOR is that tab: it is the thing the hand has hold of, the thing that lands where it
  // was aimed, and the thing the whole heap comes to rest around. Asked about a card instead, the
  // answer is about whichever card the fan happened to put nearest the zone, which is not what
  // anybody aimed and is different for every card in the hand.
  //
  // A zone still never KEEPS a handle — that is `handOver`'s business, and it skips them — so the
  // tab is never laid out in the row among the cards.
  const poses = transformsOf(root);
  const shape = fieldsOf<BoundedFields>(lead, "Bounded")?.bounds;
  // THE PIECE'S OWN OUTLINE, put where it was let go of. Measured from its centre instead, half a
  // card of the answer would be the card's own size: a card visibly overlapping the zone would still
  // be "0.7 away", and every reach a reader tried would have that baked into it.
  const piece = shape ? placedOutline(outlineOf(shape), move(at.x, at.y)) : [at];
  let best: Node | undefined;
  let closest = Infinity;
  for (const zone of root.children) {
    if (!caps(zone).has("Acceptor")) continue;
    const box = fieldsOf<BoundedFields>(zone, "Bounded")?.bounds;
    const pose = poses.get(zone.id);
    if (!box || !pose) continue;
    const gap = gapBetween(piece, placedOutline(outlineOf(box), pose));
    if (gap > reachOf(zone) || gap >= closest) continue;
    closest = gap;
    best = zone;
  }
  return best;
}

/**
 * HOW FAR APART TWO OUTLINES ARE, root units — `0` for two that meet.
 *
 * Exact for convex outlines, which is what everything the kit builds gives: when two convex shapes
 * are apart, the nearest pair of points is always a vertex of one against an edge of the other, so
 * checking both ways round finds it. Overlapping, there is no distance to have and the answer is
 * nothing at all — a piece already on the zone is at the zone, and the reach is what it forgives
 * beyond that, never something it demands.
 */
function gapBetween(a: readonly Vec[], b: readonly Vec[]): number {
  if (a.length === 0 || b.length === 0) return Infinity;
  if (outlinesTouch(a, b, 0)) return 0;
  let near = Infinity;
  for (const [one, other] of [
    [a, b],
    [b, a],
  ] as const) {
    for (const p of one) {
      for (let i = 0, j = other.length - 1; i < other.length; j = i++) near = Math.min(near, toEdge(other[j]!, other[i]!, p));
    }
  }
  return near;
}

/** The distance from a point to a segment — the projection, clamped to the segment's own ends. */
function toEdge(a: Vec, b: Vec, p: Vec): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
