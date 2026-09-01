// DO TWO PIECES TOUCH — the one geometric question a game about heaps has to ask, and the grouping
// that falls out of it.
//
// Pure and headless, like `ballistic.ts` and `spring.ts`: shapes in, an answer out, no clock and no
// GPU. It is here and not in a game because it is arithmetic about `Bounded` outlines and nothing
// else — WHICH pieces are allowed to touch (a card with a card, never with a chip) is the game's
// knowledge and stays there. The kit answers "do these two overlap", never "should they".
//
// Convex outlines only, which is what `outlineOf` gives for every shape the kit builds: a rect, a
// circle flattened to a polygon, a regular polygon, a star's hull... a STAR is not convex, and on a
// concave outline the separating-axis test errs one way only — it reports a touch across a notch
// that is not there. That is the safe direction for a heap (two pieces are grouped a hair early,
// never late) and it is stated here rather than discovered.

import { type Point } from "./atoms/bounded.js";
import { apply, type Transform } from "./transform.js";

/** An outline moved into its owner's space — the points as they actually lie on the desk. */
export function placedOutline(outline: readonly Point[], at: Transform): Point[] {
  return outline.map((p) => apply(at, p));
}

/**
 * THE SEPARATING-AXIS TEST. Two convex outlines overlap unless some line between them has all of
 * one on one side and all of the other on the other; the only lines worth trying are the edge
 * normals of the two shapes.
 *
 * `slack` widens the answer: a gap no bigger than it still counts as a touch. Games need it because
 * "touching" to a player is not the mathematician's word — two cards a hair apart on a felt read as
 * touching, and a heap that refused to form until the pixels actually met would feel broken.
 */
export function outlinesTouch(a: readonly Point[], b: readonly Point[], slack = 0): boolean {
  if (a.length === 0 || b.length === 0) return false;
  return !separatedOn(a, a, b, slack) && !separatedOn(b, a, b, slack);
}

/** True if any edge normal of `edges` separates the two outlines by more than `slack`. */
function separatedOn(edges: readonly Point[], a: readonly Point[], b: readonly Point[], slack: number): boolean {
  for (let i = 0; i < edges.length; i++) {
    const p = edges[i]!;
    const q = edges[(i + 1) % edges.length]!;
    // The edge's normal. A degenerate edge (a repeated point) names no axis and is skipped rather
    // than normalised into a NaN that would report every pair as touching.
    const nx = -(q.y - p.y);
    const ny = q.x - p.x;
    const len = Math.hypot(nx, ny);
    if (len < 1e-12) continue;
    const ux = nx / len;
    const uy = ny / len;
    const A = span(a, ux, uy);
    const B = span(b, ux, uy);
    if (B.min - A.max > slack || A.min - B.max > slack) return true;
  }
  return false;
}

function span(points: readonly Point[], ux: number, uy: number): { min: number; max: number } {
  let min = Infinity;
  let max = -Infinity;
  for (const p of points) {
    const d = p.x * ux + p.y * uy;
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { min, max };
}

/**
 * THE GROUPS TOUCHING MAKES — every set of items joined by a chain of touches, transitively.
 *
 * Transitive because a heap is: three cards in a row where the ends do not meet are still one heap,
 * and a rule that only grouped pairs would leave a player holding two halves of a thing they can
 * see is one thing. Union-find, so the walk is one pass over the pairs rather than a search per
 * item, and the order of the answer is the order the items came in — a stable answer, so a heap
 * does not renumber itself between frames for no reason anyone can see.
 */
export function islands<T>(items: readonly T[], touch: (a: T, b: T) => boolean): T[][] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while (parent[root] !== root) root = parent[root]!;
    for (let at = i; parent[at] !== root; ) {
      const next = parent[at]!;
      parent[at] = root;
      at = next;
    }
    return root;
  };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      if (!touch(items[i]!, items[j]!)) continue;
      const a = find(i);
      const b = find(j);
      if (a !== b) parent[a] = b;
    }
  }
  const byRoot = new Map<number, T[]>();
  for (let i = 0; i < items.length; i++) {
    const root = find(i);
    const group = byRoot.get(root);
    if (group) group.push(items[i]!);
    else byRoot.set(root, [items[i]!]);
  }
  return [...byRoot.values()];
}


/** A coarse grid over the smaller outline: enough to tell a corner's touch from a real overlap. */
const GRAIN = 12;

/**
 * HOW MUCH OF `a` LIES INSIDE `b`, 0..1 — the difference between two things touching and two things
 * that belong together.
 *
 * Touching is a yes-or-no about edges, and edges are what a careless throw produces: a card flung
 * across a desk stops with a corner over two different piles and joins both. What a player means by
 * "these are one pile" is not that they meet but that one is ON the other, and the honest measure of
 * that is area.
 *
 * Sampled, like every other question of this shape here: the exact answer is a polygon clip, the
 * question is "is there enough of it", and a grid answers that for a hundredth of the cost. Measured
 * against `a`'s own area, so it is not symmetric — a chip mostly on a card is a lot of the chip and
 * very little of the card, and which of those two you meant is the caller's business.
 */
export function overlapFraction(a: readonly Point[], b: readonly Point[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const xs = a.map((p) => p.x);
  const ys = a.map((p) => p.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0;
  const h = Math.max(...ys) - y0;
  if (w <= 0 || h <= 0) return 0;
  let inside = 0;
  let shared = 0;
  for (let i = 0; i < GRAIN; i++) {
    for (let j = 0; j < GRAIN; j++) {
      const p = { x: x0 + (w * (i + 0.5)) / GRAIN, y: y0 + (h * (j + 0.5)) / GRAIN };
      if (!pointInside(p, a)) continue;
      inside++;
      if (pointInside(p, b)) shared++;
    }
  }
  return inside === 0 ? 0 : shared / inside;
}

/** Winding-free containment: a ray to the right, counting crossings. */
function pointInside(p: Point, poly: readonly Point[]): boolean {
  let is = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) is = !is;
  }
  return is;
}
