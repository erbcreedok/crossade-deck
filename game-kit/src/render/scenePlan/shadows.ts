// THE SHADOW LAW, ALONE IN ITS OWN FILE — because it is a law, and because it was three of them.
//
// A SHADOW IS UNDER ITS PIECE. Always, without exception and without a branch. Height is a LENGTH
// — how far under — and never a place: a piece in a hand or in the air stands further from its
// shadow, never apart from it.
//
// It used to be conditional. The shadow followed the drawn pose if a finger held the piece, or if
// the clock was walking it along the desk, and otherwise it stayed at the resting pose — a tail of
// `??` that swallowed everything else. Every motion that fitted neither branch tore the shadow off
// the thing casting it: a throw left its shadow at the seat it had plainly left, and a piece easing
// home found its shadow already waiting there. There is no reading of a picture in which an object
// is in one place and its own shadow in another.
//
// It lives apart from the plan now for exactly that reason: a law buried in a ternary inside a
// 270-line function is a law nobody reads, and this one was wrong for months because of it.

import { type Node, type NodeId } from "../../core/node.js";
import { extentOf, footprint } from "../../core/atoms/bounded.js";
import { type Shadow } from "../../core/atoms/lit.js";
import { boxOf, layerOf } from "./parts.js";
import { LAYER_HEIGHT } from "./depth.js";
import { areaOf, type SurfacedFields } from "../../core/atoms/surfaced.js";
import { shadowFrom, shadowPicture, shadowSpot } from "../../core/atoms/shadow.js";
import { fieldsOf } from "../../core/node.js";
import { resolveZ } from "../../core/atoms/transformable.js";
import { type ResolveContext } from "../../core/resolve.js";
import { type Shape } from "../../core/atoms/bounded.js";
import { apply, compose, IDENTITY, move, scale, type Transform, type Vec } from "../../core/transform.js";
import { surfaceOutline } from "../contour.js";
import { surfaceRecord } from "../surfaces.js";
import { type Quad } from "./quads.js";

/** Everything the lamp needs to be asked about one caster — handed in, so this reads no scene. */
export interface ShadowLamp {
  readonly nodes: ReadonlyMap<NodeId, Transform>;
  readonly overrides: ReadonlyMap<NodeId, Transform> | undefined;
  /** Nodes a FINGER holds: lifted off the desk, so the fall lengthens. A length, not a place. */
  readonly carried: ReadonlySet<NodeId> | undefined;
  /** How high above the desk the clock is holding each piece right now. Also a length. */
  readonly grounded: ReadonlyMap<NodeId, number> | undefined;
  readonly toView: Transform;
  readonly depth: Shadow;
  /** The direction every shadow falls, a unit vector — the desk's lamp, read once per plan. */
  readonly fall: Vec;
  readonly unit: number;
  /** The contour a container's CONTENT wraps to, when it has one. */
  spread(holder: Node): Shape | undefined;
}

/** The caster's shadow as a quad of the SHADOW layer, or nothing when the node casts none. */
export function shadowQuad(n: Node, shown: Node, ctx: ResolveContext, lamp: ShadowLamp): Quad | undefined {

  const from = shadowFrom(n);
  if (!from) return undefined;
  const area = areaOf(shown);
  // WHAT IT SAYS IT LAYS DOWN, first of all. A piece whose picture is a drawing inside a box casts
  // that box otherwise — a rectangle under a figure it plainly does not belong to (`ShadowCaster`).
  const shape = shadowSpot(n) ?? lamp.spread(shown) ?? footprint(shown) ?? (area ? boxOf(area) : undefined);
  if (!shape) return undefined;
  // The silhouette is the contour as DRAWN — corners and all; the footprint is the bare box.
  const record =
    from === "silhouette" ? surfaceRecord(fieldsOf<SurfacedFields>(shown, "Surfaced")?.surface ?? "") : undefined;
  const points = surfaceOutline(shape, record?.radius ?? 0).map((p) => ({ x: p.x * lamp.unit, y: p.y * lamp.unit }));
  const z = resolveZ(ctx);
  // THE HAND IS WHAT LIFTS: while a finger holds this piece it is off the desk, and the fall
  // lengthens by `lifted`. A LENGTH, not a place — where the shadow falls is never conditional.
  const inHand = lamp.carried?.has(n.id) === true;
  // On the desk and moving: the shadow goes with it, and rides its height.
  const ride = lamp.grounded?.get(n.id);
  // THE FALL IS A LENGTH IN UNITS, and it is laid down in SCREEN pixels — so it is measured
  // against the scale of the view actually in force, not against the etalon.
  //
  // The two are the same number for the plain centred view, and they part company the moment a
  // camera is in front: her scale is zoom times her own unit, and a fall that kept using the
  // etalon would hold a constant pixel length while everything around it grew — a piece drifting
  // down onto its own shadow as the reader zooms in. The comment at the top of this file already
  // said units, so zoom never changes the shadow-to-size ratio; this is that sentence in code.
  const perUnit = Math.hypot(lamp.toView.a, lamp.toView.b);
  // `perZ` is the lamp's fall per LAYER — the z a pile counts in, cards thick. A hop is in root
  // UNITS, so it is turned into layers before the lamp is asked: a die half a unit off the felt is
  // ten card-thicknesses up, and its shadow drops away by that much rather than by a hair.
  const off = (lamp.depth.base + lamp.depth.perZ * (z + (ride ?? 0) / LAYER_HEIGHT) + (inHand ? lamp.depth.lifted : 0)) * perUnit;
  // A FALL OF NOTHING IS NO SHADOW. The layer's darkness is a constant, so a caster whose lamp gives
  // it no fall at rest still painted a full-strength shadow exactly under itself — a smear under
  // every man on a board, reading as dirt rather than as height. Height is the only thing a shadow
  // says; with none to say, it says nothing.
  if (off === 0) return undefined;
  // A SHADOW IS UNDER ITS PIECE. Always, without exception and without a branch: it is drawn from
  // the pose the piece is DRAWN at, so it travels with it, turns with it and stretches with it.
  //
  // This used to be three laws — the seat, unless a hand had the piece, unless the clock was
  // walking it along the desk — and every motion that fitted none of them tore the shadow off the
  // thing casting it. A piece would fly home while its shadow was already waiting there; a throw
  // would leave its shadow at the seat it had plainly left. There is no reading of a picture in
  // which an object is in one place and its own shadow in another.
  //
  // What HEIGHT does is the length of the fall, above — and that is the whole of the difference
  // the old branches were reaching for: a piece in a hand or in the air is further from its
  // shadow, never detached from it.
  const lying = lamp.overrides?.get(n.id) ?? lamp.nodes.get(n.id) ?? IDENTITY;
  const toGlass = compose(move(lamp.fall.x * off, lamp.fall.y * off), compose(lamp.toView, lying));
  const { x: cx, y: cy } = apply(toGlass, { x: 0, y: 0 });
  const ext = extentOf(shape);
  // WHAT DARKENS THE CONTOUR: the shadow ink, or — for a caster that names the drawing that falls —
  // that drawing, fitted to the contour as its own picture is fitted to the piece, at the same
  // darkness. The knight's shadow is then the knight, and the plan still reads no picture's alpha:
  // whoever drew the piece drew its shadow too.
  const picture = shadowPicture(n);
  const layer = picture
    ? layerOf({ image: picture, fit: "contain", opacity: lamp.depth.opacity }, ext, lamp.unit)
    : { paint: "shadow", image: undefined, opacity: lamp.depth.opacity };
  return {
    id: `${n.id}::shadow`,
    layer: "shadow",
    x: cx,
    y: cy,
    w: ext.w * lamp.unit,
    h: ext.h * lamp.unit,
    points,
    layers: [layer],
    transform: compose(toGlass, scale(lamp.unit > 0 ? 1 / lamp.unit : 0)),
    stroke: undefined,
    z,
  };
}
