// THE PLAN — what to draw, as data. Pure, and therefore testable without a GPU.
//
// This is the split that saved client1's engine and is adopted here from the start: geometry
// is a pure function, and the renderer only turns the answer into objects. Real Pixi cannot
// run in jsdom (no WebGL), so anything computed INSIDE the renderer is untestable by
// construction — every rule that lives here is a rule a plain unit test can hold down.
//
// Units become pixels exactly once, here, on the way out. Above this line everything is in
// units; below it, nothing is.
//
// A quad carries its CONTOUR, not a width and a height. The renderer is handed points and has
// nothing to branch on: a circle arrives as a polygon, a rounded corner as short chords, a
// dashed border as a list of polylines. Handing down `w/h/radius` instead is what made every
// shape but a rectangle come out rectangular, however carefully the model described it.


/** A picture placed in the area, in PIXELS — where it goes and whether it tiles. */

import { caps, walk, type Node, type NodeId } from "../../core/node.js";
import { placeChildren } from "../../core/atoms/container.js";
import { extentOf, footprint, outlineOf, type Point, type Shape } from "../../core/atoms/bounded.js";
import { castsShadow, shadowFrom } from "../../core/atoms/shadow.js";
import { lightVector, shadowOf } from "../../core/atoms/lit.js";
import { areaOf, type SurfacedFields } from "../../core/atoms/surfaced.js";
import { resolveAngle, resolveZ, type TransformableFields } from "../../core/atoms/transformable.js";
import { orientationOf } from "../../core/atoms/oriented.js";
import { screenScale, type ScreenedFields } from "../../core/atoms/screened.js";
import { fieldsOf } from "../../core/node.js";
import { contextFor, sumAlongChain, type ResolveContext } from "../../core/resolve.js";
import { type LabeledFields } from "../../core/atoms/labeled.js";
import { layoutText, type TextLine } from "../textLayout.js";
import { captionScale } from "../boxFit.js";
import { type FontSpec, type TextMeasure } from "../textMetrics.js";
import { DEFAULT_TEXT, textStyle } from "../textStyles.js";
import { type ViewerSettings } from "../../core/viewer.js";
import { assetRecord } from "../assets.js";
import { dashContour, offsetContour, surfaceOutline, type DashOptions } from "../contour.js";
import { applyEffects, type FilterRef, type OverlayRef } from "../effects.js";
import { fitBox } from "../fitBox.js";
import { type Paint } from "../../core/paint.js";
import { surfaceRecord, type GradientStop, type LineCap, type LineJoin, type PaintLayer, type Stroke } from "../surfaces.js";
import { polyline } from "../../core/path.js";
import { apply, chain, compose, IDENTITY, invert, move, pose, scale, type Transform } from "../../core/transform.js";
import { LAYER_HEIGHT } from "./depth.js";
import { type PlanInput } from "./input.js";
import { boxOf, layerOf, strokeOf } from "./parts.js";
import { type Mark, type Quad, type QuadText } from "./quads.js";
import { shadowQuad, type ShadowLamp } from "./shadows.js";
import { transformsOf } from "./transforms.js";
import { pitchStand, viewTransform } from "./marks.js";
import { standing } from "./parts.js";

export * from "./quads.js";
export * from "./input.js";
export { bakePlan } from "./bake.js";
export { gridMarks, boundsMarks, pitchStand, viewTransform } from "./marks.js";
export { transformsOf } from "./transforms.js";
export { LAYER_HEIGHT } from "./depth.js";
export type { ResolveContext };

export function scenePlan({ root, unit, width, height, viewer, view, pitch, overrides, raised, carried, grounded, measure }: PlanInput): Quad[] {
  const nodes = transformsOf(root);
  const toView = view ?? viewTransform(unit, width, height);
  /**
   * STANDING A BILLBOARD BACK UP, in screen space — the exact inverse of the camera's squash.
   *
   * A desk laid back is drawn short, and everything lying on it with it. What a table actually
   * looks like is the cloth lying and the CARDS standing: at full height, where they sit. That is
   * `Oriented: "viewer"` doing what it has always said — a node framed to the onlooker is
   * indifferent to how the world it stands in is turned — and it is the same sentence for a turn
   * and for a tilt, so the atom needs no new field.
   *
   * `undefined` when the desk is not laid back at all, so an ordinary scene composes nothing extra.
   */
  const standUp = pitchStand(pitch);
  // How much of the view's scale a screen-sized node has to give back: at zoom 1 the view IS the
  // unit and there is nothing to undo, so the whole thing is absent rather than a scale of one.
  const viewScale = Math.hypot(toView.a, toView.b);
  /** What the view is worth as a multiple of the etalon — the "zoom" a screened node argues with. */
  const viewOverUnit = viewScale > 0 && unit > 0 ? viewScale / unit : 1;
  // The lamp's arithmetic — how far a shadow falls (units, so zoom never changes the shadow-to-
  // size ratio), how much each point of resolved `z` adds, how dark the ink lies — is the DESK's
  // data (`Lit.shadow`, root-only), read once per plan. A per-piece length would be a second
  // light by the back door, so nothing below asks the caster.
  const depth = shadowOf(root);
  const out: Quad[] = [];
  // The direction every shadow falls — ONE formula, read once: the light is a root-only field.
  const fall = lightVector(root);

  /** Everything the shadow law is asked with — built once, so `shadows.ts` reads no scene itself. */
  const lamp: ShadowLamp = { nodes, overrides, carried, grounded, toView, depth, fall, unit, spread: (holder) => spreadOf(holder) };

  const visit = (n: Node): void => {
    const ctx = contextFor(n, unit, viewer);

    // THE ONE SEAM. Every runtime mechanic reaches the paint through here and nowhere else: the
    // node to draw (a card's other face is a substitute node), and the coats to mix over its
    // surface (a highlight, a censor). The list is empty until a mechanic registers itself, and
    // then this walk still knows none of them by name. The pose shift a reflect asks for is folded
    // in `transformsOf` instead, so it reaches the CHILDREN too; here only the paint is mixed.
    //
    // The CHILDREN come from the shown node too — a substitute face brings its whole subtree, and
    // the front's content does not bleed through the back. That is why this is a recursion over
    // what the effects answered, not a walk over the authored tree.
    const { node, coats } = applyEffects(n, ctx);
    if (castsShadow(n)) {
      const cast = shadowQuad(n, node, ctx, lamp);
      if (cast) out.push(cast);
    }
    paint(n, node, coats, ctx);
    for (const child of node.children) visit(child);
  };

  /**
   * The caster's shadow — a quad of the SHADOW layer. The SHAPE turns with the drawn geometry
   * (the silhouette follows the piece), but the OFFSET is the lamp's alone: it is applied in
   * VIEW space, after the whole pose, so no parent's angle ever swings the fall — the law a
   * shadow parented to a turned node would break by orbiting it. Height is a consequence of
   * `z`: the fall grows with the resolved height, and a piece resting on the desk still shows
   * a hair of it, or nothing would say the piece is not painted on.
   */
  /**
   * The wrap a casting STACK throws: the union, in the holder's own frame, of its footprint and
   * every direct child's placed box. A stack casts once, and what falls is the column as it
   * LIES — a slot-sized shadow under six dealt cards would say the cards float. Direct children
   * only: the day a deeper stack asks, this walks.
   */
  const spreadOf = (holder: Node): Shape | undefined => {
    if (!caps(holder).has("Container") || holder.children.length === 0) return undefined;
    const inv = invert(nodes.get(holder.id) ?? IDENTITY);
    if (!inv) return undefined;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    const grow = (shape: Shape | undefined, t: Transform): void => {
      if (!shape) return;
      for (const p of outlineOf(shape)) {
        const q = apply(t, p);
        minX = Math.min(minX, q.x);
        minY = Math.min(minY, q.y);
        maxX = Math.max(maxX, q.x);
        maxY = Math.max(maxY, q.y);
      }
    };
    grow(footprint(holder), IDENTITY);
    for (const child of holder.children) grow(footprint(child), compose(inv, nodes.get(child.id) ?? IDENTITY));
    if (!Number.isFinite(minX)) return undefined;
    return polyline([
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ]);
  };


  /**
   * The node's caption, laid out in its box — or nothing at all, which is the answer far more
   * often. The font is the desk's text style with its size turned into pixels HERE, at the plan's
   * edge, exactly like every other length; the wrapping itself is `layoutText`, kept pure so a
   * test can hold it down without a font engine.
   */
  const captionOf = (node: Node, area: { readonly w: number; readonly h: number }): QuadText | undefined => {
    if (!measure) return undefined;
    const worn = fieldsOf<LabeledFields>(node, "Labeled");
    if (!worn?.label) return undefined;
    const label = worn.label;
    // The ROLE the node named, or the desk's default when it named none — and also when it named
    // one nobody registered: a caption in the default face beats a scene that refuses to draw.
    const style = textStyle(worn.style) ?? DEFAULT_TEXT;
    const box = { w: area.w * unit, h: area.h * unit };
    const lay = (size: number) => {
      const font: FontSpec = { family: style.family, size, weight: style.weight };
      return { font, laid: layoutText({ text: label, font, width: box.w, lineHeight: style.lineHeight }, measure) };
    };

    const first = lay(style.size * unit);
    if (first.laid.lines.length === 0) return undefined;

    // THE BOX WINS. A caption bigger than the place it was given is shrunk to fit rather than left
    // to spill — and shrunk rather than CUT, because losing a player's word is not surviving its
    // length. The arithmetic is `boxFit`'s, the same one a button, a drop zone and a badge share,
    // so none of them can drift into its own idea of "fits".
    //
    // Re-laid rather than merely scaled: a smaller em wraps differently, and drawing yesterday's
    // line breaks at today's size is how a caption ends up with a ragged hole in the middle.
    const k = captionScale({ box, text: { w: first.laid.width, h: first.laid.height } });
    const out = k < 1 ? lay(style.size * unit * k) : first;
    return out.laid.lines.length > 0 ? { font: out.font, fill: style.fill, lines: out.laid.lines } : undefined;
  };

  const paint = (
    n: Node,
    node: Node,
    coats: ReturnType<typeof applyEffects>["coats"],
    ctx: ResolveContext,
  ): void => {
    const area = areaOf(node);
    if (!area) return;
    const fields = caps(node).has("Surfaced") ? fieldsOf<SurfacedFields>(node, "Surfaced") : undefined;
    // A CAPTION IS SOMETHING TO DRAW, so a node carrying one earns a quad even with no surface at
    // all — the ladder's rule is that a bare BOX draws nothing, not that words do. Such a quad has
    // no layers and no stroke, because the node authored neither.
    const caption = captionOf(node, area);
    if (!fields && !caption) return;

    // An unregistered name is skipped, not thrown: one bad reference must not take the scene
    // down and hide every node that was fine.
    const record = fields ? surfaceRecord(fields.surface) : undefined;
    if (!record && !caption) return;
    // ONE map from the node's own coordinates all the way to the glass: its pose, its owners'
    // poses, and units into pixels. Written inline it was three copies of the same two lines,
    // and none of them would have survived a node that could turn.
    // The node's pose WITH the unit folded in, so the points below stay in pixels around the
    // node's own origin and the matrix carries everything else. A mid-settle override, when the
    // motion runtime supplies one, stands in for the resting pose here — same space, so nothing
    // else in the pipeline learns that the node is in flight.
    const lying = compose(toView, overrides?.get(n.id) ?? nodes.get(n.id) ?? IDENTITY);
    // A node framed to the VIEWER stands out of the tilted plane; everything else lies on it. The
    // stand is about the node's OWN origin, so it gains height without walking up the screen.
    const stood = standUp && orientationOf(ctx) === "viewer" ? standing(lying, standUp) : lying;
    // A CONTROL IS MEASURED IN PIXELS. The view's own scale is taken back about the node's own
    // origin, so a handle is the same size at every zoom — which is what a handle is in every
    // application that has ever drawn one, because it is sized for the finger and a finger does not
    // grow with the picture. About its ORIGIN, so it holds its place on the thing it is a handle for
    // instead of walking across the glass as the view moves.
    // A CONTROL IS MEASURED IN PIXELS — between a floor and a ceiling. The view's own scale is taken
    // back about the node's own ORIGIN, so a handle holds its place on the thing it is a handle for
    // instead of walking across the glass; and only as far as its bounds allow, because a handle
    // that kept its pixels for ever ends up dwarfing the desk at one end and a speck at the other.
    const hold = caps(node).has("Screened")
      ? screenScale(fieldsOf<ScreenedFields>(node, "Screened"), viewOverUnit) / viewOverUnit
      : 1;
    const toGlass = Math.abs(hold - 1) > 1e-9 ? standing(stood, scale(hold)) : stood;
    // A ZERO UNIT IS NOT A DIVISION. A container with no size on screen — hidden, or measured
    // before layout — reports a unit of zero, and `1 / 0` puts NaN through the whole matrix.
    // Everything downstream then reads as "rotated", because NaN is not equal to zero either,
    // and a plan quietly stops baking. Zero scale is the honest answer: nothing has a size yet.
    const transform = compose(toGlass, scale(unit > 0 ? 1 / unit : 0));
    const { x: cx, y: cy } = apply(toGlass, { x: 0, y: 0 });

    // The contour is built from the node's own shape when it has one, and from the extent of
    // its content when it does not — the desk case, which has plenty to paint and no
    // footprint of its own.
    // A box around the content extent when the node has no shape of its own. Built here from
    // places rather than taken from the figures next door: those are presets, and they stand
    // ABOVE the renderer — a plan that reached for one would invert the ladder.
    const shape = footprint(node) ?? boxOf(area);
    // Every measurement in a record is in units too, and every one of them is converted HERE.
    // A single length left behind would be right on one screen and wrong on the next.
    const points = surfaceOutline(shape, record?.radius ?? 0).map((p) => ({ x: p.x * unit, y: p.y * unit }));

    // THE COATS, folded blindly. Their own layers sit OVER the surface's, in the same pixel
    // conversion every layer goes through — the plan never learns what a highlight or a censor is.
    // A coat's stroke, when it has one, REPLACES the surface's (a ring is the border while it
    // lasts), and its filter names a shader for the painter; last coat wins for both, since a
    // later effect is the more recent word.
    const coatLayers = (coats ?? []).flatMap((coat) => (coat.layers ?? []).map((layer) => layerOf(layer, area, unit)));
    let coatStroke: Stroke | undefined;
    let filter: FilterRef | undefined;
    let overlay: OverlayRef | undefined;
    for (const coat of coats ?? []) {
      if (coat.stroke) coatStroke = coat.stroke;
      if (coat.filter) filter = coat.filter;
      if (coat.overlay) overlay = coat.overlay;
    }

    out.push({
      id: n.id,
      x: cx,
      y: cy,
      w: area.w * unit,
      h: area.h * unit,
      points,
      layers: [...(record?.layers ?? []).map((layer) => layerOf(layer, area, unit)), ...coatLayers],
      transform,
      stroke: strokeOf(coatStroke ?? record?.stroke, points, unit),
      filter,
      overlay,
      ...(caption ? { text: caption } : {}),
      z: resolveZ(ctx),
    });
  };

  visit(root);

  // A stable sort by height: equal z keeps tree order, so siblings do not swap between frames
  // for no reason the reader can see. The SHADOW layer goes first — one pass, under everything
  // at rest; then flight beats height — a raised node sorts after every resting one — and
  // inside every group the height still rules.
  const lay = (q: Quad): number => (q.layer === "shadow" ? 0 : 1);
  const aloft = (q: Quad): number => (raised?.has(q.id) ? 1 : 0);
  return out.sort((a, b) => lay(a) - lay(b) || aloft(a) - aloft(b) || a.z - b.z);
}
