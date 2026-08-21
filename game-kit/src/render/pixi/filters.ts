import { BlurFilter, defaultFilterVert, Filter, GlProgram, UniformGroup } from "pixi.js";
import { type FilterRef } from "../effects.js";

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
export interface LiveFilter {
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
export function buildFilter(ref: FilterRef): LiveFilter | undefined {
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
export function knob(params: Readonly<Record<string, number>>, name: string, fallback: number): number {
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
