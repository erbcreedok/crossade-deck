// THE SHAPES A DESIGNER ASKS FOR, as paths — and nothing in the model knows their names.
//
// A `Shape` is one thing: a path. That is the geometry, and it has no sorts. But nobody writes
// a card as four segments by hand, so what a reader reaches for lives here: `rect(1, 1.4)`,
// `ellipse(1.2, 0.8)`, `polygon(8, 1)`, `star(5, 1, 0.42)`.
//
// They are ORDINARY FUNCTIONS, which is the whole point. A tagged union put the vocabulary into
// the type, so every consumer branched on it and every new shape meant a new branch in five
// files. Here a new shape is a new function and nothing downstream changes — a star is not a
// case the renderer has to learn, it is a path that already flattens like every other.
//
// It is also what makes a snippet readable: `Bounded({ bounds: star(5, 1, 0.42) })` says what
// it is, where a soup of twenty coordinates says nothing at all.
//
// Everything here is in UNITS and centred on the node's origin — the point `at` places and a
// rotation turns about — unless the caller moves it.

import { type PathSegment, type Point, type Shape } from "./atoms/bounded.js";

/** How far a cubic's handles reach to draw a quarter of an ellipse. The constant every tool uses. */
const KAPPA = 0.5522847498307936;

/** A closed run of straight lines through the given corners. */
export function polyline(points: readonly Point[]): Shape {
  if (points.length === 0) return { start: { x: 0, y: 0 }, segments: [] };
  return { start: points[0]!, segments: points.slice(1).map((to) => ({ to })) };
}

/** An axis-aligned box, centred on the origin. */
export function rect(w: number, h: number): Shape {
  return polyline([
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ]);
}

/**
 * An ellipse, exactly: four cubics.
 *
 * A circle is this with equal radii — it is not a special sort and it is not a scaled anything.
 * Saying it the other way round was a mistake worth naming: it put a tag in the model for a
 * shape that is one line of arithmetic away from its neighbour.
 */
export function ellipse(rx: number, ry: number): Shape {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return {
    start: { x: 0, y: -ry },
    segments: [
      { c1: { x: kx, y: -ry }, c2: { x: rx, y: -ky }, to: { x: rx, y: 0 } },
      { c1: { x: rx, y: ky }, c2: { x: kx, y: ry }, to: { x: 0, y: ry } },
      { c1: { x: -kx, y: ry }, c2: { x: -rx, y: ky }, to: { x: -rx, y: 0 } },
      { c1: { x: -rx, y: -ky }, c2: { x: -kx, y: -ry }, to: { x: 0, y: -ry } },
    ],
  };
}

/** An ellipse with equal radii. Kept as a name because that is the word people use. */
export function circle(r: number): Shape {
  return ellipse(r, r);
}

/** `n` corners on a circle of radius `r`, the first one at the top. */
export function polygon(n: number, r: number): Shape {
  const corners = Math.max(3, Math.round(n));
  return polyline(
    Array.from({ length: corners }, (_, i) => {
      const a = -Math.PI / 2 + (i / corners) * Math.PI * 2;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    }),
  );
}

/**
 * A star: `n` points on `outer`, the notches between them on `inner`.
 *
 * A polygon whose corners alternate between two radii — which is why it needs no new sort. The
 * kit does not know the word "star"; this function does, and it is the only place that has to.
 */
export function star(n: number, outer: number, inner: number): Shape {
  const points = Math.max(3, Math.round(n));
  return polyline(
    Array.from({ length: points * 2 }, (_, i) => {
      const a = -Math.PI / 2 + (i * Math.PI) / points;
      const r = i % 2 === 0 ? outer : inner;
      return { x: Math.cos(a) * r, y: Math.sin(a) * r };
    }),
  );
}

/**
 * A box with rounded corners — as the SHAPE, not as paint.
 *
 * The surface record has a radius too, and they are different claims: that one rounds what is
 * painted and leaves the box sharp, this one rounds the box itself, so a layout and a finger
 * see the rounding as well. Both are legitimate; a rounded plate on a square box is the common
 * case, and a genuinely round-cornered token is this one.
 */
export function roundedRect(w: number, h: number, radius: number): Shape {
  const r = Math.min(radius, Math.min(w, h) / 2);
  if (r <= 0) return rect(w, h);
  const x = w / 2;
  const y = h / 2;
  const k = r * KAPPA;
  const segments: PathSegment[] = [
    { to: { x: x - r, y: -y } },
    { c1: { x: x - r + k, y: -y }, c2: { x, y: -y + r - k }, to: { x, y: -y + r } },
    { to: { x, y: y - r } },
    { c1: { x, y: y - r + k }, c2: { x: x - r + k, y }, to: { x: x - r, y } },
    { to: { x: -x + r, y } },
    { c1: { x: -x + r - k, y }, c2: { x: -x, y: y - r + k }, to: { x: -x, y: y - r } },
    { to: { x: -x, y: -y + r } },
    { c1: { x: -x, y: -y + r - k }, c2: { x: -x + r - k, y: -y }, to: { x: -x + r, y: -y } },
  ];
  return { start: { x: -x + r, y: -y }, segments };
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
