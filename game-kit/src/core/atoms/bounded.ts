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

/**
 * One step of a path: a straight run to `to`, or a cubic curve to it through two handles.
 *
 * Cubic and nothing else, on purpose. Every drawing tool anyone would paste from — Figma,
 * Illustrator, an SVG file — exports cubics or converts to them, and one segment kind means one
 * flattening routine rather than four. A quadratic is a cubic; an arc is a few of them.
 */
export interface PathSegment {
  readonly to: Point;
  readonly c1?: Point;
  readonly c2?: Point;
}

/**
 * A SHAPE IS A PATH, and there is no second sort of one.
 *
 * There used to be four — `rect`, `circle`, `poly`, `path` — and every consumer branched on the
 * tag: flattening, extent, transform, the contour walk. Four branches for a distinction that
 * does not exist in the geometry: a rect IS a path of four straight runs, a circle IS an
 * ellipse with equal radii, a polygon IS a path with no curves. The tag bought nothing and
 * cost a branch everywhere, which is exactly the shape of mistake `guard.no-kind` was written
 * to catch — and it was living in the type the guard exempts.
 *
 * What a designer actually wants — a card, a chip, an octagon, a star — comes from HELPERS
 * that build a path (`rect`, `ellipse`, `polygon`, `star`, …). They are ordinary exported
 * functions, so a reader's snippet says `rect(1, 1.4)` rather than a soup of coordinates, and
 * nothing in the model has to know the word "star".
 *
 * NOT a collider. A hit test that has to bounce a puck wants an analytic circle, not points —
 * and it will get one, from its own atom, the way Godot, Unity and Box2D all separate the
 * drawn shape from the colliding one. That is also why an irregular texture can carry a
 * perfectly round collider, which is the whole trick of an air-hockey table.
 */
export interface Shape {
  readonly start: Point;
  readonly segments: readonly PathSegment[];
}

export interface BoundedFields {
  /**
   * The box, and the ONLY field — the atom is `Bounded`, the field is `bounds`, the accessor
   * is `footprint()`: one word at all three levels.
   *
   * There used to be a second, `size`, which `bounds` overrode. It read as two ideas — "what
   * the node declares" against "what askers are told" — and it was neither: `footprint()` was
   * the only way in, and it always answered `bounds ?? size`, so nothing in the kit ever saw
   * the declared one. Two fields, one observable meaning, and a catalog page teaching a
   * distinction that did not exist.
   *
   * The idea behind the pair is still a good one — a round grip on a rectangular card, so a
   * finger and a layout get different shapes. It needs TWO askers, and the kit has one. It
   * comes back the day the second is written, shaped by that asker rather than guessed at
   * ahead of it. This is the same rule that took `fit` and `align` off `Surfaced`.
   *
   * What it is NOT, in either form: "keep the content inside". Children are placed by a
   * LAYOUT and cannot leave a row or a grid by construction.
   */
  readonly bounds: Shape;
}

/**
 * The default is a 1×1 rect — a SQUARE, and that has to be said out loud rather than left to
 * be inferred, or the catalog reads as "elements are square". It is the plainest shape that
 * shows a box exists, not a statement about what a card looks like.
 */
export const Bounded = defineAtom<BoundedFields>({
  name: "Bounded",
  requires: [],
  // Written out rather than built with `rect()` from `core/shapes.ts`: the helpers stand ON
  // this module, and reaching back for one here would be a cycle. Four straight runs, 1×1.
  defaults: {
    bounds: {
      start: { x: -0.5, y: -0.5 },
      segments: [{ to: { x: 0.5, y: -0.5 } }, { to: { x: 0.5, y: 0.5 } }, { to: { x: -0.5, y: 0.5 } }],
    },
  },
  classes: { bounds: "own" },
});

/**
 * The shape this node occupies. A node without the atom has no footprint at all —
 * `undefined`, not a zero box, because "takes no room" and "is not in the layout" are
 * different answers.
 *
 * Everything downstream asks HERE and never reaches for the field: a layout, a surface's area
 * and the plan all go through this one door. That is what would make a second shape possible
 * later without touching any of them.
 */
export function footprint(n: Node): Shape | undefined {
  return fieldsOf<BoundedFields>(n, "Bounded")?.bounds;
}

/**
 * A shape as a closed outline, in units around its own centre — the one place a curve becomes
 * points. Everything downstream is handed the result and has nothing to branch on, which is
 * what lets a debug layer, a dash walk and a second renderer be written without any of them
 * learning what an ellipse is.
 *
 * By ADAPTIVE subdivision rather than a fixed count: a
 * fixed count spends the same points on a gentle bend as on a tight one, so a curve is either
 * faceted where it turns or wasteful where it does not. Splitting until the curve is flat to
 * `FLATNESS` gives points where the shape needs them and none where it does not.
 */
export function outlineOf(shape: Shape): readonly Point[] {
  const points: Point[] = [shape.start];
  let from = shape.start;
  for (const seg of shape.segments) {
    if (seg.c1 && seg.c2) flattenCubic(from, seg.c1, seg.c2, seg.to, points);
    else points.push(seg.to);
    from = seg.to;
  }
  // A shape is a REGION, so it closes itself. A final segment back onto the start would be a
  // zero-length edge, and a zero-length edge is a corner with no direction — which is precisely
  // what the rounding and the dash walks cannot make sense of.
  if (points.length > 1 && near(points[points.length - 1]!, shape.start)) points.pop();
  return points;
}

/**
 * How far a flattened curve may sit from the real one, in UNITS. A unit is about a card's
 * width, so this is well under a pixel at any size a card is ever drawn — and being in units
 * rather than pixels is what keeps the outline the same shape on every screen.
 */
const FLATNESS = 0.004;

/** A guard on the recursion, not a quality setting: a cusp can otherwise split forever. */
const MAX_DEPTH = 16;

function flattenCubic(p0: Point, c1: Point, c2: Point, p1: Point, out: Point[], depth = 0): void {
  // Flat enough when both handles lie close to the chord. Measuring the HANDLES rather than the
  // midpoint is what catches an S-curve, whose midpoint sits on the chord while the curve does
  // not go anywhere near it.
  if (depth >= MAX_DEPTH || (lineGap(p0, p1, c1) <= FLATNESS && lineGap(p0, p1, c2) <= FLATNESS)) {
    out.push(p1);
    return;
  }
  const ab = mid(p0, c1);
  const bc = mid(c1, c2);
  const cd = mid(c2, p1);
  const abc = mid(ab, bc);
  const bcd = mid(bc, cd);
  const middle = mid(abc, bcd);
  flattenCubic(p0, ab, abc, middle, out, depth + 1);
  flattenCubic(middle, bcd, cd, p1, out, depth + 1);
}

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const near = (a: Point, b: Point): boolean => Math.hypot(a.x - b.x, a.y - b.y) < 1e-9;

/** Distance from `p` to the segment `a`–`b`, treating a zero-length segment as a point. */
function lineGap(a: Point, b: Point, p: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dy * (p.x - a.x) - dx * (p.y - a.y)) / len;
}

/** The axis-aligned extent of a shape, in units. Every shape answers, including a polygon. */
export function extentOf(shape: Shape): { readonly w: number; readonly h: number } {
  // On the FLATTENED points, never on the handles: a handle can sit well outside the curve it
  // pulls, and a box drawn round the handles would reserve room the shape never uses.
  const points = outlineOf(shape);
  if (points.length === 0) return { w: 0, h: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return { w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
}

