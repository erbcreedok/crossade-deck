// BOUNDED — the box. The first atom that divides the model, and it divides it in three ways
// at once: a finger needs a hit area, a shadow needs a silhouette, an owner's layout needs a
// place to put the child. All three are the same shape, which is why they are one atom and
// not three fields scattered about.
//
// `Bounded` PAINTS NOTHING. Compose it alone and the screen stays empty: there is an
// invisible place taken and zero pixels. A frame, a fill, a radius are parameters of a
// `surface` record (see `Surfaced`), and no "bounds outline" exists in the model at all — the
// box is visible only to the inspector and to a debug layer.

import { defineAtom } from "../atom.js";
import { fieldsOf, type Node } from "../node.js";

/**
 * Units, never pixels. The host is the only thing that knows what a unit is worth on screen,
 * and a size that arrived in pixels would be a different size on every phone.
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export type Shape =
  | { readonly kind: "rect"; readonly w: number; readonly h: number }
  | { readonly kind: "circle"; readonly r: number }
  | { readonly kind: "poly"; readonly points: readonly Point[] };

export interface BoundedFields {
  readonly size: Shape;
  /**
   * An override of THIS instance's own `size`, and nothing else. One field may not mean two
   * things: it is not "keep the content inside" — children are placed by a LAYOUT and cannot
   * leave a row or a grid by construction.
   */
  readonly bounds: Shape | undefined;
}

/**
 * The default is a 1×1 rect — a SQUARE, and that has to be said out loud rather than left to
 * be inferred, or the catalog reads as "elements are square". It is the plainest shape that
 * shows a box exists, not a statement about what a card looks like.
 */
export const Bounded = defineAtom<BoundedFields>({
  name: "Bounded",
  requires: [],
  // An absent optional field is declared with an explicit `undefined`, not omitted: `own`
  // means "no value, no field", and the class table must still cover it.
  defaults: { size: { kind: "rect", w: 1, h: 1 }, bounds: undefined },
  classes: { size: "own", bounds: "own" },
});

/**
 * The shape this node actually occupies: `bounds` when the instance overrode itself, `size`
 * otherwise. A node without the atom has no footprint at all — `undefined`, not a zero box,
 * because "takes no room" and "is not in the layout" are different answers.
 */
export function footprint(n: Node): Shape | undefined {
  const f = fieldsOf<BoundedFields>(n, "Bounded");
  return f ? (f.bounds ?? f.size) : undefined;
}

/**
 * A shape as a closed outline, in units around its own centre. Resolving it HERE is what keeps
 * `.kind` out of everything downstream: a renderer handed points has nothing to branch on, and
 * the rule "behaviour never reads a sort" survives the arrival of a debug layer.
 *
 * A circle becomes a many-sided polygon. At the size a box is ever drawn the difference is
 * invisible, and the alternative is a second drawing primitive that exists for one shape.
 */
export function outlineOf(shape: Shape, segments = 48): readonly Point[] {
  if (shape.kind === "rect") {
    const { w, h } = shape;
    return [
      { x: -w / 2, y: -h / 2 },
      { x: w / 2, y: -h / 2 },
      { x: w / 2, y: h / 2 },
      { x: -w / 2, y: h / 2 },
    ];
  }
  if (shape.kind === "circle") {
    return Array.from({ length: segments }, (_, i) => {
      const a = (i / segments) * Math.PI * 2;
      return { x: Math.cos(a) * shape.r, y: Math.sin(a) * shape.r };
    });
  }
  return shape.points;
}

/** The axis-aligned extent of a shape, in units. Every shape answers, including a polygon. */
export function extentOf(shape: Shape): { readonly w: number; readonly h: number } {
  if (shape.kind === "rect") return { w: shape.w, h: shape.h };
  if (shape.kind === "circle") return { w: shape.r * 2, h: shape.r * 2 };
  if (shape.points.length === 0) return { w: 0, h: 0 };
  const xs = shape.points.map((p) => p.x);
  const ys = shape.points.map((p) => p.y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}
