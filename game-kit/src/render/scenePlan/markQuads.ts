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
import { boxOf, layerOf, standing } from "./parts.js";
import { type Quad, type QuadLayer } from "./quads.js";

/** The badge's share of the piece's smaller side on the glass, and the floor a finger can read. */
const MARK_BADGE_SHARE = 0.34;
const MARK_BADGE_MIN_PX = 11;
/** The glyph's share of the disc. */
const MARK_GLYPH_SHARE = 0.7;
/**
 * THE GLOW — a fill of the piece's own outline, in the actor's ink, blurred soft. Not a stroke: a
 * hard-edged ring around a whole card reads as a border drawn ON the card, which is a second frame
 * around a thing that already has one. A blurred fill in the same ink washes the piece it belongs
 * to instead of framing it, which is what "somebody touched this" is meant to feel like.
 */
const MARK_GLOW_OPACITY = 0.4;
/** How much of `blur`'s 0..1 strength the glow asks for — soft, never a smudge that hides the piece. */
const MARK_GLOW_BLUR = 0.35;
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
  // draws the piece itself and its glow, nothing else.
  //
  // THE GLOW — the piece's OWN outline, filled in the actor's ink and blurred soft, rather than
  // stroked hard around it: a stroke reads as a second frame drawn ON the card, which is what the
  // owner saw and asked to be rid of. A blurred fill washes the shape the eye already knows instead
  // of outlining it, and says "somebody touched this" without drawing a border nobody asked for.
  const haloPoints = surfaceOutline(shape, 0).map((p) => ({ x: p.x * mc.unit, y: p.y * mc.unit }));
  {
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
      layers: [{ paint: ink, image: undefined, opacity: MARK_GLOW_OPACITY }],
      stroke: undefined,
      filter: { name: "blur", params: { strength: MARK_GLOW_BLUR } },
      z,
    });
  }
  // THE BADGE — a small disc at the piece's top-right corner with the mark's glyph on it, drawn
  // only when the viewer's policy asks for it (`marks.badge`, off by default). The glow alone is
  // the mark most desks want; a page that also wants to say WHICH action happened turns this on.
  if (mc.viewer.marks?.badge) {
    // Sized by the PIECE AS DRAWN: a third of its smaller side, and never under a floor a finger
    // can still read. Sized in units it was eight pixels on a chess board and invisible; sized by
    // the etalon it would be the same on a card and a chip, which are not the same size on the
    // glass. It is in pixels from here down.
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
  }

  return quads;
}
