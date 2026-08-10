// A PATH: how one is built from places, how one arrives from a drawing tool, and how one is
// moved. Three mechanisms — the named figures a designer asks for are PRESETS and live in
// `presets/`, because `rect` is data about what people draw and this is what a path can do.
//
// A `Shape` is one thing: a path. That is the geometry, and it has no sorts. A tagged union put
// the vocabulary into the type, so every consumer branched on it and every new figure meant a
// new branch in five files. Here a figure is an ordinary function that returns one of these,
// and nothing downstream learns its name — a star is not a case the renderer has to handle, it
// is a path that flattens like every other.
//
// Everything here is in UNITS and centred on the node's origin — the point `at` places and a
// rotation turns about — unless the caller moves it.

import { type PathSegment, type Point, type Shape } from "./atoms/bounded.js";

/** A closed run of straight lines through the given corners. */
export function polyline(points: readonly Point[]): Shape {
  if (points.length === 0) return { start: { x: 0, y: 0 }, segments: [] };
  return { start: points[0]!, segments: points.slice(1).map((to) => ({ to })) };
}

/**
 * AN SVG PATH, PASTED — the `d` attribute out of Figma, Illustrator or an `.svg` file.
 *
 * In the kit rather than the catalog, because this is how a shape actually arrives from a
 * designer: through the clipboard. A reader who pastes one wants `fromSvgPath(d)` in their own
 * code, not a helper that only exists on this website.
 *
 * Everything a tool emits reduces to straight runs and cubics: a quadratic is a cubic with its
 * handles pulled two thirds of the way out, the shorthands (`S`, `T`) are the previous handle
 * mirrored, `H`/`V` are lines. So the parser converts rather than declining, and nobody has to
 * know which commands their tool happens to write.
 *
 * `A` — the elliptical arc — is the one command not handled, and it fails LOUDLY by returning
 * nothing rather than dropping the segment: a shape silently missing its rounded end is worse
 * than a shape that does not appear.
 */
export function fromSvgPath(d: string): Shape | undefined {
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
  if (!tokens) return undefined;

  const segments: PathSegment[] = [];
  let start: Point | undefined;
  let at: Point = { x: 0, y: 0 };
  // The previous curve's second handle, for `S` and `T` to mirror. Undefined after anything
  // that is not a curve, which is what the spec says: the shorthand then starts flat.
  let lastC2: Point | undefined;
  let lastQ: Point | undefined;
  let command = "";
  let i = 0;

  const num = (): number => Number(tokens[i++]);
  const rel = (c: string): boolean => c === c.toLowerCase();
  const point = (c: string): Point => {
    const x = num();
    const y = num();
    return rel(c) ? { x: at.x + x, y: at.y + y } : { x, y };
  };
  const mirror = (h: Point | undefined): Point => (h ? { x: 2 * at.x - h.x, y: 2 * at.y - h.y } : at);
  // A quadratic IS a cubic: both handles two thirds of the way from an end to the single one.
  const fromQuadratic = (q: Point, to: Point): PathSegment => ({
    c1: { x: at.x + (2 / 3) * (q.x - at.x), y: at.y + (2 / 3) * (q.y - at.y) },
    c2: { x: to.x + (2 / 3) * (q.x - to.x), y: to.y + (2 / 3) * (q.y - to.y) },
    to,
  });

  while (i < tokens.length) {
    const token = tokens[i]!;
    if (/[A-Za-z]/.test(token)) {
      command = token;
      i += 1;
      if (command === "Z" || command === "z") {
        if (start) at = start;
        lastC2 = lastQ = undefined;
        continue;
      }
      if (command === "A" || command === "a") return undefined; // see the note above
    }
    if (!command) return undefined;

    switch (command) {
      case "M":
      case "m": {
        at = point(command);
        // Only the FIRST move opens the shape; a later one would start a second contour, and a
        // region with two contours is not something one closed outline can say.
        if (!start) start = at;
        else segments.push({ to: at });
        // An implicit repeat after a move is a line, which is the one place SVG changes the
        // command out from under you.
        command = command === "m" ? "l" : "L";
        lastC2 = lastQ = undefined;
        break;
      }
      case "L":
      case "l": {
        at = point(command);
        segments.push({ to: at });
        lastC2 = lastQ = undefined;
        break;
      }
      case "H":
      case "h": {
        const x = num();
        at = { x: rel(command) ? at.x + x : x, y: at.y };
        segments.push({ to: at });
        lastC2 = lastQ = undefined;
        break;
      }
      case "V":
      case "v": {
        const y = num();
        at = { x: at.x, y: rel(command) ? at.y + y : y };
        segments.push({ to: at });
        lastC2 = lastQ = undefined;
        break;
      }
      case "C":
      case "c": {
        const c1 = point(command);
        const c2 = point(command);
        const to = point(command);
        segments.push({ c1, c2, to });
        at = to;
        lastC2 = c2;
        lastQ = undefined;
        break;
      }
      case "S":
      case "s": {
        const c1 = mirror(lastC2);
        const c2 = point(command);
        const to = point(command);
        segments.push({ c1, c2, to });
        at = to;
        lastC2 = c2;
        lastQ = undefined;
        break;
      }
      case "Q":
      case "q": {
        const q = point(command);
        const to = point(command);
        segments.push(fromQuadratic(q, to));
        at = to;
        lastQ = q;
        lastC2 = undefined;
        break;
      }
      case "T":
      case "t": {
        const q = mirror(lastQ);
        const to = point(command);
        segments.push(fromQuadratic(q, to));
        at = to;
        lastQ = q;
        lastC2 = undefined;
        break;
      }
      default:
        return undefined;
    }
    if (Number.isNaN(at.x) || Number.isNaN(at.y)) return undefined;
  }

  // Two segments is the least that can enclose anything. One is a line out and back.
  return start && segments.length >= 2 ? { start, segments } : undefined;
}

/**
 * A shape scaled, turned and moved — exactly, on its handles.
 *
 * An affine map takes a cubic to a cubic, so a scaled swoosh is still a swoosh and not a
 * coarser one. Flattening first and mapping the points would freeze the sampling of whatever
 * size it happened to be at.
 *
 * This is AUTHORING, not a pose. A pose is what happens to a node at runtime and belongs to the
 * node; this bakes into the shape and is how a pasted path is fitted before it becomes `bounds`.
 */
export interface ShapeTransform {
  readonly scaleX?: number;
  readonly scaleY?: number;
  /** Degrees, clockwise on screen. */
  readonly rotate?: number;
  readonly offsetX?: number;
  readonly offsetY?: number;
}

export function transformShape(shape: Shape, t: ShapeTransform): Shape {
  const sx = t.scaleX ?? 1;
  const sy = t.scaleY ?? 1;
  const deg = t.rotate ?? 0;
  const dx = t.offsetX ?? 0;
  const dy = t.offsetY ?? 0;
  if (sx === 1 && sy === 1 && deg % 360 === 0 && dx === 0 && dy === 0) return shape;

  const rad = (deg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Scale, then turn, then move — the order a reader expects from the controls, top to bottom.
  const map = (p: Point): Point => {
    const x = p.x * sx;
    const y = p.y * sy;
    return { x: x * cos - y * sin + dx, y: x * sin + y * cos + dy };
  };
  return {
    start: map(shape.start),
    segments: shape.segments.map((seg) =>
      seg.c1 && seg.c2 ? { c1: map(seg.c1), c2: map(seg.c2), to: map(seg.to) } : { to: map(seg.to) },
    ),
  };
}

/**
 * TWO PATHS SEWN INTO ONE — the second picked up whole and set down where the first ended.
 *
 * The second path keeps its own shape exactly: it is MOVED, not redrawn, so every place in it
 * stays where it was relative to its own start. That is the property this is for. A route built
 * out of pieces, a rail an animation runs along, a trail continued by another trail — all of them
 * are the same piece used again in a different place, and none of them may deform when it lands.
 *
 * The seam is a single place, not a gap and not a doubled point: the second's start IS the first's
 * end after the move, so it contributes no segment of its own and nothing has to be trimmed.
 */
export function joinPath(first: Shape, second: Shape): Shape {
  const places = [first.start, ...first.segments.map((seg) => seg.to)];
  const end = places[places.length - 1]!;
  const moved = transformShape(second, { offsetX: end.x - second.start.x, offsetY: end.y - second.start.y });
  return { start: first.start, segments: [...first.segments, ...moved.segments] };
}
