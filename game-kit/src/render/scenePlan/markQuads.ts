// ACTION MARK QUADS — rendering mark badges, icons, and movement lines in scenePlan.

import { extentOf, footprint } from "../../core/atoms/bounded.js";
import { visibleMark } from "../../core/atoms/marked.js";
import { orientationOf } from "../../core/atoms/oriented.js";
import { screenScale, type ScreenedFields } from "../../core/atoms/screened.js";
import { areaOf } from "../../core/atoms/surfaced.js";
import { resolveZ } from "../../core/atoms/transformable.js";
import { markRecord, resolveInk } from "../../core/marks.js";
import { caps, fieldsOf, type Node, type NodeId } from "../../core/node.js";
import { type ResolveContext } from "../../core/resolve.js";
import { apply, compose, IDENTITY, move, scale, type Transform } from "../../core/transform.js";
import { type Shape } from "../../core/atoms/bounded.js";
import { assetRecord } from "../assets.js";
import { surfaceOutline } from "../contour.js";
import { type PlanInput } from "./input.js";
import { boxOf, layerOf, standing, strokeOf } from "./parts.js";
import { type Quad, type QuadLayer } from "./quads.js";

/** The badge's share of the piece's smaller side on the glass, and the floor a finger can read. */
const MARK_BADGE_SHARE = 0.34;
const MARK_BADGE_MIN_PX = 11;
/** The glyph's share of the disc. */
const MARK_GLYPH_SHARE = 0.7;
/** The halo's stroke, in the piece's own units, and how loud it is. A hair, and not a highlight. */
const MARK_HALO_WIDTH = 0.045;
const MARK_HALO_OPACITY = 0.8;
const KAPPA = 0.5522847498307936;

function circleShape(r: number): Shape {
  const k = r * KAPPA;
  return {
    start: { x: 0, y: -r },
    segments: [
      { c1: { x: k, y: -r }, c2: { x: r, y: -k }, to: { x: r, y: 0 } },
      { c1: { x: r, y: k }, c2: { x: k, y: r }, to: { x: 0, y: r } },
      { c1: { x: -k, y: r }, c2: { x: -r, y: k }, to: { x: -r, y: 0 } },
      { c1: { x: -r, y: -k }, c2: { x: -k, y: -r }, to: { x: 0, y: -r } },
    ],
  };
}

export interface MarkContext {
  readonly viewer: PlanInput["viewer"];
  readonly unit: number;
  readonly toView: Transform;
  readonly nodes: ReadonlyMap<NodeId, Transform>;
  readonly overrides?: ReadonlyMap<NodeId, Transform> | undefined;
  readonly standUp?: Transform | undefined;
  readonly now?: number | undefined;
}

/** Generates quads of layer "mark" for a node carrying a visible mark. */
export function markQuads(n: Node, ctx: ResolveContext, mc: MarkContext): Quad[] {
  const marked = visibleMark(n, mc.viewer, mc.now);
  if (!marked) return [];

  const area = areaOf(n);
  const shape = footprint(n) ?? (area ? boxOf(area) : undefined);
  if (!shape) return [];

  const ext = extentOf(shape);

  const lying = compose(mc.toView, mc.overrides?.get(n.id) ?? mc.nodes.get(n.id) ?? IDENTITY);
  const stood = mc.standUp && orientationOf(ctx) === "viewer" ? standing(lying, mc.standUp) : lying;

  const viewScale = Math.hypot(mc.toView.a, mc.toView.b);
  const viewOverUnit = viewScale > 0 && mc.unit > 0 ? viewScale / mc.unit : 1;

  const hold = caps(n).has("Screened")
    ? screenScale(fieldsOf<ScreenedFields>(n, "Screened"), viewOverUnit) / viewOverUnit
    : 1;
  const toGlass = Math.abs(hold - 1) > 1e-9 ? standing(stood, scale(hold)) : stood;

  const z = resolveZ(ctx);
  const ink = resolveInk(marked.by, mc.viewer.marks?.inks);
  const quads: Quad[] = [];

  // NO TRAIL. A dashed line from where the piece came was the first thing drawn here, and it was
  // the loudest thing on the desk: a mark is a whisper for the one player who looked away, not a
  // diagram for everybody. `from` stays in the data (a hover, a replay may want it); the plan
  // draws the piece itself and a small badge, nothing else.
  //
  // THE HALO — the piece's OWN outline, a hair outside it, in the actor's ink. Quiet because it is
  // the shape the eye already knows, only tinted; it says "somebody touched this" before the eye
  // reads the badge that says who and what.
  const haloPoints = surfaceOutline(shape, 0).map((p) => ({ x: p.x * mc.unit, y: p.y * mc.unit }));
  const halo = strokeOf({ color: ink, width: MARK_HALO_WIDTH, opacity: MARK_HALO_OPACITY, alignment: 1, join: "round" }, haloPoints, mc.unit);
  if (halo) {
    const { x: cx, y: cy } = apply(toGlass, { x: 0, y: 0 });
    quads.push({
      id: `${n.id}::mark-halo` as NodeId,
      layer: "mark",
      x: cx,
      y: cy,
      w: ext.w * viewScale,
      h: ext.h * viewScale,
      points: haloPoints,
      transform: compose(toGlass, scale(mc.unit > 0 ? 1 / mc.unit : 0)),
      layers: [],
      stroke: halo,
      z,
    });
  }
  // THE BADGE — a small disc at the piece's top-right corner, sized by the PIECE AS DRAWN: a third
  // of its smaller side, and never under a floor a finger can still read. Sized in units it was
  // eight pixels on a chess board and invisible; sized by the etalon it would be the same on a
  // card and a chip, which are not the same size on the glass. It is in pixels from here down.
  const pieceW = Math.hypot(toGlass.a * ext.w, toGlass.b * ext.w);
  const pieceH = Math.hypot(toGlass.c * ext.h, toGlass.d * ext.h);
  const badgePx = Math.max(MARK_BADGE_MIN_PX, MARK_BADGE_SHARE * Math.min(pieceW, pieceH));
  const badgePos = apply(toGlass, { x: ext.w / 2, y: -ext.h / 2 });
  const badgePoints = surfaceOutline(circleShape(badgePx / 2), 0);
  const rec = markRecord(marked.mark);
  const iconName = rec?.icon ?? `mark.${marked.mark}`;
  const layers: QuadLayer[] = [{ paint: ink, image: undefined, opacity: 0.92 }];
  if (assetRecord(iconName)) {
    // The glyph, a little inside the disc — `layerOf` takes a size and a unit; here the unit is
    // the pixel, so the size is the glyph's box on the glass.
    const glyph = badgePx * MARK_GLYPH_SHARE;
    layers.push(layerOf({ image: iconName, fit: "contain", opacity: 1 }, { w: glyph, h: glyph }, 1));
  }
  quads.push({
    id: `${n.id}::mark` as NodeId,
    layer: "mark",
    x: badgePos.x,
    y: badgePos.y,
    w: badgePx,
    h: badgePx,
    points: badgePoints,
    transform: move(badgePos.x, badgePos.y),
    layers,
    stroke: undefined,
    z,
  });

  return quads;
}
