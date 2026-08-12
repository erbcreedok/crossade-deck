// THE SURFACE REGISTRY — what `Surfaced.surface` points AT.
//
// It lives in `render/` because a record is made of colours and thicknesses, and the model
// must not know about either: `core` names a record, `render` knows what the name is worth.
//
// A record is the unit of restyling. Re-register `plate` without its stroke and every card in
// the room loses its border in one step while its box does not move a unit — the separation
// the catalog is built to show. Doing it with fields on the node would mean walking every
// node, and "the box stayed" would no longer prove anything.
//
// A RECORD IS A PROXY OF THE RENDERER'S STYLE, NOT A DICTIONARY OF OUR OWN.
//
// The names below are the renderer's names, which are also SVG's and Canvas2D's: `cap`,
// `join`, `miterLimit`, `alignment`, and a dash pattern with SVG's two adjustments. Inventing
// a smaller vocabulary is how client2's `Text` wrapper lost most of what Pixi could already
// do, and the loss is invisible until somebody needs the field that was dropped.
//
// TWO THINGS ARE DELIBERATELY NOT PASSED THROUGH, because they contradict laws that came
// first:
//   - lengths are in UNITS, never pixels. The host is the only thing that knows what a unit is
//     worth, and a border given in pixels is a different border on every screen.
//   - colours are TOKEN NAMES, not literals. A GPU canvas has no cascade to resolve a variable
//     in, so the painter resolves the token — and a backend with no CSS at all resolves it
//     against its own palette.
//
// Everything here is PLAIN DATA: no textures, no matrices, no constructed gradient objects.
// That is what lets a record cross a wire or a language boundary, which was a requirement
// before it was a convenience.

import { type Align, type Fit } from "./fitBox.js";
import { type Paint } from "../core/paint.js";

export { type Align, type Fit };
// A colour lives in `paint.ts` now — a token name, a literal, OR a parametric `{token, param}`.
// Re-exported here so a consumer of the record types does not have to learn where it moved.
export { type Paint, type ParametricPaint, isParametric } from "../core/paint.js";

export type LineCap = "butt" | "round" | "square";
export type LineJoin = "miter" | "round" | "bevel";

/**
 * One coat of paint over the area, drawn in list order — the first is at the bottom.
 *
 * A list rather than a single fill because the cases stack for real: a tint under a texture, a
 * repeating ground with an emblem over it. A flat field could describe none of them and could
 * not express order at all.
 */
export interface PaintLayer {
  /** A flat colour under the picture, or the whole layer when there is no picture. */
  readonly paint?: Paint;
  /**
   * A registry reference into the assets. `fit` and `align` sit HERE, on the layer, because
   * this is where a picture and an area actually meet: a ground tiled `repeat` and an emblem in
   * a corner are two layers of one record, and one setting on the node could not describe both.
   */
  readonly image?: string;
  readonly fit?: Fit;
  readonly align?: Align;
  /** 0..1. Absent means opaque — an absent field is not a value, it is the lack of one. */
  readonly opacity?: number;
  /**
   * The fraction of the area this layer covers, bottom-up, 0..1. Absent means the whole face —
   * which is not the same as `1`: a whole layer needs no mask at all. A DIFFERENT kind of mark
   * from opacity: a half-filled gauge is half DRAWN, not half faded, and the cut edge shows it.
   */
  readonly part?: number;
}

/**
 * A dash pattern, in UNITS. Both lengths are absolute: stretch the area and the number of
 * dashes grows while their size does not, which is the whole difference between a border and
 * a picture of a border.
 */
export interface DashPattern {
  readonly on: number;
  readonly off: number;
  /**
   * SVG's `stroke-dashadjust`. Defaults to `stretch`: without it the first and last dash meet
   * at the start of a closed contour and read as one dash of double length.
   */
  readonly adjust?: "none" | "stretch";
  /** SVG's `stroke-dashcorner`. `dash` repeats the pattern per side, so corners carry a dash. */
  readonly corner?: "none" | "dash";
}

export interface Stroke {
  readonly color: Paint;
  /** In units. */
  readonly width: number;
  readonly opacity?: number;
  /** 0 outside the contour · 0.5 centred on it · 1 inside. SVG 2 calls this stroke-alignment. */
  readonly alignment?: number;
  readonly cap?: LineCap;
  readonly join?: LineJoin;
  readonly miterLimit?: number;
  readonly dash?: DashPattern;
}

export interface SurfaceRecord {
  /** Bottom-first. An empty list is legal: a record that only strokes its contour. */
  readonly layers: readonly PaintLayer[];
  /** Corner radius of the contour, in units — shared by every layer and by the stroke. */
  readonly radius?: number;
  /** Drawn last, over every layer. A border cannot be hidden by the thing it borders. */
  readonly stroke?: Stroke;
}

const SURFACES = new Map<string, SurfaceRecord>();

export function registerSurface(name: string, record: SurfaceRecord): void {
  SURFACES.set(name, record);
}

/**
 * `undefined` for a name nobody registered. The painter SKIPS such a node rather than
 * throwing: an unknown record is a content mistake, and taking the whole scene down over one
 * of them would hide every node that was fine. It is visible where it should be — the node
 * still reports its `surface` reference to the inspector, so the dangling name is readable.
 */
export function surfaceRecord(name: string): SurfaceRecord | undefined {
  return SURFACES.get(name);
}

export function surfaceNames(): readonly string[] {
  return [...SURFACES.keys()];
}

/** Test seam only — the registry is process-wide and suites must not leak into each other. */
export function resetSurfaces(): void {
  SURFACES.clear();
}
