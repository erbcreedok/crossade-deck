// MAY THIS FRAME BE SKIPPED? — the comparisons a kept object is re-drawn or left alone by.
//
// Not one deep-equal: a plan is rebuilt from scratch sixty times a second, so every one of these
// runs per quad per frame, and each answers the narrowest question its caller actually has. They
// are also the only part of this folder that touches no Pixi at all — pure data in, a boolean out.

import { type Paint } from "../../core/paint.js";
import { type Transform } from "../../core/transform.js";
import { type FilterRef, type OverlayRef } from "../effects.js";
import { type Point } from "../../core/atoms/bounded.js";
import {
  type Mark,
  type Quad,
  type QuadGradient,
  type QuadImage,
  type QuadLayer,
  type QuadStroke,
  type QuadText,
} from "../scenePlan/index.js";


export function sameMatrix(a: Transform, b: Transform): boolean {
  return a.a === b.a && a.b === b.b && a.c === b.c && a.d === b.d && a.e === b.e && a.f === b.f;
}

/** A colour is a token name OR a token and a number, and the pair has to be compared as a pair. */
export function samePaint(a: Paint | undefined, b: Paint | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a === "string" || typeof b === "string") return false;
  return a.token === b.token && a.param === b.param;
}

export function samePoints(a: readonly Point[] | undefined, b: readonly Point[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const p = a[i]!;
    const q = b[i]!;
    if (p.x !== q.x || p.y !== q.y) return false;
  }
  return true;
}

export function sameDashes(a: readonly (readonly Point[])[] | undefined, b: readonly (readonly Point[])[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (!samePoints(a[i], b[i])) return false;
  return true;
}

export function sameImage(a: QuadImage | undefined, b: QuadImage | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.src === b.src && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.repeat === b.repeat;
}

export function sameGradient(a: QuadGradient | undefined, b: QuadGradient | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (a.from.x !== b.from.x || a.from.y !== b.from.y || a.to.x !== b.to.x || a.to.y !== b.to.y) return false;
  if (a.stops.length !== b.stops.length) return false;
  return a.stops.every((s, i) => s.at === b.stops[i]!.at && samePaint(s.paint, b.stops[i]!.paint));
}

export function sameLayer(a: QuadLayer, b: QuadLayer): boolean {
  return (
    a.opacity === b.opacity &&
    samePaint(a.paint, b.paint) &&
    sameGradient(a.gradient, b.gradient) &&
    sameImage(a.image, b.image) &&
    samePoints(a.clip, b.clip)
  );
}

export function sameLayers(a: readonly QuadLayer[], b: readonly QuadLayer[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (!sameLayer(a[i]!, b[i]!)) return false;
  return true;
}

export function sameStroke(a: QuadStroke | undefined, b: QuadStroke | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.width === b.width &&
    a.opacity === b.opacity &&
    a.alignment === b.alignment &&
    a.cap === b.cap &&
    a.join === b.join &&
    a.miterLimit === b.miterLimit &&
    samePaint(a.color, b.color) &&
    sameDashes(a.dashes, b.dashes)
  );
}

/** The FACE of a caption — what a Pixi text style is built from, and all a restyle can be. */
export function sameFace(a: QuadText, b: QuadText): boolean {
  return (
    a.font.family === b.font.family &&
    a.font.size === b.font.size &&
    a.font.weight === b.font.weight &&
    samePaint(a.fill, b.fill)
  );
}

export function sameText(a: QuadText | undefined, b: QuadText | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (!sameFace(a, b) || a.lines.length !== b.lines.length) return false;
  for (let i = 0; i < a.lines.length; i += 1) {
    const p = a.lines[i]!;
    const q = b.lines[i]!;
    if (p.text !== q.text || p.x !== q.x || p.y !== q.y || p.ascent !== q.ascent) return false;
  }
  return true;
}

/** A named effect and its knobs. The same pair means the same shader, so it is not rebuilt. */
export function sameRef(a: FilterRef | OverlayRef | undefined, b: FilterRef | OverlayRef | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.name !== b.name) return false;
  const keys = Object.keys(a.params);
  if (keys.length !== Object.keys(b.params).length) return false;
  for (const key of keys) if (a.params[key] !== b.params[key]) return false;
  return true;
}

/**
 * Is this quad DRAWN the same as the one before it — everything but where it stands?
 *
 * The matrix is deliberately not here: a pose that moved is the cheap case, one number set on a
 * container the GPU already knows how to place. `z` and `layer` are not here either — the order
 * of the frame is the plan's answer, and this only decides whether the pixels have to be made
 * again.
 */
export function sameDraw(a: Quad, b: Quad): boolean {
  return (
    a.w === b.w &&
    a.h === b.h &&
    samePoints(a.points, b.points) &&
    sameLayers(a.layers, b.layers) &&
    sameStroke(a.stroke, b.stroke) &&
    sameText(a.text, b.text) &&
    sameRef(a.filter, b.filter) &&
    sameRef(a.overlay, b.overlay)
  );
}

export function sameMark(a: Mark | undefined, b: Mark): boolean {
  if (!a) return false;
  return a.closed === b.closed && a.width === b.width && samePaint(a.paint, b.paint) && samePoints(a.points, b.points);
}
