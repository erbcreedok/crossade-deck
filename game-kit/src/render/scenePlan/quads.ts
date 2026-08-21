// THE PLAN'S VOCABULARY — the shapes a painter is handed, and nothing that builds one.
//
// Every length in here is already PIXELS and every colour is still a token: the arithmetic happened
// in the plan, the palette is resolved at the glass. A backend that reads these and draws them owes
// the model nothing else.

import { type Point } from "../../core/atoms/bounded.js";
import { type NodeId } from "../../core/node.js";
import { type Paint } from "../../core/paint.js";
import { type Transform } from "../../core/transform.js";
import { type FilterRef, type OverlayRef } from "../effects.js";
import { type TextLine } from "../textLayout.js";
import { type FontSpec } from "../textMetrics.js";
import { type DashOptions } from "../contour.js";
import { type GradientStop, type LineCap, type LineJoin } from "../surfaces.js";

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
/**
 * A gradient with its axis ALREADY resolved to two points, pixels, in the node's own space — the
 * same space as the quad's contour, and folded by baking exactly as the contour is. The angle a
 * designer wrote became geometry here, where a unit test reads it.
 */
export interface QuadGradient {
  readonly from: Point;
  readonly to: Point;
  readonly stops: readonly GradientStop[];
}

export interface QuadLayer {
  readonly paint: Paint | undefined;
  /** A wash across the area, in place of the flat colour. Absent for the ordinary layer. */
  readonly gradient?: QuadGradient | undefined;
  readonly image: QuadImage | undefined;
  readonly opacity: number;
  /**
   * A closed contour to MASK this layer with, in pixels, in the node's own space — present only
   * when the layer declared a `part`. The fraction became geometry HERE, where a unit test reads
   * it; the painter is handed points and obeys, exactly as it is for the quad's own contour.
   */
  readonly clip?: readonly Point[] | undefined;
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
 * The caption on a quad, laid out: a resolved font, a colour token, and where each line's pen
 * starts. The painter draws strings at points and decides nothing — wrapping already happened in
 * `textLayout`, where a test could hold it down.
 */
export interface QuadText {
  readonly font: FontSpec;
  readonly fill: Paint;
  readonly lines: readonly TextLine[];
}

/**
 * One thing to draw, in PIXELS, already ordered. The renderer adds nothing of its own — it
 * only turns a token name into a colour, which is the one thing it cannot be handed, since a
 * GPU canvas has no CSS cascade to resolve a variable in.
 */
export interface Quad {
  readonly id: NodeId;
  /**
   * Set on a quad of the SHADOW layer — drawn in one pass under everything at rest. Its id is
   * the caster's with a `::shadow` suffix, which no lookup resolves: a shadow cannot be picked,
   * baked, or mistaken for a piece. Absent on every quad that IS a piece.
   */
  readonly layer?: "shadow";
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
  /**
   * Objects to DRAW over the quad, NAMED — the censor's dust. A filter reworks the pixels already
   * on the glass; an overlay is handed what the quad looks like and builds its own things on top,
   * which is the only way a mote can be the colour of the spot it was born on. Same discipline as
   * a filter: a name and numbers ride the plan, the objects are built where Pixi lives.
   */
  readonly overlay?: OverlayRef | undefined;
  /** The node's caption, laid out — absent when it has none, or when nobody handed a ruler. */
  readonly text?: QuadText | undefined;
  readonly z: number;
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
