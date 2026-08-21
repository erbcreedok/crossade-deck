// A SURFACE RECORD, TURNED INTO QUAD PARTS — a layer, a stroke, a box for a node that declared no
// shape. Pure arithmetic on data the model authored: no node is read here and no scene is walked.

import { type Point } from "../../core/atoms/bounded.js";
import { polyline } from "../../core/path.js";
import { type Shape } from "../../core/atoms/bounded.js";
import { apply, chain, compose, move, type Transform } from "../../core/transform.js";
import { assetRecord } from "../assets.js";
import { dashContour, offsetContour, type DashOptions } from "../contour.js";
import { fitBox } from "../fitBox.js";
import { type PaintLayer, type Stroke } from "../surfaces.js";
import { type QuadLayer, type QuadStroke } from "./quads.js";

/** The four corners of an area, centred on the origin — a shape for a node that declared none. */
export function boxOf(area: { readonly w: number; readonly h: number }): Shape {
  const x = area.w / 2;
  const y = area.h / 2;
  return polyline([
    { x: -x, y: -y },
    { x, y: -y },
    { x, y },
    { x: -x, y },
  ]);
}

/** One layer with its picture already fitted to the area and converted to pixels. */
/** `about` applied around wherever `m` puts the origin — a scale that does not move the node. */
export function standing(m: Transform, about: Transform): Transform {
  const o = apply(m, { x: 0, y: 0 });
  return chain([move(o.x, o.y), about, move(-o.x, -o.y), m]);
}

export function layerOf(layer: PaintLayer, area: { readonly w: number; readonly h: number }, unit: number): QuadLayer {
  // A picture is FITTED HERE, in units, before anything becomes pixels. The arithmetic needs
  // the picture's proportions, and those come from what the asset DECLARED — not from the file,
  // which may not have arrived yet. A plan that waited on the network could not be a pure
  // function, and then none of this would be checkable without a browser.
  const asset = layer.image ? assetRecord(layer.image) : undefined;
  const placed = asset ? fitBox(area, asset, layer.fit, layer.align) : undefined;
  // The `part` fraction becomes a clip RECT, bottom-up like a level filling: the painter masks
  // the layer's fill with it, and the intersection with the contour is what shows. Non-finite is
  // read as nothing, exactly as a coat's level is — a broken magnitude must not paint the face.
  const part = layer.part !== undefined ? (Number.isFinite(layer.part) ? Math.max(0, Math.min(1, layer.part)) : 0) : undefined;
  const clip =
    part !== undefined
      ? [
          { x: (-area.w / 2) * unit, y: (area.h / 2 - area.h * part) * unit },
          { x: (area.w / 2) * unit, y: (area.h / 2 - area.h * part) * unit },
          { x: (area.w / 2) * unit, y: (area.h / 2) * unit },
          { x: (-area.w / 2) * unit, y: (area.h / 2) * unit },
        ]
      : undefined;
  // THE ANGLE BECOMES AN AXIS HERE. Through the centre, out to the area's edge on both sides: the
  // half-diagonal is what makes a 45-degree wash reach the corners it points at instead of stopping
  // short of them. A gradient with fewer than two stops is not a gradient and is dropped — a
  // renderer handed one stop would paint a colour nobody asked for.
  const stops = layer.gradient?.stops ?? [];
  const rad = ((layer.gradient?.angle ?? 90) * Math.PI) / 180;
  const half = (Math.abs(Math.cos(rad)) * area.w + Math.abs(Math.sin(rad)) * area.h) / 2;
  const gradient =
    stops.length >= 2
      ? {
          from: { x: -Math.cos(rad) * half * unit, y: -Math.sin(rad) * half * unit },
          to: { x: Math.cos(rad) * half * unit, y: Math.sin(rad) * half * unit },
          stops,
        }
      : undefined;

  return {
    clip,
    gradient,
    // An empty colour is NO colour: a layer that is only a picture must not reach the renderer
    // carrying an empty token for it to resolve.
    paint: layer.paint || undefined,
    image:
      asset && placed
        ? {
            src: asset.src,
            x: placed.x * unit,
            y: placed.y * unit,
            w: placed.w * unit,
            h: placed.h * unit,
            repeat: placed.repeat,
          }
        : undefined,
    opacity: layer.opacity ?? 1,
  };
}

/** A record's stroke with every length in pixels, and its dashes already cut. */
export function strokeOf(stroke: Stroke | undefined, points: readonly Point[], unit: number): QuadStroke | undefined {
  if (!stroke) return undefined;
  const dash = stroke.dash;
  const width = stroke.width * unit;
  // Pixi's scale and SVG 2's: 0 outside, 0.5 on the line, 1 inside. Defaulting to `inside`
  // rather than `centred` keeps a bordered node inside exactly the box it declared.
  const alignment = stroke.alignment ?? 1;
  // A DASH IS CUT FROM THE MOVED LINE, AND THEN SITS ON IT.
  //
  // The renderer works out `alignment` from the sign of a path's area, which is an answer only a
  // whole contour has. Handed a scrap of one it guesses per scrap, and the guess came out one
  // way for the two-point dashes along the sides and the other way for the dashes that cross a
  // corner: the border stepped a full stroke width sideways at every rounded corner. So the
  // moving is done here, on the contour, and the dashes are stroked centred on the result —
  // which is the same line, without anything left to guess. See `offsetContour`.
  const dashPoints = dash ? offsetContour(points, (alignment - 0.5) * width) : points;
  return {
    color: stroke.color,
    width,
    opacity: stroke.opacity ?? 1,
    alignment,
    cap: stroke.cap ?? "butt",
    join: stroke.join ?? "miter",
    miterLimit: stroke.miterLimit ?? 10,
    dash: dash
      ? {
          on: dash.on * unit,
          off: dash.off * unit,
          adjust: dash.adjust ?? "stretch",
          corner: dash.corner ?? "none",
        }
      : undefined,
    dashes: dash
      ? dashContour(dashPoints, {
          on: dash.on * unit,
          off: dash.off * unit,
          // Defaults are resolved HERE, with every other default in this file, rather than
          // deeper down: one place answers "what does an absent field mean".
          adjust: dash.adjust ?? "stretch",
          corner: dash.corner ?? "none",
        })
      : undefined,
  };
}
