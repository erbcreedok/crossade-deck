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

import { caps, walk, type Node, type NodeId } from "../core/node.js";
import { placeChildren } from "../core/atoms/container.js";
import { footprint, outlineOf, type Point, type Shape } from "../core/atoms/bounded.js";
import { areaOf, type SurfacedFields } from "../core/atoms/surfaced.js";
import { resolveZ, type TransformableFields } from "../core/atoms/transformable.js";
import { fieldsOf } from "../core/node.js";
import { contextFor, type ResolveContext } from "../core/resolve.js";
import { type ViewerSettings } from "../core/viewer.js";
import { assetRecord } from "./assets.js";
import { dashContour, offsetContour, surfaceOutline, type DashOptions } from "./contour.js";
import { applyEffects, type FilterRef } from "./effects.js";
import { fitBox } from "./fitBox.js";
import { type Paint } from "../core/paint.js";
import { surfaceRecord, type LineCap, type LineJoin, type PaintLayer, type Stroke } from "./surfaces.js";
import { polyline } from "../core/path.js";
import { apply, compose, IDENTITY, move, pose, scale, type Transform } from "../core/transform.js";

/** A picture placed in the area, in PIXELS — where it goes and whether it tiles. */
export interface QuadImage {
  /** Where the renderer fetches it from; the name it was registered under is gone by here. */
  readonly src: string;
  /** The picture's box, centred like everything else. `repeat` makes this one tile. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly repeat: boolean;
}

/**
 * One coat of paint, resolved: a colour, a picture, or a colour under a picture.
 *
 * Both are optional and both may be absent — a layer of nothing draws nothing, which is what a
 * layer naming a picture nobody registered comes to. Skipped rather than thrown, exactly as a
 * dangling surface reference is.
 */
export interface QuadLayer {
  readonly paint: Paint | undefined;
  readonly image: QuadImage | undefined;
  readonly opacity: number;
}

/** The stroke of one quad, every length already in pixels. */
export interface QuadStroke {
  readonly color: Paint;
  readonly width: number;
  readonly opacity: number;
  readonly alignment: number;
  readonly cap: LineCap;
  readonly join: LineJoin;
  readonly miterLimit: number;
  /**
   * The dashes, as open polylines in pixels. `undefined` means a solid stroke along the whole
   * closed contour — which is NOT the same as an empty list, and the difference matters: an
   * empty list is a pattern that produced no dashes, and it must draw nothing.
   */
  readonly dashes: readonly (readonly Point[])[] | undefined;
  /**
   * The pattern the dashes were cut with, in pixels, kept beside them.
   *
   * Not bookkeeping: baking has to CUT THEM AGAIN along the folded contour, or a scaled node
   * would get a scaled pattern — which is the very thing a dash is defined not to do. Without
   * this the cut polylines are all that is left, and mapping those is the wrong answer.
   */
  readonly dash: DashOptions | undefined;
}

/**
 * One thing to draw, in PIXELS, already ordered. The renderer adds nothing of its own — it
 * only turns a token name into a colour, which is the one thing it cannot be handed, since a
 * GPU canvas has no CSS cascade to resolve a variable in.
 */
export interface Quad {
  readonly id: NodeId;
  /** Centre, in pixels from the top-left of the view. */
  readonly x: number;
  readonly y: number;
  /** The extent of the area, in pixels. Reported for inspection; the contour is what is drawn. */
  readonly w: number;
  readonly h: number;
  /**
   * The closed contour to fill — rounded corners and all, in pixels, in the node's OWN space:
   * around its origin, before its pose is applied.
   *
   * Its pose is `transform`, and there are two ways to consume the pair. See `bakePlan`.
   */
  readonly points: readonly Point[];
  /**
   * Where the node's own space lands on the glass: its pose, its owners' poses, and the view's
   * centre, as one matrix.
   *
   * LIVE, the renderer applies it — one matrix per object, which is what a GPU does for free,
   * and an animation that only turns a card re-uploads nothing.
   * BAKED (`bakePlan`), it is folded into the points and left as the identity — geometry
   * computed exactly, once, by code a plain unit test can hold down.
   */
  readonly transform: Transform;
  /** Bottom-first. */
  readonly layers: readonly QuadLayer[];
  readonly stroke: QuadStroke | undefined;
  /**
   * A GPU filter over the whole quad, NAMED — the painter builds and clocks it. Absent for the
   * ordinary node: only a runtime coat asks for one (a censored surface), and only the one file
   * that owns Pixi can turn the name into a shader. It rides the plan as plain data so everything
   * up to the glass stays a pure function.
   */
  readonly filter?: FilterRef | undefined;
  readonly z: number;
}

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
      layers: quad.layers.map((layer) =>
        layer.image
          ? {
              ...layer,
              image: {
                ...layer.image,
                ...at({ x: layer.image.x, y: layer.image.y }),
                w: layer.image.w * t.a,
                h: layer.image.h * t.d,
              },
            }
          : layer,
      ),
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

export interface PlanInput {
  readonly root: Node;
  /** Screen pixels per unit. */
  readonly unit: number;
  readonly width: number;
  readonly height: number;
  readonly viewer: ViewerSettings;
}

/**
 * Every node that is both surfaced and has an area, in paint order.
 *
 * A node with `Bounded` and no `Surfaced` produces NOTHING here — not a faint box, not an
 * outline. That is the ladder's whole point: the box is real and invisible, and the only way
 * to see one is `boundsMarks` below, which an onlooker has to ask for.
 */
export function scenePlan({ root, unit, width, height, viewer }: PlanInput): Quad[] {
  const nodes = transformsOf(root);
  const toView = viewTransform(unit, width, height);
  const out: Quad[] = [];

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
    paint(n, node, coats, ctx);
    for (const child of node.children) visit(child);
  };

  const paint = (
    n: Node,
    node: Node,
    coats: ReturnType<typeof applyEffects>["coats"],
    ctx: ResolveContext,
  ): void => {
    if (!caps(node).has("Surfaced")) return;
    const fields = fieldsOf<SurfacedFields>(node, "Surfaced");
    const area = areaOf(node);
    if (!fields || !area) return;

    // An unregistered name is skipped, not thrown: one bad reference must not take the scene
    // down and hide every node that was fine.
    const record = surfaceRecord(fields.surface);
    if (!record) return;
    // ONE map from the node's own coordinates all the way to the glass: its pose, its owners'
    // poses, and units into pixels. Written inline it was three copies of the same two lines,
    // and none of them would have survived a node that could turn.
    // The node's pose WITH the unit folded in, so the points below stay in pixels around the
    // node's own origin and the matrix carries everything else.
    const toGlass = compose(toView, nodes.get(n.id) ?? IDENTITY);
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
    const points = surfaceOutline(shape, record.radius ?? 0).map((p) => ({ x: p.x * unit, y: p.y * unit }));

    // THE COATS, folded blindly. Their own layers sit OVER the surface's, in the same pixel
    // conversion every layer goes through — the plan never learns what a highlight or a censor is.
    // A coat's stroke, when it has one, REPLACES the surface's (a ring is the border while it
    // lasts), and its filter names a shader for the painter; last coat wins for both, since a
    // later effect is the more recent word.
    const coatLayers = (coats ?? []).flatMap((coat) => (coat.layers ?? []).map((layer) => layerOf(layer, area, unit)));
    let coatStroke: Stroke | undefined;
    let filter: FilterRef | undefined;
    for (const coat of coats ?? []) {
      if (coat.stroke) coatStroke = coat.stroke;
      if (coat.filter) filter = coat.filter;
    }

    out.push({
      id: n.id,
      x: cx,
      y: cy,
      w: area.w * unit,
      h: area.h * unit,
      points,
      layers: [...record.layers.map((layer) => layerOf(layer, area, unit)), ...coatLayers],
      transform,
      stroke: strokeOf(coatStroke ?? record.stroke, points, unit),
      filter,
      z: resolveZ(ctx),
    });
  };

  visit(root);

  // A stable sort by height: equal z keeps tree order, so siblings do not swap between frames
  // for no reason the reader can see.
  return out.sort((a, b) => a.z - b.z);
}

/** The four corners of an area, centred on the origin — a shape for a node that declared none. */
function boxOf(area: { readonly w: number; readonly h: number }): Shape {
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
function layerOf(layer: PaintLayer, area: { readonly w: number; readonly h: number }, unit: number): QuadLayer {
  // A picture is FITTED HERE, in units, before anything becomes pixels. The arithmetic needs
  // the picture's proportions, and those come from what the asset DECLARED — not from the file,
  // which may not have arrived yet. A plan that waited on the network could not be a pure
  // function, and then none of this would be checkable without a browser.
  const asset = layer.image ? assetRecord(layer.image) : undefined;
  const placed = asset ? fitBox(area, asset, layer.fit, layer.align) : undefined;
  return {
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
function strokeOf(stroke: Stroke | undefined, points: readonly Point[], unit: number): QuadStroke | undefined {
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

/**
 * One outline to stroke, in PIXELS and already closed. A mark is not a Quad: a Quad is a
 * surface somebody authored, a mark is tooling drawn over it, and merging the two would put a
 * debug setting inside the description of what the desk HOLDS.
 */
export interface Mark {
  readonly id: NodeId;
  readonly points: readonly Point[];
  /**
   * Whether the last point runs back to the first. A box outline does; the two strokes of an
   * origin cross do not, and closing them would draw each arm twice.
   *
   * The renderer still receives POINTS and still has nothing to branch on beyond this — it does
   * not learn what a box is, or what an origin is.
   */
  readonly closed: boolean;
  /**
   * The token to stroke it with, and the width in pixels.
   *
   * Carried on the mark rather than chosen by the renderer, and that is what makes a second
   * debug layer possible at all: the renderer used to hardcode one colour and one width, so
   * every layer would have looked like the box outline — a coordinate grid in the same ink as
   * the thing it is there to measure.
   *
   * The width is in PIXELS, and that is the one place tooling breaks the unit rule on purpose:
   * a debug line describes the scene, it is not part of it, so it must stay a hairline instead
   * of growing with the etalon until it reads as a border somebody authored.
   */
  readonly paint: string;
  readonly width: number;
}

/**
 * Half the length of an origin cross's arms, in UNITS — so it grows with the etalon like
 * everything else, instead of being a fixed number of pixels that is huge on a phone.
 */
const ORIGIN_ARM = 0.1;

/**
 * THE COORDINATE GRID — one line per unit, so a size can be READ off the scene.
 *
 * A second debug layer, and the reason it is separate from the box outline: they answer
 * different questions. The outline says where this node is; the grid says how big anything is,
 * without a node being involved at all. Switched on together they are still readable because a
 * mark carries its own ink — the grid is the faint one.
 *
 * Ruled from the ROOT's origin, which is the centre of the view, so the lines cross exactly
 * where a node with no pose sits. A grid pinned to the top-left corner instead would put its
 * zero somewhere no measurement starts from.
 */
/**
 * Units into view pixels, with the ROOT's origin at the centre of the view.
 *
 * The one place that knows a unit is worth pixels, and the one place that knows where zero is.
 * It was three inline copies of `width / 2 + x * unit`; a fourth was about to be written for
 * the grid, which is when it became obvious.
 */
export function viewTransform(unit: number, width: number, height: number): Transform {
  return compose(move(width / 2, height / 2), scale(unit));
}

export function gridMarks({ unit, width, height, viewer }: PlanInput): Mark[] {
  if (!viewer.debugGrid || unit <= 0) return [];
  // A grid finer than a few pixels is a wash of colour, not a grid: at that point it hides the
  // scene it is there to measure. Nothing is drawn rather than something unreadable.
  if (unit < 6) return [];

  const marks: Mark[] = [];
  const cx = width / 2;
  const cy = height / 2;
  const line = (points: readonly Point[]): Mark => ({
    id: GRID_ID,
    closed: false,
    points,
    paint: "grid",
    width: 1,
  });
  const minor = (points: readonly Point[]): Mark => ({
    id: GRID_ID,
    closed: false,
    points,
    paint: "gridMinor",
    width: 0.5,
  });
  for (let i = 0; cx + i * unit <= width || cx - i * unit >= 0; i += 1) {
    for (const x of i === 0 ? [cx] : [cx + i * unit, cx - i * unit]) {
      if (x >= 0 && x <= width) marks.push(line([{ x, y: 0 }, { x, y: height }]));
    }
  }
  for (let i = 0; cy + i * unit <= height || cy - i * unit >= 0; i += 1) {
    for (const y of i === 0 ? [cy] : [cy + i * unit, cy - i * unit]) {
      if (y >= 0 && y <= height) marks.push(line([{ x: 0, y }, { x: width, y }]));
    }
  }

  // THE TENTHS, ruled all the way across like the units — just quieter.
  //
  // As ticks on the axes they were a scale you had to carry to the shape by eye. As lines they
  // are a grid you can read a width off wherever the shape happens to be. What keeps them from
  // becoming a wash is that they are not the same line: half the width and their own, dimmer
  // token, so the whole units still read as the whole units.
  //
  // Dropped once a tenth is only a few pixels apart, for the same reason the units are: a line
  // nobody can resolve is ink, not information.
  if (unit * MINOR >= 8) {
    const step = unit * MINOR;
    const across = Math.ceil(width / 2 / step);
    const down = Math.ceil(height / 2 / step);
    for (let i = -across; i <= across; i += 1) {
      if (i % 10 === 0) continue; // a whole unit already has its own, stronger line
      const x = cx + i * step;
      if (x >= 0 && x <= width) marks.push(minor([{ x, y: 0 }, { x, y: height }]));
    }
    for (let i = -down; i <= down; i += 1) {
      if (i % 10 === 0) continue;
      const y = cy + i * step;
      if (y >= 0 && y <= height) marks.push(minor([{ x: 0, y }, { x: width, y }]));
    }
  }
  return marks;
}

/** A tenth of a unit — the subdivision a reader actually estimates in. */
const MINOR = 0.1;

/**
 * The grid belongs to no node, and says so. Every other mark names the node it outlines; an
 * empty id here would read as "the root", which is a different and wrong claim.
 */
const GRID_ID = "" as NodeId;

/**
 * The footprint of every node that has one, outlined — and nothing when the viewer did not ask.
 *
 * Only boxes are marked. A container's content extent is an area too, but it is DERIVED from
 * the children that are already outlined; drawing it as well would draw the same information
 * twice and suggest the desk has a box of its own, which is the one thing it does not.
 *
 * The mark keeps the box's SHARP corners even when the surface over it is rounded: it reports
 * where the box is, and a rounded corner is a matter of paint.
 */
export function boundsMarks({ root, unit, width, height, viewer }: PlanInput): Mark[] {
  if (!viewer.debugBounds) return [];

  const nodes = transformsOf(root);
  const toView = viewTransform(unit, width, height);
  const marks: Mark[] = [];
  walk(root, (n) => {
    const shape = footprint(n);
    if (!shape) return; // no box, nothing to outline — and that is a real answer
    const toGlass = compose(toView, nodes.get(n.id) ?? IDENTITY);
    const px = (p: Point): Point => apply(toGlass, p);
    marks.push({ id: n.id, closed: true, points: outlineOf(shape).map(px), paint: "debug", width: 1 });

    // AND THE ORIGIN ITSELF, as a cross.
    //
    // `(0,0)` in a node's own coordinates is the point everything is measured from: `at` puts
    // THAT there, and a rotation will turn about THAT. For a rect or a circle it is the centre
    // by construction, but a polygon or a path carries whatever coordinates its author wrote —
    // so a pasted shape can sit far off its own origin, and nothing on screen said so. The
    // first anyone would learn of it is the shape flying off on its first rotation.
    const arm = (a: Point, b: Point): Mark => ({ id: n.id, closed: false, points: [px(a), px(b)], paint: "debug", width: 1 });
    marks.push(arm({ x: -ORIGIN_ARM, y: 0 }, { x: ORIGIN_ARM, y: 0 }));
    marks.push(arm({ x: 0, y: -ORIGIN_ARM }, { x: 0, y: ORIGIN_ARM }));
  });
  return marks;
}

/**
 * Where every node sits, in units, relative to the root — the layout's answer where a
 * container spoke, the node's own pose where it did not.
 *
 * Read top-down in one pass: a child's origin needs its owner's, and the owner is always
 * visited first.
 */
export function transformsOf(root: Node): Map<NodeId, Transform> {
  const out = new Map<NodeId, Transform>();
  // THE SAME SEAM as scenePlan's, on the GEOMETRY side: an effect's `pre` (a flip's reflection) is
  // folded into a node's own transform so its CHILDREN inherit it through the chain — a mirrored
  // stack turns its cards over with it, and two reflections up the chain cancel exactly. The walk
  // knows no mechanic by name; the paint side reads `coats`, this side reads `pre`.
  //
  // And it descends into the SHOWN node's children, not the authored one's: a substitute face
  // stands exactly where the node stood — same slot, same pose — and carries its own subtree,
  // whose ids land in this map so the plan can place every quad it is about to draw.
  const seed = shownOf(root);
  const rootHere = compose(poseOf(root), seed.pre);
  out.set(root.id, rootHere);
  if (seed.node.id !== root.id) out.set(seed.node.id, rootHere);

  const descend = (shown: Node, here: Transform): void => {
    const placed = placeChildren(shown);
    for (const child of shown.children) {
      // The LAYOUT's answer where a container spoke, the child's own pose where it did not —
      // and either way it is composed onto the owner's, not added to it. Added, a card in a
      // turned hand would sit in the right place and face the wrong way.
      const at = placed.get(child.id) ?? ownPose(child);
      const own = fieldsOf<TransformableFields>(child, "Transformable");
      const base = compose(here, pose(at, own?.angle ?? 0, own?.scale ?? 1));
      const eff = shownOf(child);
      const t = compose(base, eff.pre);
      out.set(child.id, t);
      if (eff.node.id !== child.id) out.set(eff.node.id, t);
      descend(eff.node, t);
    }
  };
  descend(seed.node, rootHere);

  return out;
}

/** A node's substitute and pose shift from the effects list — itself and the identity when none. */
function shownOf(n: Node): { node: Node; pre: Transform } {
  return applyEffects(n, contextFor(n, 1));
}

/** The root's own pose. It has no owner, so nothing composes onto it. */
function poseOf(n: Node): Transform {
  const own = fieldsOf<TransformableFields>(n, "Transformable");
  return pose(ownPose(n), own?.angle ?? 0, own?.scale ?? 1);
}


function ownPose(n: Node): { x: number; y: number } {
  const at = fieldsOf<TransformableFields>(n, "Transformable")?.at;
  return { x: at?.x ?? 0, y: at?.y ?? 0 };
}

export type { ResolveContext };
