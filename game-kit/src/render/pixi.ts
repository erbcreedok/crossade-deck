// THE ONLY FILE THAT IMPORTS PIXI. Guarded by a scan, and the rule is worth the guard: the
// day the renderer is swapped, exactly one file is rewritten and the model does not notice.
//
// There is almost nothing here on purpose. What to draw and where is decided by `scenePlan`,
// which is pure and runs in a plain unit test; this turns the answer into objects. Anything
// computed in THIS file is untestable by construction — jsdom has no WebGL, so a rule that
// slips in here is a rule nobody can hold down. Keep it dumb.

import {
  Application,
  Assets,
  BlurFilter,
  Container,
  defaultFilterVert,
  Filter,
  GlProgram,
  Graphics,
  Matrix,
  RenderTexture,
  Text,
  Texture,
  UniformGroup,
} from "pixi.js";
import { type Point } from "../core/atoms/bounded.js";
import { type Paint } from "../core/paint.js";
import { type Transform } from "../core/transform.js";
import { type ThemeName } from "../core/viewer.js";
import {
  DUST_FLICKER,
  DUST_LEVERS,
  DUST_PER_CELL,
  MOTE_CAP,
  dustCells,
  dustParams,
  dustPoints,
  dustStep,
  moteAt,
  thinPoints,
} from "./dust.js";
import { type FilterRef, type OverlayRef } from "./effects.js";
import { type Painter } from "./painter.js";
import {
  type Mark,
  type Quad,
  type QuadImage,
  type QuadLayer,
  type QuadStroke,
  type QuadText,
} from "./scenePlan.js";
import { paint } from "./theme.js";

export { type Painter };

// THE FILTER REGISTRY — name → a Pixi filter, and the ONE place a shader is built and clocked.
//
// The model only NAMES a filter: `scenePlan` carries `{ name, params }` as plain data, decided by
// a pure function a unit test holds down. The pixels — the shader, the uniforms, the per-frame
// clock — can only live here, the file jsdom cannot run, and that is the honest boundary: the
// plumbing (a name resolves or is skipped) is testable, the light is not. A dangling name is
// skipped exactly as a dangling surface is; a filter that fails to build is skipped too, and the
// coat's own wash still masks the surface, so a bad shader dims the scene rather than dropping it.
//
// A built filter may hand back a `tick(seconds)` — its own animation, driven by the shared ticker.
interface LiveFilter {
  readonly filter: Filter;
  readonly tick?: (seconds: number) => void;
}
type FilterFactory = (params: Readonly<Record<string, number>>) => LiveFilter;

const FILTERS = new Map<string, FilterFactory>();

/** Register a filter shader under a name a coat can point at. The second door, like the painter. */
export function registerFilter(name: string, factory: FilterFactory): void {
  FILTERS.set(name, factory);
}

/** Build the named filter, or `undefined` — a dangling name, or a shader that would not compile. */
function buildFilter(ref: FilterRef): LiveFilter | undefined {
  const factory = FILTERS.get(ref.name);
  if (!factory) return undefined;
  try {
    return factory(ref.params);
  } catch {
    return undefined;
  }
}

// `blur` — Pixi's own filter, animated, and what `glass` and `frost` are made of: the strength sets
// the base blur and the clock breathes it, so a pane reads as a pane rather than as a smudge. A
// core filter on purpose — a hand-written shader is the one thing in here nothing could hold down,
// so a stock recipe leans on what Pixi ships wherever it can.
registerFilter("blur", (params) => {
  const strength = Number.isFinite(params.strength) ? Math.max(0, Math.min(1, params.strength!)) : 0.5;
  const base = 2 + 12 * strength;
  const filter = new BlurFilter({ strength: base, quality: 3 });
  return { filter, tick: (t) => (filter.blur = base * (0.75 + 0.25 * Math.sin(t * 2))) };
});

// ---- THE EDITION SHADERS — light MOVING over a surface, which a stack of flat films cannot be --
//
// `polychrome` and `foil` are Balatro's editions, and both are motion by definition: an iridescent
// film whose hue is a little different at every point and every moment, a cold streak running down
// the diagonal. A renderer with no shader can only approximate them by cutting the face into `part`
// slices, and that is exactly what it reads as — stripes. So the recipes NAME these (see
// `render/coats.ts`) and the light itself lives here, in the one file that owns pixels, driven by
// the same shared ticker `blur` rides.
//
// GLSL only, no WGSL twin: the painter takes the renderer's default preference, and that is WebGL.
// A program that will not compile is skipped by `buildFilter` exactly as a dangling name is, and
// the recipe's own flat film still tints the surface — a backend without these dulls the edition
// rather than dropping the node.

/** A knob off the plan: the number it sent, or the shader's own default when it sent nothing sane. */
function knob(params: Readonly<Record<string, number>>, name: string, fallback: number): number {
  const value = params[name];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * What both edition programs share: the filter's varying, its input, and three helpers.
 *
 * `uInputClamp.zw` is the far corner of the node's own frame inside the filter texture, so
 * `vTextureCoord / uInputClamp.zw` runs 0..1 over THE NODE and not over the screen — the sheen
 * belongs to the tile and travels with it.
 *
 * Colours arrive PREMULTIPLIED. Both programs divide the alpha out before touching a hue and put
 * it back on the way out; skipping that step tints the anti-aliased rim of a rounded corner
 * differently from its middle, and the corner is where it shows first.
 */
const COAT_SHADER_HEAD = `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform highp vec4 uInputClamp;
uniform float uTime;
uniform float uStrength;
uniform float uHue;

// The hue wheel as a ramp: 0..1 in, a fully saturated colour out. The same wheel the spin token
// walks, so a coat's parametric tint and this shader mean the same thing by a number.
vec3 hueRamp(float turn) {
  vec3 wheel = abs(fract(vec3(turn) + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return clamp(wheel - 1.0, 0.0, 1.0);
}

// Screen: light ADDS. The surfaces under a coat are near-neutral darks, and rotating the hue of a
// grey moves nothing at all — the sheen has to be put there, not merely turned.
vec3 screenOver(vec3 base, vec3 light) {
  return 1.0 - (1.0 - base) * (1.0 - light);
}

float luma(vec3 tone) {
  return dot(tone, vec3(0.299, 0.587, 0.114));
}
`;

/**
 * POLYCHROME — one hue, a little different everywhere and everywhen. That is the whole of
 * iridescence, and the reason it cannot be flat layers: what the eye reads is the DRIFT.
 *
 * The field is three waves whose frequencies never line up, so the colour front is a slow curve
 * crossing the face rather than an edge sweeping it. It spans a NARROW arc of the wheel around
 * whatever hue the coat was given — oil on water shifts through neighbouring hues, and a full lap
 * of the wheel reads as a flag rather than a finish.
 */
const POLYCHROME_FRAG = `${COAT_SHADER_HEAD}
void main(void) {
  vec4 src = texture(uTexture, vTextureCoord);
  if (src.a <= 0.0) {
    finalColor = src;
    return;
  }
  vec3 base = src.rgb / src.a;
  vec2 uv = vTextureCoord / uInputClamp.zw;
  vec2 p = (uv - 0.5) * 2.0;

  float field =
      sin(p.x * 2.7 + uTime * 0.62)
    + sin((p.x + p.y * 1.3) * 2.1 - uTime * 0.47)
    + sin(length(p - vec2(0.4 * sin(uTime * 0.29), 0.3 * cos(uTime * 0.23))) * 3.9 + uTime * 0.8);

  vec3 sheen = hueRamp(uHue + field * 0.085);

  // TWO DIRECTIONS, ONE SHEEN, chosen by how bright the ground already is. On a near-black the
  // colour has to be ADDED — there is no hue in a dark grey to rotate. On a white card face it has
  // to be TAKEN AWAY instead, because screening light onto white only makes more white, and that
  // is what an edition on a card face would look like: nothing. Balatro's rainbow on a pale card
  // is the multiply half of this.
  vec3 glow = screenOver(base, sheen * 0.45);
  vec3 stain = mix(base, base * sheen, 0.68);
  vec3 lit = mix(glow, stain, smoothstep(0.3, 0.7, luma(base)));
  // ...and a slow swell in brightness, so the film breathes where the hue itself barely moves.
  lit *= 0.94 + 0.12 * (0.5 + 0.5 * sin(field * 1.7 + uTime * 0.9));

  finalColor = vec4(mix(base, lit, uStrength) * src.a, src.a);
}
`;

/**
 * FOIL — a cold streak sliding down the diagonal. A laminated sheet is dull until the light moves
 * on it, so the travel IS the edition; the film's cold cast is only what holds the two together.
 *
 * Two streaks, not one: a narrow bright crest and a wide soft one. A real sheet reflects the lamp
 * AND the room around it, and a single band reads as a painted stripe.
 */
const FOIL_FRAG = `${COAT_SHADER_HEAD}
// A wrapped gaussian crest: 1 at the centre, fading either side, repeating every unit — so the
// streak leaves one edge and arrives at the other without a seam to catch the eye.
float crest(float x, float centre, float width) {
  float d = abs(fract(x - centre + 0.5) - 0.5);
  return exp(-(d * d) / (width * width));
}

void main(void) {
  vec4 src = texture(uTexture, vTextureCoord);
  if (src.a <= 0.0) {
    finalColor = src;
    return;
  }
  vec3 base = src.rgb / src.a;
  vec2 uv = vTextureCoord / uInputClamp.zw;

  // The diagonal the light runs down, bent a little so the front is a curve and not a ruler edge.
  float run = uv.x * 0.72 + uv.y * 0.69 + 0.055 * sin(uv.y * 5.5 - uTime * 0.55);
  float travel = run * 1.25 - uTime * 0.2;
  float streak = crest(travel, 0.0, 0.055) * 0.95 + crest(travel, 0.38, 0.19) * 0.4;

  vec3 cold = hueRamp(uHue);
  vec3 pale = mix(cold, vec3(1.0), 0.45);
  // The film's own cast — a laminated sheet is a touch colder EVERYWHERE, not only where it
  // catches the lamp. Without it the streak reads as a stripe painted on an untreated face.
  vec3 chilled = mix(base, base * mix(cold, vec3(1.0), 0.55), 0.3);
  // The crest, and the same two directions the polychrome takes: added to a dark ground, taken
  // out of a bright one, so a glint on a white card face is cold rather than invisible.
  vec3 glow = screenOver(chilled, pale * streak * 0.85);
  vec3 stain = mix(chilled, chilled * mix(cold, vec3(1.0), 0.3), streak * 0.9);
  vec3 lit = mix(glow, stain, smoothstep(0.35, 0.75, luma(base)));

  finalColor = vec4(mix(base, lit, uStrength) * src.a, src.a);
}
`;

/**
 * Both editions, built the same way — one program, one clock, three knobs. The clock is the only
 * thing that changes after the build: a plan is redrawn when the scene changes, and the filter is
 * rebuilt with it, so `strength` and `hue` are settled the moment the shader exists.
 */
function editionFilter(name: string, fragment: string, strength: number, hue: number): LiveFilter {
  const coatUniforms = new UniformGroup({
    uTime: { value: 0, type: "f32" },
    uStrength: { value: Math.max(0, Math.min(1, strength)), type: "f32" },
    uHue: { value: hue, type: "f32" },
  });
  const filter = new Filter({
    glProgram: GlProgram.from({ vertex: defaultFilterVert, fragment, name }),
    resources: { coatUniforms },
    // INHERIT BOTH. A filter renders its subject into a target of its own, and at the default
    // resolution of 1 a retina card comes back softened — the sheen would be paid for with the
    // sharpness of the thing it sits on.
    resolution: "inherit",
    antialias: "inherit",
  });
  return { filter, tick: (t) => (coatUniforms.uniforms.uTime = t) };
}

registerFilter("polychrome", (params) =>
  editionFilter("polychrome-coat", POLYCHROME_FRAG, knob(params, "strength", 0.9), knob(params, "hue", 0)),
);

// The cold end of the wheel is what makes a foil a foil, so the hue has a default HERE rather than
// at the call site: a recipe that says nothing about colour still gets ice and not a rainbow.
const COLD_SHEEN = 0.55;

registerFilter("foil", (params) =>
  editionFilter("foil-coat", FOIL_FRAG, knob(params, "strength", 0.85), knob(params, "hue", COLD_SHEEN)),
);

// THE OVERLAY REGISTRY — name → things DRAWN over a quad, and the second thing the clock drives.
//
// A filter reworks the pixels the box already put on the glass; an overlay is handed a look at
// them and builds its OWN objects on top. Two seams and not one with a flag, because the painter
// genuinely does two different jobs — and because there is a whole class of effect a shader cannot
// reach: the censor's dust is a thousand little squares, each one the colour of the spot it was
// born on, moving independently. No filter can be handed that and no wash can imitate it.
//
// The discipline is the filter's, exactly: the plan carries a NAME and numbers, the objects are
// built here, and a name nobody registered is skipped rather than thrown over.
interface LiveOverlay {
  readonly view: Container;
  readonly tick?: (seconds: number) => void;
}

/** A shrunken picture of the face under an overlay: `cols × rows` RGBA pixels, premultiplied. */
export interface OverlaySample {
  readonly cols: number;
  readonly rows: number;
  readonly pixels: ArrayLike<number>;
}

/**
 * What the painter can tell an overlay about the quad it is going over — and it is deliberately
 * almost nothing. `width`/`height` are the quad's extent in the plan's pixels, which is the space
 * the overlay's own view draws in; `sample` reads the face into a grid of `step`-pixel cells.
 *
 * Reading the glass is the ONE thing only the renderer can do, so it is the one thing this hands
 * over. What the grid then means — which cells are lit, what colour a mote inherits, where it is
 * at second `t` — is decided in `render/dust.ts`, under a unit test.
 */
export interface OverlaySource {
  readonly width: number;
  readonly height: number;
  sample(step: number): OverlaySample;
}

type OverlayFactory = (params: Readonly<Record<string, number>>, source: OverlaySource) => LiveOverlay;

const OVERLAYS = new Map<string, OverlayFactory>();

/** Register an overlay under a name a coat can point at. The filter registry's twin. */
export function registerOverlay(name: string, factory: OverlayFactory): void {
  OVERLAYS.set(name, factory);
}

/** Build the named overlay, or `undefined` — a dangling name, or a builder that threw. */
function buildOverlay(ref: OverlayRef, source: OverlaySource): LiveOverlay | undefined {
  const factory = OVERLAYS.get(ref.name);
  if (!factory) return undefined;
  try {
    return factory(ref.params, source);
  } catch {
    return undefined;
  }
}

// CENSOR'S `dust` — the hidden face ground up, and the reason the overlay seam exists.
//
// Motes are born on the node's own silhouette, each carrying the colour of the cell it came from,
// drift outwards, fade in and out over their own short lives and are replaced. A censored card
// still reads as THAT card, smeared, which is the whole difference between a censor and a grey bar.
//
// Everything decided here is decided in one line each, because everything else was decided in
// `dust.ts` where a test can reach it: the grid step, which cells are lit, what colour a mote
// carries, and where it is at second `t`. This only reads pixels and draws squares.
registerOverlay("dust", (params, source) => {
  const motes = dustParams(
    {
      block: knob(params, "block", DUST_LEVERS.block),
      swapsPerSec: knob(params, "swapsPerSec", DUST_LEVERS.swapsPerSec),
      jitterAmp: knob(params, "jitterAmp", DUST_LEVERS.jitterAmp),
      jitterFreq: knob(params, "jitterFreq", DUST_LEVERS.jitterFreq),
    },
    DUST_FLICKER,
  );
  const step = dustStep(source.width, source.height);
  const shot = source.sample(step);
  const cloud = thinPoints(
    dustPoints(dustCells(shot.pixels, shot.cols * shot.rows), shot.cols, shot.rows, step, DUST_PER_CELL),
    MOTE_CAP,
  );
  const view = new Container();
  const g = new Graphics();
  view.addChild(g);
  // How thickly the cloud is drawn — the coat's `level`, and the one knob the story exposes.
  view.alpha = Math.max(0, Math.min(1, knob(params, "level", 0.7)));
  const side = motes.dot;
  return {
    view,
    // ONE Graphics REBUILT PER FRAME, not a thousand objects moved. A mote is a square that lives
    // under a second; keeping an object per mote would spend the whole frame on bookkeeping for
    // things that are about to be thrown away.
    tick: (t) => {
      g.clear();
      for (let i = 0; i < cloud.length; i += 1) {
        const mote = moteAt(cloud, i, motes, t);
        // Below this the square costs a fill and shows nothing.
        if (mote.alpha <= 0.02) continue;
        g.rect(mote.x - side / 2, mote.y - side / 2, side, side).fill({ color: mote.color, alpha: mote.alpha });
      }
    },
  };
});

export interface PixiPainterOptions {
  readonly width: number;
  readonly height: number;
  readonly resolution: number;
}

/** A polyline into a path. The one drawing primitive this file needs, and it reads no sorts. */
function trace(g: Graphics, points: readonly { readonly x: number; readonly y: number }[], close: boolean): void {
  points.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
  if (close) g.closePath();
}

/**
 * The matrix that maps a texture into a box, in the local space the fill is drawn in.
 *
 * Pixi wants texture space, so a box of `w × h` pixels holding a texture of `tw × th` is a
 * scale of `w/tw` and a move to the box's top-left corner.
 */
function boxMatrix(texture: Texture, box: { x: number; y: number; w: number; h: number }): Matrix {
  return new Matrix()
    .scale(box.w / texture.width, box.h / texture.height)
    .translate(box.x - box.w / 2, box.y - box.h / 2);
}

/** A tiled fill: the same map, but anchored to the AREA so the tiles line up across it. */
function tileMatrix(texture: Texture, image: { x: number; y: number; w: number; h: number }): Matrix {
  return boxMatrix(texture, image);
}

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
interface LiveLayer {
  mask?: Graphics | undefined;
  fill?: Graphics | undefined;
  tile?: Graphics | undefined;
  clip?: Graphics | undefined;
  image?: Graphics | undefined;
  /** The texture the picture was drawn WITH — so a picture that lands later is noticed. */
  texture?: Texture | undefined;
}

/** One quad's standing objects, and the quad they were last drawn from. */
interface LiveQuad {
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
const UNSET_POSE: Transform = { a: NaN, b: NaN, c: NaN, d: NaN, e: NaN, f: NaN };

function sameMatrix(a: Transform, b: Transform): boolean {
  return a.a === b.a && a.b === b.b && a.c === b.c && a.d === b.d && a.e === b.e && a.f === b.f;
}

/** A colour is a token name OR a token and a number, and the pair has to be compared as a pair. */
function samePaint(a: Paint | undefined, b: Paint | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a === "string" || typeof b === "string") return false;
  return a.token === b.token && a.param === b.param;
}

function samePoints(a: readonly Point[] | undefined, b: readonly Point[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const p = a[i]!;
    const q = b[i]!;
    if (p.x !== q.x || p.y !== q.y) return false;
  }
  return true;
}

function sameDashes(a: readonly (readonly Point[])[] | undefined, b: readonly (readonly Point[])[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (!samePoints(a[i], b[i])) return false;
  return true;
}

function sameImage(a: QuadImage | undefined, b: QuadImage | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.src === b.src && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h && a.repeat === b.repeat;
}

function sameLayer(a: QuadLayer, b: QuadLayer): boolean {
  return (
    a.opacity === b.opacity && samePaint(a.paint, b.paint) && sameImage(a.image, b.image) && samePoints(a.clip, b.clip)
  );
}

function sameLayers(a: readonly QuadLayer[], b: readonly QuadLayer[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) if (!sameLayer(a[i]!, b[i]!)) return false;
  return true;
}

function sameStroke(a: QuadStroke | undefined, b: QuadStroke | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.width === b.width &&
    a.opacity === b.opacity &&
    a.alignment === b.alignment &&
    a.cap === b.cap &&
    a.join === b.join &&
    a.miterLimit === b.miterLimit &&
    samePaint(a.color, b.color) &&
    sameDashes(a.dashes, b.dashes)
  );
}

/** The FACE of a caption — what a Pixi text style is built from, and all a restyle can be. */
function sameFace(a: QuadText, b: QuadText): boolean {
  return (
    a.font.family === b.font.family &&
    a.font.size === b.font.size &&
    a.font.weight === b.font.weight &&
    samePaint(a.fill, b.fill)
  );
}

function sameText(a: QuadText | undefined, b: QuadText | undefined): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (!sameFace(a, b) || a.lines.length !== b.lines.length) return false;
  for (let i = 0; i < a.lines.length; i += 1) {
    const p = a.lines[i]!;
    const q = b.lines[i]!;
    if (p.text !== q.text || p.x !== q.x || p.y !== q.y || p.ascent !== q.ascent) return false;
  }
  return true;
}

/** A named effect and its knobs. The same pair means the same shader, so it is not rebuilt. */
function sameRef(a: FilterRef | OverlayRef | undefined, b: FilterRef | OverlayRef | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.name !== b.name) return false;
  const keys = Object.keys(a.params);
  if (keys.length !== Object.keys(b.params).length) return false;
  for (const key of keys) if (a.params[key] !== b.params[key]) return false;
  return true;
}

/**
 * Is this quad DRAWN the same as the one before it — everything but where it stands?
 *
 * The matrix is deliberately not here: a pose that moved is the cheap case, one number set on a
 * container the GPU already knows how to place. `z` and `layer` are not here either — the order
 * of the frame is the plan's answer, and this only decides whether the pixels have to be made
 * again.
 */
function sameDraw(a: Quad, b: Quad): boolean {
  return (
    a.w === b.w &&
    a.h === b.h &&
    samePoints(a.points, b.points) &&
    sameLayers(a.layers, b.layers) &&
    sameStroke(a.stroke, b.stroke) &&
    sameText(a.text, b.text) &&
    sameRef(a.filter, b.filter) &&
    sameRef(a.overlay, b.overlay)
  );
}

function sameMark(a: Mark | undefined, b: Mark): boolean {
  if (!a) return false;
  return a.closed === b.closed && a.width === b.width && samePaint(a.paint, b.paint) && samePoints(a.points, b.points);
}

/** Everything a box holds goes away WITH it — the options are the whole point of the call. */
const DESTROY_WHOLE = { children: true, context: true, style: true, texture: false, textureSource: false } as const;

/** The Pixi style one caption is drawn in. Built in one place, so a restyle cannot drift from it. */
function textFace(caption: QuadText, theme: ThemeName) {
  return {
    fontFamily: caption.font.family,
    fontSize: caption.font.size,
    fontWeight: String(caption.font.weight) as never,
    fill: paint(theme, caption.fill),
  };
}

export function pixiPainter(view: HTMLCanvasElement, options: PixiPainterOptions): Painter {
  const app = new Application();
  let alive = true;
  let started = false;
  let pending: { plan: readonly Quad[]; marks: readonly Mark[]; theme: ThemeName } | null = null;
  let lateRetain = false;
  let retaining = false;
  let lateSize: { width: number; height: number } | null = null;
  // The animated filters and overlays of the CURRENT frame, and one clock that drives them. A
  // filter belongs to a quad: it is clocked while that quad is in the plan asking for it by the
  // same name and numbers, and a censor that lifts stops being ticked with the frame that drops
  // it. The list is rebuilt only when that set actually moves.
  let time = 0;
  let activeTicks: Array<(seconds: number) => void> = [];
  let ticksMoved = true;

  // THE STANDING SCENE, BY QUAD ID. Everything in here survives the frame that built it and is
  // let go only by a plan that no longer names the quad, or by `destroy`.
  const quads = new Map<string, LiveQuad>();
  // The tooling layer's own objects, by POSITION: several marks come off one node, so an id is
  // not a key here, and the list is short and rebuilt wholesale by the inspector anyway.
  const markPool: Graphics[] = [];
  let markDrawn: readonly Mark[] = [];
  let markTheme: ThemeName | undefined;

  // PICTURES ARRIVE LATE, AND THE FRAME DOES NOT WAIT FOR THEM.
  //
  // A plan is computed from what the asset DECLARED, so the geometry is right before a single
  // byte has downloaded. The renderer draws what it has and redraws when the rest lands — the
  // alternative is a scene that shows nothing until the slowest picture arrives, which is how a
  // table full of cards ends up blank because one emblem 404s.
  const textures = new Map<string, Texture>();
  const asked = new Set<string>();

  function textureFor(src: string): Texture | undefined {
    const have = textures.get(src);
    if (have) return have;
    if (!asked.has(src)) {
      asked.add(src);
      void Assets.load(src)
        .then((loaded: Texture) => {
          if (!alive) return;
          textures.set(src, loaded);
          // `started` too: a texture from a warm cache can land before `init` resolves, and an
          // application that has not started has no stage to apply anything to. The re-apply
          // at the end of `init` picks the texture up from the map.
          if (started && pending) apply(pending.plan, pending.marks, pending.theme);
        })
        // A picture that never arrives is skipped, exactly as a dangling record is: one bad
        // reference must not take the scene down and hide every node that was fine.
        .catch(() => undefined);
    }
    return undefined;
  }

  // READING THE FACE BACK OFF THE GLASS IS EXPENSIVE, so it is remembered.
  //
  // An overlay needs to know what is under it, and the only way to know is to render the box small
  // and read the pixels — which stalls the pipeline waiting on the GPU. A censored node that is
  // also moving would pay that on every frame, and six of them would pay it six times. The key is
  // what the sample actually depends on: the node, its size, the grid, the palette and the layers
  // themselves, so a face that CHANGES (a card turning, a skin swapped) is sampled again and one
  // that merely moves is not.
  const samples = new Map<string, OverlaySample>();
  /** A bound past which the memory is worth more than the saving. Cleared whole, not evicted. */
  const SAMPLE_CAP = 128;

  /** Did anything at all come back? One opaque-enough pixel is enough to call the sample real. */
  function lit(pixels: ArrayLike<number>): boolean {
    for (let i = 3; i < pixels.length; i += 4) if ((pixels[i] ?? 0) > 0) return true;
    return false;
  }

  function overlaySource(quad: Quad, box: Container, theme: ThemeName): OverlaySource {
    return {
      width: quad.w,
      height: quad.h,
      sample(step) {
        const key = `${quad.id}|${quad.w}x${quad.h}|${step}|${theme}|${JSON.stringify(quad.layers)}`;
        const known = samples.get(key);
        if (known) return known;
        const cols = Math.max(1, Math.round(quad.w / step));
        const rows = Math.max(1, Math.round(quad.h / step));
        // SHRINKING IS THE AVERAGING, and it is done by the GPU: the node is drawn once into a
        // `cols × rows` texture, so every cell arrives already blended down to the one colour a
        // mote over that spot should be.
        //
        // The matrix maps the node's OWN space — where its contour is, around its origin — onto
        // that texture, and it is handed to `render` rather than left to the box, which means the
        // node's pose is deliberately NOT applied: a mote belongs to the node, and the pose is put
        // back on the whole cloud afterwards by the box it hangs in.
        const grid = RenderTexture.create({ width: cols, height: rows });
        app.renderer.render({
          container: box,
          target: grid,
          transform: new Matrix().scale(cols / quad.w, rows / quad.h).translate(cols / 2, rows / 2),
          clear: true,
          clearColor: [0, 0, 0, 0],
        });
        const shot = app.renderer.extract.pixels({ target: grid });
        grid.destroy(true);
        const taken: OverlaySample = { cols: shot.width, rows: shot.height, pixels: shot.pixels };
        // A BLANK SAMPLE IS NOT REMEMBERED. Layers are data and do not change when the picture in
        // them finally downloads, so the key cannot tell the two apart — and a face sampled before
        // its texture landed would be an empty cloud kept for the life of the painter. Nothing
        // there is read as "not yet", and the next frame asks again.
        if (lit(shot.pixels)) {
          if (samples.size >= SAMPLE_CAP) samples.clear();
          samples.set(key, taken);
        }
        return taken;
      },
    };
  }

  const ready = app
    .init({
      canvas: view,
      width: options.width,
      height: options.height,
      resolution: options.resolution,
      autoDensity: false,
      antialias: true,
      // Keep the drawing buffer after compositing. Without it a WebGL canvas reads back BLANK
      // to the SECOND thing that captures it within one frame — a screenshot, a print, a share
      // sheet. The browser tests capture two regions of one frame to prove a square is on the
      // glass, and without this the second region came back empty every time.
      preserveDrawingBuffer: true,
      // The stage colour belongs to the page behind the canvas, not to the renderer: the
      // catalog paints its own dotted grid there and a filled background would hide it.
      backgroundAlpha: 0,
    })
    .then(() => {
      started = true;
      // A painter destroyed while still initialising must not come to life afterwards.
      if (!alive) {
        app.destroy(true);
        return;
      }
      // A resize that arrived while the renderer was still starting could not be applied then;
      // dropped instead of queued, it left the canvas at the size it was MEASURED at — which on
      // a page still laying itself out is one pixel, presented as an empty scene.
      if (lateSize) app.renderer.resize(lateSize.width, lateSize.height);
      app.renderer.background.clearBeforeRender = !lateRetain;
      // NOTHING PAINTS ON ITS OWN, and that is the second half of the frame.
      //
      // A Pixi application renders from its own ticker, which is a different animation frame
      // from the one that built the stage — so the glass showed the plan of the frame BEFORE
      // it, always, and every drag in the kit was one frame late for that reason alone. The
      // automatic render comes off the ticker and moves to the end of `apply`, where the stage
      // has just been built and the pixels can go out in the same frame.
      //
      // What is left on the ticker is the CLOCK: an animated filter or a censor's dust moves
      // pixels with no new plan behind it, so when it ticks it also asks for the glass.
      app.ticker.remove(app.render, app);
      // ONE CLOCK for every animated filter in the frame. It advances a seconds counter and hands
      // it to each live filter's own `tick`; a frame with no filters ticks nothing. The renderer
      // stays dumb — it does not know what a censor is, only that a filter asked to be clocked.
      app.ticker.add((ticker) => {
        if (!activeTicks.length) return;
        time += ticker.deltaMS / 1000;
        for (const tick of activeTicks) tick(time);
        // ...but NOT while the glass is a trail. A retained frame is painted over what is
        // already there, and a second pass would lay the flying quads down twice and double
        // their ink. Such a frame is redrawn every frame anyway, and that draw carries the
        // clock's new pixels with it.
        if (!retaining) app.render();
      });
      if (pending) apply(pending.plan, pending.marks, pending.theme);
    });

  /**
   * Every picture this quad names, still the one that was DRAWN?
   *
   * A plan is computed from what the asset DECLARED, so a layer reads exactly the same on the
   * frame before its picture downloaded and on the frame after — the data did not move, the
   * texture did. Without this the redraw that a landing texture triggers would find nothing
   * changed and skip the very layer it was fired for.
   */
  function picturesLanded(live: LiveQuad, quad: Quad): boolean {
    for (let i = 0; i < quad.layers.length; i += 1) {
      const image = quad.layers[i]?.image;
      if (!image) continue;
      if (live.layers[i]?.texture !== textureFor(image.src)) return false;
    }
    return true;
  }

  /**
   * Draw one quad's contents into its standing box, keeping every object the new quad still
   * wants and letting go of the ones it does not.
   *
   * `before` is the quad the box currently holds, or `undefined` for a box being filled for the
   * first time. Reached only when something actually changed, so the per-part tests below are
   * paid on changed frames alone — and each of them answers "may this ONE object stand as it
   * is", which is what keeps a scene where a single card turns from redrawing the whole table.
   */
  function drawQuad(live: LiveQuad, before: Quad | undefined, quad: Quad, theme: ThemeName): void {
    const box = live.box;
    const repainted = before === undefined || live.theme !== theme;
    const contourMoved = repainted || !samePoints(before.points, quad.points);

    // Everything the box holds now, so that whatever the new quad does not take is destroyed
    // rather than quietly dropped on the floor — which is the leak this rewrite came for.
    const stale = new Set<Container>();
    // Set below by any layer whose picture is not the one it was drawn with — the face changed
    // even though not one number in the plan did, and the cloud over it has to know.
    let pictureLanded = false;
    for (const old of live.layers) {
      for (const part of [old.mask, old.fill, old.tile, old.clip, old.image]) if (part) stale.add(part);
    }
    if (live.stroke) stale.add(live.stroke);
    for (const glyphs of live.texts) stale.add(glyphs);

    // Re-ordered from scratch, because a layer that gained a clip puts one more object in front
    // of itself. Removing is pointer work: nothing here is destroyed, and what is kept is kept.
    box.removeChildren();
    const ordered: Container[] = [];
    const layers: LiveLayer[] = [];

    for (let i = 0; i < quad.layers.length; i += 1) {
      const layer = quad.layers[i]!;
      const was = live.layers[i];
      const older = before?.layers[i];
      // May this layer's objects stand exactly as they are? Only if the ink, the contour and
      // the palette are all where they were.
      const settled = !contourMoved && older !== undefined && sameLayer(older, layer);
      const now: LiveLayer = {};
      if (layer.paint) {
        // A partial layer arrives with its clip ALREADY as points — the plan did the geometry,
        // this only masks with it, the same obedience as the contour itself.
        if (layer.clip) {
          const mask = was?.mask ?? new Graphics();
          if (!settled || !was?.mask) {
            mask.clear();
            trace(mask, layer.clip, true);
            mask.fill({ color: paint(theme, "text") });
          }
          now.mask = mask;
          ordered.push(mask);
        }
        // ONE OBJECT PER LAYER, added in the plan's order.
        //
        // Not one Graphics with every fill poured into it: a picture that does not cover the
        // whole area has to be clipped to the contour, and a clip belongs to the thing it clips.
        // Order is the plan's answer and this only obeys it.
        const g = was?.fill ?? new Graphics();
        if (!settled || !was?.fill) {
          g.clear();
          trace(g, quad.points, true);
          g.fill({ color: paint(theme, layer.paint), alpha: layer.opacity });
        }
        g.mask = now.mask ?? null;
        now.fill = g;
        ordered.push(g);
      }

      const image = layer.image;
      // A picture that has not arrived is simply not drawn yet; the redraw comes with it.
      // A picture that never arrives is skipped for good, exactly as a dangling record is.
      const texture = image ? textureFor(image.src) : undefined;
      now.texture = texture;
      if (image && texture) {
        const sameTexture = was?.texture === texture;
        if (!sameTexture) pictureLanded = true;
        if (image.repeat) {
          // Tiled: the contour itself is the fill, and the texture wraps. `w`/`h` is ONE tile.
          //
          // `textureSpace: "global"` IS THE WHOLE OF IT, and it has to be written out because the
          // renderer's default is the other one. In `local` space the texture is mapped onto the
          // SHAPE'S BOUNDS — the tile then grows with the area it covers, which is the one thing a
          // pattern must never do: on a table sized past any viewport it came out as a single
          // picture smeared over the whole desk. In global space the matrix below is read in the
          // fill's own pixels, so a tile is the size the asset declared and the area is free to be
          // any size at all. See `e2e.a-tiled-ground-keeps-its-tile`.
          const g = was?.tile ?? new Graphics();
          if (!settled || !sameTexture || !was?.tile) {
            texture.source.addressMode = "repeat";
            g.clear();
            trace(g, quad.points, true);
            g.fill({
              texture,
              alpha: layer.opacity,
              matrix: tileMatrix(texture, image),
              textureSpace: "global",
            });
          }
          g.mask = null;
          now.tile = g;
          ordered.push(g);
        } else {
          // Placed once. The rect is where the plan put it — which may be smaller than the area
          // (`contain` leaves bars) or larger (`cover` overflows), so it is clipped to the
          // contour rather than stretched to it.
          //
          // NO MATRIX HERE. `textureSpace: "local"` already fits the texture to the path's own
          // bounds, and the path IS the picture's box — the plan sized it. Handing a matrix as
          // well applies the fit twice, and the picture comes out enormous. (`repeat` above is the
          // opposite case: the path is the whole contour, so the tile size has to come from a
          // matrix in world space.)
          const clip = was?.clip ?? new Graphics();
          if (!settled || !was?.clip) {
            clip.clear();
            trace(clip, quad.points, true);
            clip.fill({ color: paint(theme, "text") });
          }
          const g = was?.image ?? new Graphics();
          if (!settled || !sameTexture || !was?.image) {
            g.clear();
            g.rect(image.x - image.w / 2, image.y - image.h / 2, image.w, image.h);
            g.fill({ texture, alpha: layer.opacity, textureSpace: "local" });
          }
          now.clip = clip;
          now.image = g;
          ordered.push(clip);
          g.mask = clip;
          ordered.push(g);
        }
      }
      layers.push(now);
    }
    live.layers = layers;

    const stroke = quad.stroke;
    if (stroke) {
      const g = live.stroke ?? new Graphics();
      const settled = !contourMoved && live.stroke !== undefined && sameStroke(before?.stroke, stroke);
      if (!settled) {
        g.clear();
        const style = {
          width: stroke.width,
          color: paint(theme, stroke.color),
          alpha: stroke.opacity,
          // CENTRED ON A DASH, because a dash already sits where it belongs.
          //
          // Pixi reads `alignment` off the SIGN OF A PATH'S AREA, and a dash is a scrap of a
          // path — two points along a side, three or four across a corner. It answered one way
          // for the straight scraps and the other way for the corner ones, so a dashed border
          // stepped a full stroke width sideways at every rounded corner. The plan moves the
          // whole contour instead, while its inside is still known, and hands down points that
          // want nothing but to be stroked down the middle.
          alignment: stroke.dashes ? 0.5 : stroke.alignment,
          cap: stroke.cap,
          join: stroke.join,
          miterLimit: stroke.miterLimit,
        };
        if (stroke.dashes) {
          // Dashes arrive as geometry, already cut and already fitted to the corners. Drawing
          // them as a textured line — the usual GPU shortcut — loses the joins and caps and
          // makes the dash length drift with the angle of the side it runs along.
          for (const dash of stroke.dashes) trace(g, dash, false);
        } else {
          trace(g, quad.points, true);
        }
        g.stroke(style);
      }
      live.stroke = g;
      ordered.push(g);
    } else {
      live.stroke = undefined;
    }

    // THE CAPTION, when the node had one. Every decision was already taken upstairs: which lines
    // there are, where each pen starts, and where the baseline sits — `textLayout` did the
    // wrapping against a ruler a test could choose. This only draws strings at points.
    //
    // A renderer draws a string from the TOP of its box, so the baseline is reached by
    // subtracting the line's own ascent — which rides on the line, measured by the same ruler
    // that did the wrapping. Guessing it here instead would put the painter and the layout on
    // two different answers, and the drift would show on the first face with tall capitals.
    //
    // THE EXPENSIVE OBJECT IN THE FILE, and the reason a moving caption used to cost a frame: a
    // `new Text` rasterises a glyph atlas. So the object stands, and a frame that only moved the
    // card sets two numbers on it; the atlas is remade only when the STRING or the FACE changes.
    const texts: Text[] = [];
    const caption = quad.text;
    if (caption) {
      const faceHeld = !repainted && before?.text !== undefined && sameFace(before.text, caption);
      for (let i = 0; i < caption.lines.length; i += 1) {
        const line = caption.lines[i]!;
        const had = live.texts[i];
        const glyphs = had ?? new Text({ text: line.text, style: textFace(caption, theme) });
        if (had) {
          if (had.text !== line.text) had.text = line.text;
          if (!faceHeld) had.style = textFace(caption, theme);
        }
        glyphs.x = line.x;
        glyphs.y = line.y - line.ascent;
        texts.push(glyphs);
        ordered.push(glyphs);
      }
    }
    live.texts = texts;

    for (const child of ordered) {
      stale.delete(child);
      box.addChild(child);
    }
    for (const gone of stale) gone.destroy(DESTROY_WHOLE);

    // THE OVERLAY, when the coat named one — BEFORE the filter, and while the box is still only
    // the face. Both matter: the overlay reads the face off the box, and the whole point of the
    // censor is that its motes carry the colours of what they are hiding.
    //
    // A quad with no extent is skipped: a node measured before layout reports zero, and a grid
    // step divided into zero is not a sample, it is a division.
    //
    // A cloud belongs to the face it was ground from, so it is rebuilt when that face moves and
    // kept when only the pose did — the same law the sample cache is keyed on.
    //
    // A PICTURE THAT LANDED COUNTS AS THE FACE MOVING, and it is the case the plan cannot see:
    // a layer naming a picture reads exactly the same before the download and after it, so
    // nothing in the data changes when the ace finally arrives. The cloud sampled off the blank
    // face has no lit cells at all, and a censor that is never re-ground stays an empty cloud
    // over a card it was supposed to be made of. `presets-coats--censor` is that scene.
    const wantsCloud = quad.overlay !== undefined && quad.w > 0 && quad.h > 0;
    const faceMoved =
      repainted ||
      contourMoved ||
      pictureLanded ||
      before === undefined ||
      before.w !== quad.w ||
      before.h !== quad.h ||
      !sameLayers(before.layers, quad.layers);
    if (!wantsCloud || faceMoved || !live.overlay || !sameRef(before?.overlay, quad.overlay)) {
      if (live.overlay) {
        live.overlay.view.destroy({ children: true });
        live.overlay = undefined;
        ticksMoved = true;
      }
      if (wantsCloud) {
        // Read while nothing of the coat is on the box yet: a filter left hanging here would be
        // sampled along with the face, and the motes would carry the censor's own blur.
        box.filters = [];
        const built = buildOverlay(quad.overlay!, overlaySource(quad, box, theme));
        if (built) {
          live.overlay = built;
          ticksMoved = true;
          // Drawn ONCE at the clock's current second before it is queued, or the first frame of
          // a censored node is a hole where the face used to be.
          if (built.tick) built.tick(time);
        }
      }
    }
    if (live.overlay) box.addChild(live.overlay.view);

    // THE FILTER, when the coat named one. Built here and hung on the box the coat covers; a name
    // nobody registered, or a shader that would not compile, is simply not hung — the coat's wash
    // still masks the surface, so the scene dims rather than dropping.
    //
    // It outlives the frame that built it: the same name with the same numbers is the same
    // shader, and rebuilding it every frame threw away a compiled program and, with it, the
    // phase of every animation riding on the shared clock.
    if (!quad.filter) {
      if (live.filter) {
        live.filter.filter.destroy();
        live.filter = undefined;
        ticksMoved = true;
      }
    } else if (!live.filter || !sameRef(before?.filter, quad.filter)) {
      if (live.filter) live.filter.filter.destroy();
      live.filter = buildFilter(quad.filter);
      ticksMoved = true;
    }
    box.filters = live.filter ? [live.filter.filter] : [];
  }

  /** A quad the plan no longer names: its objects, its cloud, its shader — all of it, at once. */
  function dropQuad(live: LiveQuad): void {
    if (live.filter) {
      live.filter.filter.destroy();
      live.filter = undefined;
    }
    live.box.filters = [];
    live.box.destroy(DESTROY_WHOLE);
    ticksMoved = true;
  }

  function apply(plan: readonly Quad[], marks: readonly Mark[], theme: ThemeName): void {
    const seen = new Set<string>();
    for (let i = 0; i < plan.length; i += 1) {
      const quad = plan[i]!;
      // Ids are unique in a tree; the fallback is insurance rather than a case that happens. Two
      // quads sharing one key would take each other's objects away on every single frame.
      const key = seen.has(quad.id) ? `${quad.id} ${i}` : (quad.id as string);
      seen.add(key);
      let live = quads.get(key);
      if (!live) {
        live = { box: new Container(), drawn: quad, theme, matrix: UNSET_POSE, layers: [], texts: [] };
        quads.set(key, live);
        drawQuad(live, undefined, quad, theme);
        ticksMoved = true;
      } else if (live.theme !== theme || !sameDraw(live.drawn, quad) || !picturesLanded(live, quad)) {
        drawQuad(live, live.drawn, quad, theme);
      }
      live.drawn = quad;
      live.theme = theme;
      // THE MATRIX, when the plan left one. A baked plan hands down the identity and this is a
      // no-op; a live one hands down the node's pose and the GPU applies it — which is the
      // whole point of the hybrid, and the reason a turning card uploads no new geometry.
      const t = quad.transform;
      if (!sameMatrix(live.matrix, t)) {
        live.box.setFromMatrix(new Matrix(t.a, t.b, t.c, t.d, t.e, t.f));
        live.matrix = t;
      }
      // ORDER IS THE PLAN'S ANSWER and this only obeys it — and a frame whose order did not move
      // does not touch the stage at all.
      if (app.stage.children[i] !== live.box) app.stage.addChildAt(live.box, i);
    }
    for (const [key, live] of quads) {
      if (seen.has(key)) continue;
      dropQuad(live);
      quads.delete(key);
    }

    // Always last, so tooling is never hidden by the thing it is describing. Nothing here
    // branches on a shape: a mark arrives as points, and a circle is already a polygon.
    const repainted = markTheme !== theme;
    for (let i = 0; i < marks.length; i += 1) {
      const mark = marks[i]!;
      const had = markPool[i];
      const g = had ?? new Graphics();
      if (!had || repainted || !sameMark(markDrawn[i], mark)) {
        g.clear();
        trace(g, mark.points, mark.closed);
        // What to stroke with comes from the MARK. Hardcoded here, every debug layer would have
        // been drawn in the box outline's ink — a coordinate grid in the same colour as the thing
        // it exists to measure.
        g.stroke({ width: mark.width, color: paint(theme, mark.paint), alignment: 0.5 });
      }
      markPool[i] = g;
      const at = plan.length + i;
      if (app.stage.children[at] !== g) app.stage.addChildAt(g, at);
    }
    for (let i = marks.length; i < markPool.length; i += 1) markPool[i]!.destroy(DESTROY_WHOLE);
    markPool.length = marks.length;
    markDrawn = marks;
    markTheme = theme;

    if (ticksMoved) {
      ticksMoved = false;
      activeTicks = [];
      for (const live of quads.values()) {
        if (live.overlay?.tick) activeTicks.push(live.overlay.tick);
        if (live.filter?.tick) activeTicks.push(live.filter.tick);
      }
    }

    // ON THE GLASS IN THIS FRAME, not the next one. The stage is finished the instant this
    // returns, and the render is taken off the ticker precisely so that the picture leaves with
    // the plan that made it — see the ticker above.
    app.render();
  }

  return {
    ready,
    draw(plan, marks, theme, options) {
      if (!alive) return;
      // Remembered even once started: a texture that lands later has to be able to redraw the
      // frame it belongs to, and the last plan is what that frame was.
      pending = { plan, marks, theme };
      // RETAIN: the glass keeps the last picture and this frame is painted over it. The stage
      // holds the (flying-only) plan as always; what changes is that the renderer stops clearing
      // between frames — the drawing buffer is preserved anyway (`preserveDrawingBuffer`), so
      // what was there stays. Off again, the next frame clears and repaints in full.
      const retain = options?.retain === true;
      retaining = retain;
      if (started) app.renderer.background.clearBeforeRender = !retain;
      else lateRetain = retain;
      if (started) apply(plan, marks, theme);
    },
    resize(width, height) {
      if (!alive) return;
      if (started) app.renderer.resize(width, height);
      else lateSize = { width, height };
    },
    destroy() {
      alive = false;
      // The shaders are the one thing the application's own teardown does not reach: a filter
      // hangs on a box as an effect, not as a child, so it outlives the stage unless it is
      // named here. The boxes themselves go with `app.destroy(true)`.
      for (const live of quads.values()) live.filter?.filter.destroy();
      quads.clear();
      markPool.length = 0;
      activeTicks = [];
      if (started) app.destroy(true);
    },
  };
}
