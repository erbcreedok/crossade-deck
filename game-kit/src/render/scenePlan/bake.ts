import { type Point } from "../../core/atoms/bounded.js";
import { apply, chain, IDENTITY, move, type Transform } from "../../core/transform.js";
import { dashContour, offsetContour } from "../contour.js";
import { type Quad } from "./quads.js";
import { standing } from "./parts.js";

/**
 * A plan with its matrices FOLDED IN: points in view pixels, transform left as the identity.
 *
 * The two ways to consume one plan, and the whole of the hybrid:
 *
 * - LIVE — the renderer applies `transform`. One matrix per object is what a GPU does for
 *   free, so an animation that turns a card uploads no new geometry. The cost is that the
 *   matrix scales everything with it, including a stroke's WIDTH and a dash's LENGTH.
 * - BAKED — the geometry is recomputed exactly here, in a pure function a plain unit test can
 *   hold down, and a stroke stays the width it was asked for however large the node is. The
 *   cost is doing it again on every frame the node moves.
 *
 * PER QUAD, not per scene. The decision is about one node's cost and one node's stroke, so one
 * canvas can hold both — a resting desk baked with a card animating live over it, which is what
 * a real game looks like. `which` says who gets folded; the default is everyone.
 *
 * WHAT CANNOT BE FOLDED IS A TURNED PICTURE, and only that. A layer's picture is stored as a
 * rect — `x, y, w, h`, aligned to the screen axes — and there is nowhere in it to write an
 * angle. Fold a turned card and the contour turns while the picture inside stays straight:
 * wrong in a way that looks like a bug in the shape.
 *
 * Points have no such trouble, so a turned node made of fill and stroke alone bakes perfectly
 * well and is baked. The refusal names the picture, not the rotation — the rule used to say
 * "anything turned" and refused a great many quads that had nothing to lose.
 */
export function bakePlan(plan: readonly Quad[], which: (quad: Quad) => boolean = () => true): Quad[] {
  return plan.map((quad) => {
    if (!which(quad)) return quad;
    const t = quad.transform;
    // A rotation is exactly `b` and `c` being non-zero. Comparing to the identity as a whole
    // would also refuse a plain scale, which bakes perfectly well.
    const turned = t.b !== 0 || t.c !== 0;
    if (turned && quad.layers.some((layer) => layer.image)) return quad;
    const at = (p: Point): Point => apply(t, p);
    return {
      ...quad,
      points: quad.points.map(at),
      transform: IDENTITY,
      // `t.a`/`t.d` are the scales ONLY while the quad is unturned — which is exactly when a
      // picture survives the fold, and the refusal above is what guarantees it here.
      layers: quad.layers.map((layer) => {
        // A layer's clip is points like the contour, and folds the same way.
        const clipped = layer.clip ? { ...layer, clip: layer.clip.map(at) } : layer;
        // The axis is points in the node's own space, so it folds with the contour or a baked
        // wash would keep pointing where the node used to face.
        const folded = clipped.gradient
          ? { ...clipped, gradient: { ...clipped.gradient, from: at(clipped.gradient.from), to: at(clipped.gradient.to) } }
          : clipped;
        return folded.image
          ? {
              ...folded,
              image: {
                ...folded.image,
                ...at({ x: folded.image.x, y: folded.image.y }),
                w: folded.image.w * t.a,
                h: folded.image.h * t.d,
              },
            }
          : folded;
      }),
      stroke: quad.stroke
        ? {
            ...quad.stroke,
            // THE WIDTH IS LEFT ALONE, and the dashes are CUT AGAIN along the folded contour.
            //
            // This is the whole difference between the two modes, and it is a real one. Live,
            // the matrix scales the stroke with everything else: a card at twice the size wears
            // a border twice as thick and dashes twice as long. Baked, the geometry is
            // recomputed, so the border keeps the weight it was authored with and the dash
            // pattern stays the pattern somebody chose — which is what SVG spells
            // `vector-effect: non-scaling-stroke`.
            // The contour is MOVED first, exactly as it is when the plan is built — the dashes
            // carry their own alignment in their points, and a fold that skipped this would put
            // the baked border half a stroke off the live one. See `offsetContour`.
            dashes: quad.stroke.dash
              ? dashContour(
                  offsetContour(quad.points.map(at), (quad.stroke.alignment - 0.5) * quad.stroke.width),
                  quad.stroke.dash,
                )
              : undefined,
          }
        : undefined,
    };
  });
}
