// THE FIGURES A DESIGNER ASKS FOR — the ready-made half of the kit, and the folder that grows.
//
// Nobody writes a card as four segments by hand, so what a reader reaches for lives here:
// `rect(1, 1.4)`, `ellipse(1.2, 0.8)`, `polygon(8, 1)`, `star(5, 1, 0.42)`. Each one is an
// ORDINARY FUNCTION returning the same `Shape` as every other, which is what lets a new figure
// be a new function instead of a new branch in five files.
//
// They sit above `core` and `render` rather than inside them: a preset is DATA about what people
// draw, and the layers below must keep working when this folder is empty. That is also why the
// stock surfaces are next door — a reader looking for "what does the kit already have" opens one
// place and finds both halves of the answer, the shape and the look.
//
// It is what makes a snippet readable, too: `Bounded({ bounds: star(5, 1, 0.42) })` says what it
// is, where a soup of twenty coordinates says nothing at all.
//
// Everything here is in UNITS and centred on the node's origin — the point `at` places and a
// rotation turns about — unless the caller moves it.

import { type PathSegment, type Point, type Shape } from "../core/atoms/bounded.js";
import { polyline } from "../core/path.js";

/** How far a cubic's handles reach to draw a quarter of an ellipse. The constant every tool uses. */
const KAPPA = 0.5522847498307936;

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
