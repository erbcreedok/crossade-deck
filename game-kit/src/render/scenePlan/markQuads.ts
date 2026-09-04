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
import { dashOpen, surfaceOutline } from "../contour.js";
import { type PlanInput } from "./input.js";
import { boxOf, layerOf, standing } from "./parts.js";
import { type Quad, type QuadLayer } from "./quads.js";

const MARK_BADGE_SIZE = 0.36;
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

  // 1. Movement vector (dashed line from `marked.from` to node center, under circle badge)
  if (marked.from) {
    const fromPx = apply(mc.toView, marked.from);
    const toPx = apply(toGlass, { x: 0, y: 0 });
    const dist = Math.hypot(toPx.x - fromPx.x, toPx.y - fromPx.y);
    if (dist > 1e-3) {
      const lineCx = (fromPx.x + toPx.x) / 2;
      const lineCy = (fromPx.y + toPx.y) / 2;
      const dashes = dashOpen([fromPx, toPx], 6, 4, "stretch");
      quads.push({
        id: `${n.id}::mark-line` as NodeId,
        layer: "mark",
        x: lineCx,
        y: lineCy,
        w: Math.abs(toPx.x - fromPx.x),
        h: Math.abs(toPx.y - fromPx.y),
        points: [fromPx, toPx],
        transform: IDENTITY,
        layers: [],
        stroke: {
          color: ink,
          width: 1.5,
          opacity: 1,
          alignment: 0.5,
          cap: "round",
          join: "miter",
          miterLimit: 10,
          dash: { on: 6, off: 4, adjust: "stretch", corner: "none" },
          dashes,
        },
        z,
      });
    }
  }

  // 2. Mark badge circle + icon overlaid at top-right corner of node's bounding box
  const cornerLocal = { x: ext.w / 2, y: -ext.h / 2 };
  const badgePos = apply(toGlass, cornerLocal);

  const shapeCircle = circleShape(MARK_BADGE_SIZE);
  const circlePointsLocal = surfaceOutline(shapeCircle, 0).map((p) => ({ x: p.x * mc.unit, y: p.y * mc.unit }));
  const badgeTransform = compose(move(badgePos.x, badgePos.y), scale((mc.unit > 0 ? 1 / mc.unit : 0) / viewOverUnit));

  const fillLayer: QuadLayer = {
    paint: ink,
    image: undefined,
    opacity: 1,
  };

  const rec = markRecord(marked.mark);
  const iconName = rec?.icon ?? `mark.${marked.mark}`;
  const asset = assetRecord(iconName);
  const layers: QuadLayer[] = [fillLayer];
  if (asset) {
    const iconLayer = layerOf({ image: iconName, fit: "contain", opacity: 1 }, { w: MARK_BADGE_SIZE, h: MARK_BADGE_SIZE }, mc.unit);
    layers.push(iconLayer);
  }

  quads.push({
    id: `${n.id}::mark` as NodeId,
    layer: "mark",
    x: badgePos.x,
    y: badgePos.y,
    w: MARK_BADGE_SIZE * mc.unit,
    h: MARK_BADGE_SIZE * mc.unit,
    points: circlePointsLocal,
    transform: badgeTransform,
    layers,
    stroke: undefined,
    z,
  });

  return quads;
}
