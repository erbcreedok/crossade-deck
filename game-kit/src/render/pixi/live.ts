import { Container, Graphics, Text, Texture } from "pixi.js";
import { type Transform } from "../../core/transform.js";
import { type ThemeName } from "../../core/viewer.js";
import { type Quad, type QuadText } from "../scenePlan.js";
import { paint } from "../theme.js";
import { type LiveFilter } from "./filters.js";
import { type LiveOverlay } from "./overlays.js";

// ---- THE OBJECTS OF A FRAME, KEPT INTO THE NEXT ONE -------------------------------------------
//
// The plan is rebuilt from scratch every frame, and for a while so was the stage: everything
// destroyed and every Container, Graphics and Text built again, sixty times a second. That is
// what an animation cost, and it is why scenes froze — a `new Text` rasterises a glyph atlas, a
// `new Graphics` uploads geometry, a `new Filter` compiles a shader, and `destroy()` with no
// options removes a box's children WITHOUT destroying them, so the ones already paid for piled
// up behind the frame instead of going away.
//
// So the objects are KEPT, keyed by the quad's `id`, and a frame says only what changed:
//
//   - ORDER is still the plan's answer and nothing else's: the boxes are put on the stage in
//     plan order, and a frame whose order did not move touches the stage not at all;
//   - a quad whose DRAWING is unchanged (everything except its matrix) is not redrawn, which is
//     the common case at sixty frames a second — a live quad's contour is in its OWN space, so
//     an animation moves the matrix and leaves every point where it was;
//   - a quad that left the plan is destroyed WITH its context, its style and its filter.
//
// THE FILTER LAW, RESTATED. It read "the animated filters of the last frame are gone with its
// quads", which was true only because every quad was gone. It now says what it always meant: a
// filter belongs to its quad and is clocked for as long as that quad is in the plan asking for
// it BY THE SAME NAME AND THE SAME NUMBERS. A censor that lifts, a coat that turns a knob, a
// quad that leaves — each takes its filter with it, and the frame's clock list is rebuilt from
// the survivors whenever that set moves.

/** What one layer of one quad put in the box. Absent fields are parts that layer does not have. */
export interface LiveLayer {
  mask?: Graphics | undefined;
  fill?: Graphics | undefined;
  tile?: Graphics | undefined;
  clip?: Graphics | undefined;
  image?: Graphics | undefined;
  /** The texture the picture was drawn WITH — so a picture that lands later is noticed. */
  texture?: Texture | undefined;
}

/** One quad's standing objects, and the quad they were last drawn from. */
export interface LiveQuad {
  readonly box: Container;
  /** The last quad this box was DRAWN from — the whole test for "may this frame be skipped". */
  drawn: Quad;
  theme: ThemeName;
  matrix: Transform;
  layers: LiveLayer[];
  stroke?: Graphics | undefined;
  texts: Text[];
  overlay?: LiveOverlay | undefined;
  filter?: LiveFilter | undefined;
}

/** A pose no plan can hand down, so the first frame always writes the matrix. */
export const UNSET_POSE: Transform = { a: NaN, b: NaN, c: NaN, d: NaN, e: NaN, f: NaN };

/** Everything a box holds goes away WITH it — the options are the whole point of the call. */
export const DESTROY_WHOLE = { children: true, context: true, style: true, texture: false, textureSource: false } as const;

/** The Pixi style one caption is drawn in. Built in one place, so a restyle cannot drift from it. */
export function textFace(caption: QuadText, theme: ThemeName) {
  return {
    fontFamily: caption.font.family,
    fontSize: caption.font.size,
    fontWeight: String(caption.font.weight) as never,
    fill: paint(theme, caption.fill),
  };
}
