// DO THESE TWO SHARE ANY GROUND — the question a table asks constantly and had no way to ask.
//
// "These two cards are touching" is the whole of what a pile IS: not a container somebody declared,
// but a fact about where things came to rest. A game that can ask it can offer to gather them; one
// that cannot has to make the player say it card by card.
//
// BY SEPARATING AXIS, on the flattened outlines. Two convex shapes miss each other if and only if
// some line can be drawn between them, and for polygons that line is parallel to one of their own
// edges — so the whole test is: project both onto every edge normal and look for a gap. It is exact
// (no sampling, no bounding-box slop) and it is the same handful of arithmetic for a card, a rounded
// rect, a token and a die's footprint alike.
//
// CONVEX ONLY, and said out loud rather than checked: every shape this kit places on a desk is
// convex, the check would cost more than the test, and a concave pair answers "they overlap" a
// little too eagerly rather than wrongly enough to matter.

import { type Point } from "./atoms/bounded.js";
import { apply, type Transform } from "./transform.js";

/** An outline moved into the space it is drawn in — what a shape looks like where it actually is. */
export function placedOutline(outline: readonly Point[], at: Transform): readonly Point[] {
  return outline.map((p) => apply(at, p));
}

/**
 * DO TWO PLACED OUTLINES TOUCH?
 *
 * `slack` is how big a gap still counts as touching, in the outlines' own units. Zero is "they
 * actually overlap"; a small positive number is what a table wants, because two cards laid side by
 * side with a hair between them are a pile to everybody looking at them. Negative asks for a real
 * overlap of at least that much.
 */
export function outlinesTouch(a: readonly Point[], b: readonly Point[], slack = 0): boolean {
  // A line and a point have no inside, so nothing can be inside them.
  if (a.length < 3 || b.length < 3) return false;
  return !apart(a, b, slack) && !apart(b, a, slack);
}

/** Is there a gap between them along any of `from`'s own edge normals? */
function apart(from: readonly Point[], other: readonly Point[], slack: number): boolean {
  for (let i = 0; i < from.length; i++) {
    const p = from[i]!;
    const q = from[(i + 1) % from.length]!;
    // The edge's normal. Which way it points does not matter: the gap is looked for on both sides.
    const nx = q.y - p.y;
    const ny = p.x - q.x;
    const len = Math.hypot(nx, ny);
    if (len === 0) continue; // a repeated vertex is not an edge and has no direction
    const ux = nx / len;
    const uy = ny / len;
    let aLow = Infinity;
    let aHigh = -Infinity;
    for (const s of from) {
      const d = s.x * ux + s.y * uy;
      if (d < aLow) aLow = d;
      if (d > aHigh) aHigh = d;
    }
    let bLow = Infinity;
    let bHigh = -Infinity;
    for (const s of other) {
      const d = s.x * ux + s.y * uy;
      if (d < bLow) bLow = d;
      if (d > bHigh) bHigh = d;
    }
    if (bLow - aHigh > slack || aLow - bHigh > slack) return true;
  }
  return false;
}

/**
 * THE ISLANDS IN A SET OF THINGS THAT TOUCH — every group that is connected, however long the chain.
 *
 * A card touching a card touching a card is ONE pile, and that is the whole reason this is a walk
 * and not a pairing: the player who dropped the fourth card onto the third was adding to the pile
 * the first two started, and nothing about how it looks says otherwise.
 *
 * `near` is asked for one pair at a time, so the caller keeps the geometry (and its own idea of how
 * close is touching) entirely to itself. Groups come back in the order their first member appears,
 * which makes the answer stable between frames for an unchanged desk.
 */
export function islands<T>(things: readonly T[], near: (a: T, b: T) => boolean): readonly (readonly T[])[] {
  const home = things.map((_, i) => i);
  const rootOf = (i: number): number => {
    let r = i;
    while (home[r] !== r) r = home[r]!;
    while (home[i] !== r) {
      const up = home[i]!;
      home[i] = r;
      i = up;
    }
    return r;
  };
  for (let i = 0; i < things.length; i++) {
    for (let j = i + 1; j < things.length; j++) {
      if (!near(things[i]!, things[j]!)) continue;
      const a = rootOf(i);
      const b = rootOf(j);
      if (a !== b) home[a] = b;
    }
  }
  const found = new Map<number, T[]>();
  for (let i = 0; i < things.length; i++) {
    const r = rootOf(i);
    const group = found.get(r);
    if (group) group.push(things[i]!);
    else found.set(r, [things[i]!]);
  }
  return [...found.values()];
}
