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
  Text,
  Texture,
  UniformGroup,
} from "pixi.js";
import { type ThemeName } from "../core/viewer.js";
import { type FilterRef } from "./effects.js";
import { type Painter } from "./painter.js";
import { type Mark, type Quad } from "./scenePlan.js";
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

// CENSOR'S `blur` — Pixi's own filter, animated. A shimmering mask over a hidden surface: the
// strength sets the base blur and the clock pulses it, so a censored card reads as actively
// scrambled rather than statically greyed. A core filter on purpose — a hand-written shader is the
// one thing in here nothing could hold down, so the stock recipe leans on what Pixi ships.
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

export function pixiPainter(view: HTMLCanvasElement, options: PixiPainterOptions): Painter {
  const app = new Application();
  let alive = true;
  let started = false;
  let pending: { plan: readonly Quad[]; marks: readonly Mark[]; theme: ThemeName } | null = null;
  let lateRetain = false;
  let lateSize: { width: number; height: number } | null = null;
  // The animated filters of the CURRENT frame, and one clock that drives them. Rebuilt every
  // `apply`, because a filter belongs to a quad and the plan is the quads — a censor that lifts
  // stops being ticked the moment the plan without it is drawn.
  let time = 0;
  let activeTicks: Array<(seconds: number) => void> = [];

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
      // ONE CLOCK for every animated filter in the frame. It advances a seconds counter and hands
      // it to each live filter's own `tick`; a frame with no filters ticks nothing. The renderer
      // stays dumb — it does not know what a censor is, only that a filter asked to be clocked.
      app.ticker.add((ticker) => {
        if (!activeTicks.length) return;
        time += ticker.deltaMS / 1000;
        for (const tick of activeTicks) tick(time);
      });
      if (pending) apply(pending.plan, pending.marks, pending.theme);
    });

  function apply(plan: readonly Quad[], marks: readonly Mark[], theme: ThemeName): void {
    app.stage.removeChildren().forEach((child) => child.destroy());
    // The animated filters of the LAST frame are gone with its quads; this frame builds its own.
    activeTicks = [];
    for (const quad of plan) {
      // ONE OBJECT PER LAYER, added in the plan's order.
      //
      // Not one Graphics with every fill poured into it: a picture that does not cover the whole
      // area has to be clipped to the contour, and a clip belongs to the thing it clips. Order
      // is the plan's answer and this only obeys it.
      const box = new Container();
      // THE MATRIX, when the plan left one. A baked plan hands down the identity and this is a
      // no-op; a live one hands down the node's pose and the GPU applies it — which is the
      // whole point of the hybrid, and the reason a turning card uploads no new geometry.
      const t = quad.transform;
      box.setFromMatrix(new Matrix(t.a, t.b, t.c, t.d, t.e, t.f));
      for (const layer of quad.layers) {
        if (layer.paint) {
          const g = new Graphics();
          trace(g, quad.points, true);
          g.fill({ color: paint(theme, layer.paint), alpha: layer.opacity });
          // A partial layer arrives with its clip ALREADY as points — the plan did the geometry,
          // this only masks with it, the same obedience as the contour itself.
          if (layer.clip) {
            const mask = new Graphics();
            trace(mask, layer.clip, true);
            mask.fill({ color: paint(theme, "text") });
            box.addChild(mask);
            g.mask = mask;
          }
          box.addChild(g);
        }
        const image = layer.image;
        if (!image) continue;
        const texture = textureFor(image.src);
        // A picture that has not arrived is simply not drawn yet; the redraw comes with it.
        // A picture that never arrives is skipped for good, exactly as a dangling record is.
        if (!texture) continue;

        const g = new Graphics();
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
          texture.source.addressMode = "repeat";
          trace(g, quad.points, true);
          g.fill({
            texture,
            alpha: layer.opacity,
            matrix: tileMatrix(texture, image),
            textureSpace: "global",
          });
          box.addChild(g);
          continue;
        }
        // Placed once. The rect is where the plan put it — which may be smaller than the area
        // (`contain` leaves bars) or larger (`cover` overflows), so it is clipped to the
        // contour rather than stretched to it.
        //
        // NO MATRIX HERE. `textureSpace: "local"` already fits the texture to the path's own
        // bounds, and the path IS the picture's box — the plan sized it. Handing a matrix as
        // well applies the fit twice, and the picture comes out enormous. (`repeat` above is the
        // opposite case: the path is the whole contour, so the tile size has to come from a
        // matrix in world space.)
        g.rect(image.x - image.w / 2, image.y - image.h / 2, image.w, image.h);
        g.fill({ texture, alpha: layer.opacity, textureSpace: "local" });
        const clip = new Graphics();
        trace(clip, quad.points, true);
        clip.fill({ color: paint(theme, "text") });
        box.addChild(clip);
        g.mask = clip;
        box.addChild(g);
      }

      const stroke = quad.stroke;
      if (stroke) {
        const g = new Graphics();
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
        box.addChild(g);
      }

      // THE CAPTION, when the node had one. Every decision was already taken upstairs: which lines
      // there are, where each pen starts, and where the baseline sits — `textLayout` did the
      // wrapping against a ruler a test could choose. This only draws strings at points.
      //
      // A renderer draws a string from the TOP of its box, so the baseline is reached by
      // subtracting the line's own ascent — which rides on the line, measured by the same ruler
      // that did the wrapping. Guessing it here instead would put the painter and the layout on
      // two different answers, and the drift would show on the first face with tall capitals.
      if (quad.text) {
        for (const line of quad.text.lines) {
          const glyphs = new Text({
            text: line.text,
            style: {
              fontFamily: quad.text.font.family,
              fontSize: quad.text.font.size,
              fontWeight: String(quad.text.font.weight) as never,
              fill: paint(theme, quad.text.fill),
            },
          });
          glyphs.x = line.x;
          glyphs.y = line.y - line.ascent;
          box.addChild(glyphs);
        }
      }

      // THE FILTER, when the coat named one. Built here and hung on the box the coat covers; a name
      // nobody registered, or a shader that would not compile, is simply not hung — the coat's wash
      // still masks the surface, so the scene dims rather than dropping. A live one adds its clock
      // to the frame's ticks.
      if (quad.filter) {
        const live = buildFilter(quad.filter);
        if (live) {
          box.filters = [live.filter];
          if (live.tick) activeTicks.push(live.tick);
        }
      }
      app.stage.addChild(box);
    }

    // Always last, so tooling is never hidden by the thing it is describing. Nothing here
    // branches on a shape: a mark arrives as points, and a circle is already a polygon.
    for (const mark of marks) {
      const g = new Graphics();
      trace(g, mark.points, mark.closed);
      // What to stroke with comes from the MARK. Hardcoded here, every debug layer would have
      // been drawn in the box outline's ink — a coordinate grid in the same colour as the thing
      // it exists to measure.
      g.stroke({ width: mark.width, color: paint(theme, mark.paint), alignment: 0.5 });
      app.stage.addChild(g);
    }
  }

  return {
    ready,
    draw(plan, marks, theme, options) {
      if (!alive) return;
      // Remembered even once started: a texture that lands later has to be able to redraw the
      // frame it belongs to, and the last plan is what that frame was.
      pending = { plan, marks, theme };
      // RETAIN: the glass keeps the last picture and this frame is painted over it. The stage is
      // rebuilt from the (flying-only) plan as always; what changes is that the renderer stops
      // clearing between frames — the drawing buffer is preserved anyway (`preserveDrawingBuffer`),
      // so what was there stays. Off again, the next frame clears and repaints in full.
      const retain = options?.retain === true;
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
      if (started) app.destroy(true);
    },
  };
}
