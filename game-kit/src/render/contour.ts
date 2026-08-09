// THE CONTOUR — a shape as the closed line a surface is painted inside and stroked along.
//
// Everything here is pure arithmetic on points, which is the point: below this line lies the
// renderer, where jsdom cannot follow. A rule about how a dash meets a corner is a rule only a
// plain unit test can hold down, so it is decided here and handed down already solved.
//
// The renderer therefore receives POINTS and has nothing to branch on. A circle arrives as a
// polygon, a rounded corner as a fan of short chords, a dashed border as a list of polylines —
// so "behaviour never reads a sort" survives the day a second renderer appears.

import { outlineOf, type Point, type Shape } from "../core/atoms/bounded.js";

/**
 * How many chords a quarter-circle corner is drawn with. Six is where the flat spots stop
 * being visible at the size a card is ever drawn; the cost is four extra points per corner.
 */
const CORNER_CHORDS = 6;

/** Below this turn a vertex is a bend in a curve; above it, a corner somebody drew. */
const CORNER_TURN = Math.PI / 6;

/**
 * The outline a SURFACE is painted inside: the node's shape with the record's corner radius
 * already applied.
 *
 * The radius belongs to the surface record, not to `Bounded` — a box is a place taken, and how
 * sharp its corners look is a matter of paint. That is why rounding happens here and not in
 * `outlineOf`, which answers a different question: where the box IS. The debug layer outlines
 * the box, so it keeps its sharp corners, and that is correct rather than an oversight.
 *
 * Rounding applies to EVERY corner of every shape, not to rects alone.
 *
 * It used to be rects only, on the reasoning that a polygon's points are the shape its author
 * drew and filing them down would be the renderer editing the model. That confused two authors.
 * The points come from whoever drew the shape; the radius comes from whoever wrote the SURFACE,
 * and they are asking for exactly this. At `radius: 0` — the default — nothing is touched, so
 * nobody is rounded who did not ask.
 *
 * A circle needs no special case and gets none: it arrives as a polygon of very shallow bends,
 * and a bend shallower than `CORNER_TURN` is not a corner, so every one of them is skipped.
 * That is also what makes a dense pasted outline safe — rounding a curve's own sampling would
 * shrink it a little on every repaint.
 */
export function surfaceOutline(shape: Shape, radius = 0): readonly Point[] {
  const outline = outlineOf(shape);
  if (radius <= 0 || outline.length < 3) return outline;

  const points: Point[] = [];
  for (let i = 0; i < outline.length; i += 1) {
    const v = outline[i]!;
    const prev = outline[(i - 1 + outline.length) % outline.length]!;
    const next = outline[(i + 1) % outline.length]!;
    const a = unit(prev, v);
    const b = unit(next, v);
    if (!a || !b) continue; // a repeated point is not a corner

    // The angle the two edges make AT the vertex. Straight through means there is nothing to
    // round; a shallow bend is a curve's own sampling and must be left alone.
    const inner = Math.acos(clamp(a.x * b.x + a.y * b.y, -1, 1));
    if (Math.PI - inner < CORNER_TURN) {
      points.push(v);
      continue;
    }

    // How far back along each edge the arc has to start, and the radius that allows it. Half
    // the shorter edge is the ceiling, so two corners sharing an edge can never overrun each
    // other — which is what makes "as round as possible" a stadium rather than a knot.
    const room = Math.min(distance(prev, v), distance(v, next)) / 2;
    const r = Math.min(radius, Math.tan(inner / 2) * room);
    const back = r / Math.tan(inner / 2);
    const start = { x: v.x + a.x * back, y: v.y + a.y * back };
    const end = { x: v.x + b.x * back, y: v.y + b.y * back };

    // The centre sits along the bisector, at the distance where the circle touches both edges.
    // The bisector of the two edge directions points INTO the corner, so this is right for a
    // concave vertex as much as a convex one — a star's inner points round too.
    const bx = a.x + b.x;
    const by = a.y + b.y;
    const bl = Math.hypot(bx, by);
    if (bl === 0 || r <= 0) {
      points.push(v);
      continue;
    }
    const away = r / Math.sin(inner / 2);
    const cx = v.x + (bx / bl) * away;
    const cy = v.y + (by / bl) * away;

    const from = Math.atan2(start.y - cy, start.x - cx);
    const to = Math.atan2(end.y - cy, end.x - cx);
    // The short way round: the long way would sweep the arc across the shape.
    let sweep = to - from;
    while (sweep > Math.PI) sweep -= Math.PI * 2;
    while (sweep < -Math.PI) sweep += Math.PI * 2;
    // Chords in proportion to the turn: a right angle gets `CORNER_CHORDS`, a gentle bend
    // fewer. A fixed count spends the same points on a corner nobody can see.
    const steps = Math.max(1, Math.round((CORNER_CHORDS * Math.abs(sweep)) / (Math.PI / 2)));
    for (let s = 0; s <= steps; s += 1) {
      const t = from + (sweep * s) / steps;
      points.push({ x: cx + Math.cos(t) * r, y: cy + Math.sin(t) * r });
    }
  }
  return points;
}

function unit(from: Point, at: Point): Point | undefined {
  const dx = from.x - at.x;
  const dy = from.y - at.y;
  const len = Math.hypot(dx, dy);
  return len === 0 ? undefined : { x: dx / len, y: dy / len };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** The length of a closed contour, in whatever units its points are in. */
export function perimeter(points: readonly Point[]): number {
  let total = 0;
  for (let i = 0; i < points.length; i += 1) {
    total += distance(points[i]!, points[(i + 1) % points.length]!);
  }
  return total;
}

/**
 * A closed contour moved `distance` towards its own INSIDE — positive inward, negative outward.
 *
 * This exists because of one line in the renderer. Pixi decides which side of a path a stroke
 * with `alignment ≠ 0.5` sits on by taking the SIGNED AREA of the path and reading its sign; for
 * a closed outline that is exactly right, and for a DASH it is a coin toss. A dash is an open
 * scrap of a few points: the straight ones have two points, and Pixi answers `+1` outright for
 * anything under three, while a dash that happens to cross a corner has three or four and gets
 * whatever sign its sliver of area came out as.
 *
 * Measured on the default card — a 1 × 1.4 box, radius 0.08, a 0.03 border: every straight dash
 * was drawn INSIDE the contour and every corner dash OUTSIDE it, so the border stepped a full
 * stroke width sideways at each of the four corners and back. That is the whole of the "dashed
 * border looks broken at rounded corners" report, and no amount of extra chords in the corner
 * would have touched it.
 *
 * So the side is decided HERE, where the contour is still whole and its inside is not in doubt,
 * and the dashes are cut from the already-moved line. The renderer then strokes them centred and
 * has nothing left to guess.
 *
 * Vertices come from intersecting the two moved edges — a miter, the same join a stroke would
 * have made. Two edges nearly in line have no usable intersection and a sharp spike would have a
 * far one, so both fall back to the corner moved along the bisector.
 */
export function offsetContour(points: readonly Point[], distance: number): readonly Point[] {
  if (distance === 0 || points.length < 3) return points;
  // Which way is in. The shoelace sign says which way the contour is wound, and the inside is
  // to the left of travel when it is wound one way and to the right when it is wound the other.
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  const inward = area >= 0 ? 1 : -1;
  const shift = distance * inward;

  const out: Point[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[(i - 1 + points.length) % points.length]!;
    const here = points[i]!;
    const next = points[(i + 1) % points.length]!;
    const d0 = direction(prev, here);
    const d1 = direction(here, next);
    if (!d0 || !d1) continue; // a repeated point moves nowhere

    // The left normal of each edge, moved onto it.
    const n0 = { x: -d0.y, y: d0.x };
    const n1 = { x: -d1.y, y: d1.x };
    const a0 = { x: here.x + n0.x * shift, y: here.y + n0.y * shift };
    const a1 = { x: here.x + n1.x * shift, y: here.y + n1.y * shift };

    const cross = d0.x * d1.y - d0.y * d1.x;
    if (Math.abs(cross) < 1e-9) {
      out.push(a0);
      continue;
    }
    const t = ((a1.x - a0.x) * d1.y - (a1.y - a0.y) * d1.x) / cross;
    const meet = { x: a0.x + d0.x * t, y: a0.y + d0.y * t };
    // A spike's miter runs away to infinity, and one point of a star would swallow the shape.
    // Past the limit the corner is cut off instead — the bisector, at the distance asked for.
    if (Math.hypot(meet.x - here.x, meet.y - here.y) > Math.abs(shift) * MITER_LIMIT) {
      const bx = n0.x + n1.x;
      const by = n0.y + n1.y;
      const bl = Math.hypot(bx, by) || 1;
      out.push({ x: here.x + (bx / bl) * shift, y: here.y + (by / bl) * shift });
      continue;
    }
    out.push(meet);
  }
  // A MOVE PAST THE SHAPE'S OWN MIDDLE TURNS IT INSIDE OUT, and the result is worse than
  // nothing: a 1×1 box asked to move in by 2 came back as a 3×3 box wound the other way, so an
  // inside-aligned dashed border drew itself around the OUTSIDE, three times the size of the
  // node it belongs to. The winding is what says it happened — an offset that stays inside a
  // shape cannot reverse it.
  //
  // Nothing is the honest answer: a border thicker than the shape has no inside to sit on. The
  // fill still draws, and `dashContour` makes no dashes out of fewer than two points.
  if (out.length < 3) return points;
  // AREA, NOT WINDING — and the difference cost a first attempt. Every vertex of the inverted
  // square had travelled along its own bisector, straight past the middle and out the other
  // side, and the four of them arrived in the SAME cyclic order. The shoelace sign was
  // unchanged; only the size gave it away.
  //
  // The rule left is arithmetic: moving a contour inward takes area away. Growing means the
  // shape has been turned inside out, and no amount of it is a border any more.
  const before = Math.abs(signedArea(points));
  const after = Math.abs(signedArea(out));
  const collapsed = distance > 0 ? after >= before : after <= before;
  return collapsed ? [] : out;
}

/** Twice the enclosed area, signed by the winding. Only its magnitude is read above. */
function signedArea(points: readonly Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area;
}

/** How far a miter may run out of a corner, in multiples of the offset. Pixi's own default. */
const MITER_LIMIT = 10;

function direction(from: Point, to: Point): Point | undefined {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  return len === 0 ? undefined : { x: dx / len, y: dy / len };
}

export interface DashOptions {
  /** Dash length, in the same units as the points. */
  readonly on: number;
  /** Gap length. */
  readonly off: number;
  /**
   * SVG's `stroke-dashadjust`. `stretch` scales the period so a WHOLE number of them fits the
   * contour; `none` leaves the pattern alone and lets it close on itself however it lands.
   */
  readonly adjust?: "none" | "stretch";
  /**
   * SVG's `stroke-dashcorner`. `dash` repeats the pattern separately on each side between two
   * corners, so every corner is covered by a dash rather than by whatever the walk happened to
   * be doing when it got there.
   */
  readonly corner?: "none" | "dash";
}

/**
 * A closed contour cut into the dashes of a pattern — a list of open polylines to stroke.
 *
 * Left to itself a dash pattern walked around a closed path produces a documented artifact:
 * the first and last dash MEET at the start point and read as one dash of double length. It is
 * the reason SVG grew `stroke-dashadjust` at all, and it is why `stretch` is the default here
 * rather than an option one has to know to reach for.
 *
 * The dashes are geometry, not a textured line. A texture-based dash — the usual shortcut in a
 * GPU renderer — loses the joins and caps, and its dash length drifts with the angle of the
 * line it is drawn along, so a rectangle comes out with shorter dashes on one pair of sides.
 */
export function dashContour(points: readonly Point[], options: DashOptions): readonly (readonly Point[])[] {
  const { on, off, adjust = "stretch", corner = "none" } = options;
  if (!(on > 0) || !(off > 0) || points.length < 2) return [];

  if (corner === "dash") {
    const sides = sidesOf(points);
    // With no corner sharp enough to split on — a circle, a rounded rect — there are no sides
    // to repeat the pattern on, and the honest answer is the plain walk rather than a
    // silently different one.
    if (sides.length > 1) return sides.flatMap((side) => dashOpen(side, on, off, adjust));
  }

  return dashOpen([...points, points[0]!], on, off, adjust);
}

/**
 * The corner-to-corner sides of a closed contour, split where the line actually turns.
 *
 * By angle, never by "it is a rect": a rounded rect arrives here as two dozen points and has
 * no sharp vertex at all, and a polygon the author drew may have any number of them.
 */
function sidesOf(points: readonly Point[]): readonly (readonly Point[])[] {
  const corners: number[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[(i - 1 + points.length) % points.length]!;
    const here = points[i]!;
    const next = points[(i + 1) % points.length]!;
    if (turn(prev, here, next) > CORNER_TURN) corners.push(i);
  }
  if (corners.length < 2) return [];

  return corners.map((start, k) => {
    const end = corners[(k + 1) % corners.length]!;
    const side: Point[] = [];
    for (let i = start; ; i = (i + 1) % points.length) {
      side.push(points[i]!);
      if (i === end) break;
    }
    return side;
  });
}

/** How sharply the line turns at `b`, in radians. */
function turn(a: Point, b: Point, c: Point): number {
  const before = Math.atan2(b.y - a.y, b.x - a.x);
  const after = Math.atan2(c.y - b.y, c.x - b.x);
  let d = Math.abs(after - before);
  if (d > Math.PI) d = 2 * Math.PI - d;
  return d;
}

/**
 * One open polyline cut into dashes, starting WITH a dash and — under `stretch` — ending with
 * one. That is what puts a dash on both corners of every side rather than leaving one of them
 * to land in a gap.
 */
function dashOpen(
  path: readonly Point[],
  on: number,
  off: number,
  adjust: "none" | "stretch",
): readonly (readonly Point[])[] {
  const total = lengthOf(path);
  if (total <= 0) return [];

  let dash = on;
  let gap = off;
  if (adjust === "stretch") {
    // n periods plus one closing dash: a side of length `n*(on+off) + on` starts and ends on a
    // dash. Rounding to the nearest whole n is what keeps the period near what was asked for.
    const n = Math.max(0, Math.round((total - on) / (on + off)));
    const scale = total / (n * (on + off) + on);
    dash = on * scale;
    gap = off * scale;
  }

  const out: (readonly Point[])[] = [];
  for (let at = 0; at < total - 1e-9; at += dash + gap) {
    const piece = sliceOf(path, at, Math.min(at + dash, total));
    if (piece.length > 1) out.push(piece);
  }
  return out;
}

/** The part of a polyline between two distances along it, vertices included. */
function sliceOf(path: readonly Point[], from: number, to: number): readonly Point[] {
  const out: Point[] = [];
  let walked = 0;
  for (let i = 0; i < path.length - 1; i += 1) {
    const a = path[i]!;
    const b = path[i + 1]!;
    const len = distance(a, b);
    if (len <= 0) continue;
    const start = walked;
    const end = walked + len;
    walked = end;
    if (end < from || start > to) continue;
    const enter = Math.max(from, start);
    const exit = Math.min(to, end);
    const first = lerp(a, b, (enter - start) / len);
    if (out.length === 0 || distance(out[out.length - 1]!, first) > 1e-9) out.push(first);
    out.push(lerp(a, b, (exit - start) / len));
  }
  return out;
}

function lengthOf(path: readonly Point[]): number {
  let total = 0;
  for (let i = 0; i < path.length - 1; i += 1) total += distance(path[i]!, path[i + 1]!);
  return total;
}

function distance(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function lerp(a: Point, b: Point, t: number): Point {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
