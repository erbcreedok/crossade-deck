// A LINE, AND WHAT STANDS AT ITS ENDS — one preset, and the family it covers.
//
// A straight run, a bowed one, a swoosh pasted from a drawing tool, an arrow, a double-headed
// arrow, a measurement bar: all of them are this one call with different numbers. There is no
// `Arrow` in the model and there is not going to be one — `arrow()` builds ORDINARY NODES out of
// the atoms everyone else uses, and nothing downstream learns a new word.
//
// THE RUN IS A WALK OUT AND BACK. A contour in this kit is a closed region — see `Surfaced/Line`
// on the shelf — so a path meant to read as a line is walked to its far end and then walked home
// along itself. The return retraces the outward journey exactly (a cubic reverses onto itself
// when its handles are swapped), so the two coincide, the closing edge has no length, and what
// is left on the glass is the stroke. Nothing is enclosed, which is the point: a line has an
// inside only if you draw one.
//
// A HEAD IS NOT PART OF THAT WALK, and that is the load-bearing decision here. It is its own
// node, so it wears its own record: a filled triangle on the end of a hairline, a suit pasted
// from a drawing tool, a piece, a box with a picture on it. Sewn into the line's contour it
// would be stuck with the line's paint and with being a path at all, which is exactly the
// ceiling this preset must not have.
//
// A head is therefore just a SHAPE, drawn once in its own unit square. What it LOOKS like is not
// this file's business and is not a field here: a texture is a layer of a record, which the kit
// already has, and a second way to say it would be a second way to get it wrong.

import { add, node, type Node } from "../core/node.js";
import { Bounded, type Point, type PathSegment, type Shape } from "../core/atoms/bounded.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { polyline, transformShape } from "../core/path.js";
import { circle } from "./shapes.js";

/**
 * A head is a SHAPE, drawn once in its own unit square: pointing along +x, its tip at the origin,
 * reaching back to `x = -1` and no further than half a unit either side. The preset scales it to
 * the size asked for, turns it to face the way the path is going, and puts it on the tip — so an
 * author registering a knight or a spade draws it the one way and never thinks about angles.
 */
const HEADS = new Map<string, Shape>();

export function registerHead(name: string, shape: Shape): void {
  HEADS.set(name, shape);
}

/** `undefined` for a name nobody registered — the end is then simply bare, and the scene lives. */
export function headShape(name: string): Shape | undefined {
  return HEADS.get(name);
}

export function headNames(): readonly string[] {
  return [...HEADS.keys()];
}

/** Test seam only — the registry is process-wide and suites must not leak into each other. */
export function resetHeads(): void {
  HEADS.clear();
}

/** Head size when the caller does not say, in units. */
const HEAD = 0.28;
/** The record a run wears when the caller does not say. Stroke, no layers: a line has no inside. */
const INK = "ink";

export interface LineSpec {
  readonly from: Point;
  readonly to: Point;
  /**
   * Places the run is dragged through, in order. The path is SMOOTH through them — a corner is
   * two lines meeting, and a caller who wants one says so by making two lines.
   */
  readonly through?: readonly Point[];
  /**
   * How far the middle of the run is pulled sideways, in units. Zero is a straight run, and it
   * is a number rather than a choice between "straight" and "curved" because there is no such
   * choice in the geometry: a curve is where the places are, and `bend` puts one there.
   */
  readonly bend?: number;
}

/** The run as the `Shape` a node's `bounds` would hold — the path alone, with nothing on it. */
export function line(spec: LineSpec): Shape {
  return outAndBack(path(spec));
}

/**
 * THE OPEN PATH the run follows: from one end to the other, once.
 *
 * Exported because it is the piece worth reusing. Two of these join into a route (`joinPath`), and
 * whatever walks a path over time — a trail, a rail for an animation — wants the journey, not the
 * closed contour a surface needs. `line` is this, walked home again.
 */
export function path(spec: LineSpec): Shape {
  return spineOf(spec);
}

/**
 * An open path as a CONTOUR a surface can paint: out along it, and back along it.
 *
 * A contour in this kit is a closed region, so this is how a path is handed to `Bounded` without
 * growing an inside — the return retraces the outward journey exactly (a cubic reverses onto
 * itself when its handles are swapped), the two coincide, and the closing edge has no length.
 */
export function outAndBack(open: Shape): Shape {
  return { start: open.start, segments: [...open.segments, ...reversed(open).segments] };
}

export interface ArrowSpec extends LineSpec {
  /** The node's name. Its parts are `path`, `start` and `end` beneath it. */
  readonly id?: string;
  /** The record the RUN wears. */
  readonly surface?: string;
  /**
   * And the record each HEAD wears — one per end, absent means it wears the line's.
   *
   * Separate names because a head is a separate node, and that is the whole reason it is one: a
   * hairline run can carry a filled point, and the two ends need not even agree with each other —
   * a hollow ring where it starts, a solid head where it lands.
   */
  readonly startSurface?: string;
  readonly endSurface?: string;
  /** The head standing at `from`, by registry name. The end itself is `from`; this is what is on it. */
  readonly startHead?: string;
  /** And the head at `to`. TWO ENDS, INDEPENDENTLY: that is the whole arrow family. */
  readonly endHead?: string;
  /**
   * How big each head is, in units — one number per end, because the ends are not obliged to
   * match. A small dot where a run begins and a big point where it lands is the ordinary case,
   * and a single shared size could not say it.
   */
  readonly startSize?: number;
  readonly endSize?: number;
}

/**
 * The whole thing as a NODE: the run, and a child for each end that has something standing on it.
 *
 * Three nodes rather than one contour, because a head has a life of its own — its own paint, its
 * own picture, its own record. What comes back is an ordinary little tree: a reader can take it
 * apart, move a head, or re-register the record one of them names.
 */
export function arrow(spec: ArrowSpec): Node {
  const root = node(spec.id ?? "arrow");
  const run = line(spec);
  const surface = spec.surface ?? INK;
  add(root, node("path", Bounded({ bounds: run }), Surfaced({ surface })));

  const spine = path(spec);
  const places = pointsOf(spine);
  const tip = places[places.length - 1]!;
  headOn(root, "end", spec.endHead, tip, outAt(tip, handleBefore(spine)), spec.endSize ?? HEAD, spec.endSurface ?? surface);
  headOn(
    root,
    "start",
    spec.startHead,
    spine.start,
    outAt(spine.start, handleAfter(spine)),
    spec.startSize ?? HEAD,
    spec.startSurface ?? surface,
  );
  return root;
}

/**
 * One end, as its own node — or nothing at all.
 *
 * An unregistered name draws nothing and does not throw: the kit's standing answer to a reference
 * it does not recognise, and here it is also how "this end is bare" is said.
 */
function headOn(root: Node, id: string, name: string | undefined, tip: Point, out: Point, size: number, worn: string): void {
  const head = name ? HEADS.get(name) : undefined;
  if (!head) return;
  const placed = transformShape(head, {
    scaleX: size,
    scaleY: size,
    rotate: (Math.atan2(out.y, out.x) * 180) / Math.PI,
    offsetX: tip.x,
    offsetY: tip.y,
  });
  add(root, node(id, Bounded({ bounds: placed }), Surfaced({ surface: worn })));
}

/**
 * The path from one end to the other, before anything is drawn on it.
 *
 * Two places make a straight segment and three or more a smooth run, so the shape of the call
 * follows the shape of the answer: nothing here decides between a "line" and a "curve".
 */
function spineOf(spec: LineSpec): Shape {
  const places = bowed([spec.from, ...(spec.through ?? []), spec.to], spec.bend ?? 0);
  return places.length === 2 ? { start: places[0]!, segments: [{ to: places[1]! }] } : smooth(places);
}

/**
 * The run bowed sideways, ends held.
 *
 * Every interior place is pushed perpendicular to the straight line between the ends, by the
 * most in the middle and by nothing at either end — so a bend added to a path that already
 * curves bows THAT path, rather than replacing it. A run with no interior place is given one,
 * because there has to be something to push.
 */
function bowed(places: readonly Point[], bend: number): readonly Point[] {
  if (bend === 0 || places.length < 2) return places;
  const from = places[0]!;
  const to = places[places.length - 1]!;
  const run = minus(to, from);
  const span = Math.hypot(run.x, run.y);
  if (span === 0) return places;
  const side = { x: -run.y / span, y: run.x / span };
  const middle = places.length === 2 ? [half(from, to)] : places.slice(1, -1);
  const bulge = (p: Point): Point => {
    const t = ((p.x - from.x) * run.x + (p.y - from.y) * run.y) / (span * span);
    return along(p, side, bend * Math.sin(Math.PI * Math.min(1, Math.max(0, t))));
  };
  return [from, ...middle.map(bulge), to];
}

/**
 * A smooth path through every place, as cubics — Catmull-Rom, which is the spline that passes
 * THROUGH its points rather than being pulled at by them. A caller naming three places means the
 * path goes through all three; a spline that merely leaned towards them would be a different
 * promise and a worse one.
 */
function smooth(places: readonly Point[]): Shape {
  const at = (i: number): Point => places[Math.min(places.length - 1, Math.max(0, i))]!;
  const segments: PathSegment[] = [];
  for (let i = 0; i < places.length - 1; i += 1) {
    const p1 = at(i);
    const p2 = at(i + 1);
    segments.push({
      c1: along(p1, minus(p2, at(i - 1)), 1 / 6),
      c2: along(p2, minus(at(i + 2), p1), -1 / 6),
      to: p2,
    });
  }
  return { start: places[0]!, segments };
}

/**
 * The same path walked backwards — exactly, not approximately.
 *
 * A cubic run backwards is the same cubic with its handles swapped, so the return journey lies
 * on the outward one to the last decimal. Flattening it into points first would put a coarser
 * copy of the path next to the original and the stroke would come out fat in the middle.
 */
function reversed(shape: Shape): Shape {
  const places = pointsOf(shape);
  const segments: PathSegment[] = [];
  for (let i = shape.segments.length - 1; i >= 0; i -= 1) {
    const seg = shape.segments[i]!;
    const to = places[i]!;
    segments.push(seg.c1 && seg.c2 ? { c1: seg.c2, c2: seg.c1, to } : { to });
  }
  return { start: places[places.length - 1]!, segments };
}

function pointsOf(shape: Shape): readonly Point[] {
  return [shape.start, ...shape.segments.map((s) => s.to)];
}

/** The place the path comes FROM as it arrives at the far end: a handle when there is one. */
function handleBefore(shape: Shape): Point {
  const last = shape.segments[shape.segments.length - 1];
  const places = pointsOf(shape);
  return last?.c2 ?? places[places.length - 2] ?? shape.start;
}

/** And the place it heads towards as it leaves the near end. */
function handleAfter(shape: Shape): Point {
  const first = shape.segments[0];
  return first?.c1 ?? first?.to ?? shape.start;
}

/**
 * Which way is OUT at a tip. A zero-length path has no direction to give, and the answer is
 * along x — a head pointing somewhere beats one collapsed onto its own tip.
 */
function outAt(tip: Point, inner: Point): Point {
  const away = minus(tip, inner);
  const span = Math.hypot(away.x, away.y);
  return span === 0 ? { x: 1, y: 0 } : { x: away.x / span, y: away.y / span };
}

function minus(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

function along(p: Point, d: Point, k: number): Point {
  return { x: p.x + d.x * k, y: p.y + d.y * k };
}

function half(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * The stock heads, drawn pointing along +x with their tip at the origin.
 *
 * Four, because four is what the cases ask for: `pointer` is the arrow everyone means, `begin`
 * marks where a run starts, `stop` is the flat end of a measurement, and `diamond` reads as a
 * token on the end of a link. Each is a plain closed shape, so the RECORD decides whether it
 * comes out filled, outlined or carrying a picture — and a fifth head is a `registerHead` call
 * with any shape at all behind it, a pasted suit or a piece included.
 */
export function installStockHeads(): void {
  registerHead(
    "pointer",
    polyline([
      { x: 0, y: 0 },
      { x: -1, y: 0.5 },
      { x: -0.72, y: 0 },
      { x: -1, y: -0.5 },
    ]),
  );
  registerHead(
    "stop",
    polyline([
      { x: 0.12, y: -0.5 },
      { x: 0.12, y: 0.5 },
      { x: -0.12, y: 0.5 },
      { x: -0.12, y: -0.5 },
    ]),
  );
  registerHead(
    "diamond",
    polyline([
      { x: 0, y: 0 },
      { x: -0.5, y: 0.4 },
      { x: -1, y: 0 },
      { x: -0.5, y: -0.4 },
    ]),
  );
  registerHead("begin", transformShape(circle(0.45), { offsetX: -0.45 }));
}
