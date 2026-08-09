// THE SHAPE, AS CONTROLS — a preset and its parameters, turned into one `Shape`.
//
// A `Shape` is a path and has no sorts, so there is nothing here to switch on for the model's
// sake. What a designer actually reaches for — a card, a chip, an octagon, a star — comes from
// the KIT's helpers, and this file is the panel in front of them. The reader picks `star` and
// the snippet says `star(5, 0.9, 0.42)`, which is real code they can paste; before, the catalog
// offered four "sorts" that existed nowhere but in the type, and the snippet came out as a soup
// of coordinates.
//
// Split out of `surfaceControls.ts` for one concrete reason: the Code panel is drawn by the
// MANAGER, a second document with its own module graph, and it has to be able to say what a
// preset comes out as without dragging in the palette and the asset registry behind it.

import {
  circle,
  ellipse,
  fromSvgPath,
  polygon,
  rect,
  roundedRect,
  star,
  transformShape,
  type PathSegment,
  type Shape,
} from "../../src/index.js";

/**
 * The presets the panel offers.
 *
 * Not a type in the model — a list of helper FUNCTIONS. Adding one here adds one function and
 * changes nothing downstream, which is the whole difference from the tagged union this replaced.
 */
export const PRESETS = ["rect", "circle", "ellipse", "polygon", "star", "path", "svg"] as const;
export type Preset = (typeof PRESETS)[number];

export interface ShapeArgs {
  preset: Preset;
  /**
   * Every preset's parameters are ITS OWN, with no name shared between two of them. Not tidiness
   * — Storybook can only show a control on ONE equality, so a `w` belonging to both `rect` and
   * `roundedRect` cannot be expressed at all. Written as a list of presets it silently ignored
   * the condition and showed a width on the circle page: a control a reader can move to no
   * effect, which is the exact sin the panel exists to avoid.
   */
  w: number;
  h: number;
  radius: number;
  r: number;
  rx: number;
  ry: number;
  corners: number;
  polyR: number;
  points: number;
  outerR: number;
  innerR: number;
  /**
   * A path written out by hand, as `x,y` pairs — the RAW shape, with no helper in front of it.
   *
   * Every other preset calls a function that returns a `Shape`; this one is the value itself, and
   * the catalog had none. A reader could see `star(5, 1, 0.42)` all day and never learn what a
   * `Shape` actually IS, which is the one thing the section is about.
   *
   * It is also the only preset that need not enclose anything: two points are a line, one is a
   * point. Both are legal shapes and neither has an inside.
   */
  vertices: string;
  /** An SVG path's `d`, pasted straight out of a drawing tool. */
  d: string;
  /**
   * AUTHORING transforms, applied before the shape becomes `bounds`. NOT a pose: a pose is what
   * happens to a node at runtime and belongs to the node. These bake in, which is how a pasted
   * path is fitted to the size and angle somebody wanted.
   */
  scaleX: number;
  scaleY: number;
  rotate: number;
  offsetX: number;
  offsetY: number;
}

export const SHAPE_ARGS: ShapeArgs = {
  preset: "rect",
  w: 2,
  h: 1.4,
  radius: 0,
  r: 0.8,
  rx: 1.2,
  ry: 0.8,
  corners: 5,
  polyR: 0.9,
  points: 5,
  outerR: 1,
  innerR: 0.42,
  vertices: "-1.2,0 1.2,0",
  d: "M -1 0 C -0.5 -1 0.5 -1 1 0 C 0.5 0.6 -0.5 0.6 -1 0 Z",
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
  offsetX: 0,
  offsetY: 0,
};

/** In units, never pixels — the host is the only thing that knows what a unit is worth. */
export function shapeOf(a: ShapeArgs): Shape {
  return transformShape(presetOf(a), a);
}

function presetOf(a: ShapeArgs): Shape {
  switch (a.preset) {
    case "circle":
      return circle(a.r);
    case "ellipse":
      return ellipse(a.rx, a.ry);
    case "polygon":
      return polygon(a.corners, a.polyR);
    case "star":
      return star(a.points, a.outerR, a.innerR);
    case "path":
      return pathOf(a.vertices);
    case "svg":
      // A path mid-paste does not parse, and a blank stage says nothing about why. A plain unit
      // square keeps something on screen while the reader is still typing.
      return fromSvgPath(a.d) ?? rect(1, 1);
    default:
      // A radius of zero IS a plain rect, so the two are one preset rather than two that share
      // a width — see the note on the fields above for why sharing is not available.
      return a.radius > 0 ? roundedRect(a.w, a.h, a.radius) : rect(a.w, a.h);
  }
}

/**
 * `x,y x,y ...` as the raw value, built by hand rather than by a helper.
 *
 * No fallback to a square, unlike `svg`: here an unreadable string yields a POINT, which is a
 * legal shape and the honest reading of "nothing was said". A path is the one preset where an
 * empty answer is not a mistake.
 */
function pathOf(text: string): Shape {
  const pts = text
    .trim()
    .split(/\s+/)
    .map((pair) => pair.split(",").map(Number))
    .filter((xy) => xy.length === 2 && xy.every((v) => Number.isFinite(v)))
    .map(([x, y]) => ({ x: x!, y: y! }));
  const start = pts[0] ?? { x: 0, y: 0 };
  return { start, segments: pts.slice(1).map((to) => ({ to })) };
}

/**
 * The same path, printed as the LITERAL — see `shapeSource` on why this one is not a call.
 *
 * ONE LINE, however many points. The snippet is assembled by substitution into a line of the
 * story's own source, so anything with newlines in it lands at whatever indent that line had and
 * the rest hangs off the left margin. A long path scrolls; a misaligned one just looks broken.
 */
function pathSource(shape: Shape, n: (v: number) => string): string {
  const pt = (p: { x: number; y: number }): string => `{ x: ${n(p.x)}, y: ${n(p.y)} }`;
  const seg = (s: PathSegment): string =>
    // A handle can only arrive here through a helper, and a helper prints as its call — but the
    // branch stays, because a literal that dropped `c1`/`c2` would be a snippet that compiles,
    // runs, and draws a diamond where the picture above it shows a circle.
    s.c1 && s.c2 ? `{ c1: ${pt(s.c1)}, c2: ${pt(s.c2)}, to: ${pt(s.to)} }` : `{ to: ${pt(s.to)} }`;
  return `{ start: ${pt(shape.start)}, segments: [${shape.segments.map(seg).join(", ")}] }`;
}

/**
 * The same choice, as the CALL a reader would write.
 *
 * This is what the Code panel prints in place of `shapeOf(a)`. Printing the resulting path
 * would be honest and useless — twenty coordinates say nothing, `star(5, 0.9, 0.42)` says what
 * it is, and every name in it is exported by the kit rather than by this website.
 */
export function shapeSource(a: ShapeArgs): string {
  const n = (v: number): string => String(Number(v.toFixed(4)));
  const base = ((): string => {
    switch (a.preset) {
      case "circle":
        return `circle(${n(a.r)})`;
      case "ellipse":
        return `ellipse(${n(a.rx)}, ${n(a.ry)})`;
      case "polygon":
        return `polygon(${n(a.corners)}, ${n(a.polyR)})`;
      case "star":
        return `star(${n(a.points)}, ${n(a.outerR)}, ${n(a.innerR)})`;
      case "path":
        // THE ONE PRESET PRINTED AS A VALUE, not as a call. Everywhere else a helper's name says
        // what the shape is and its coordinates would say nothing; here the coordinates ARE the
        // lesson — this is what every other line on this page comes out as.
        return pathSource(pathOf(a.vertices), n);
      case "svg":
        return `fromSvgPath(${JSON.stringify(a.d)})!`;
      default:
        return a.radius > 0 ? `roundedRect(${n(a.w)}, ${n(a.h)}, ${n(a.radius)})` : `rect(${n(a.w)}, ${n(a.h)})`;
    }
  })();

  const moved = a.scaleX !== 1 || a.scaleY !== 1 || a.rotate % 360 !== 0 || a.offsetX !== 0 || a.offsetY !== 0;
  if (!moved) return base;
  const parts = [
    a.scaleX !== 1 ? `scaleX: ${n(a.scaleX)}` : "",
    a.scaleY !== 1 ? `scaleY: ${n(a.scaleY)}` : "",
    a.rotate % 360 !== 0 ? `rotate: ${n(a.rotate)}` : "",
    a.offsetX !== 0 ? `offsetX: ${n(a.offsetX)}` : "",
    a.offsetY !== 0 ? `offsetY: ${n(a.offsetY)}` : "",
  ].filter(Boolean);
  return `transformShape(${base}, { ${parts.join(", ")} })`;
}
