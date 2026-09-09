// THE RENDERER'S DOOR. Everything under `render/pixi/` is the one place allowed to know Pixi
// exists, and this file is the only way in — guarded by `host.single-pixi-import` (nothing outside
// the folder imports `pixi.js`) and `guard.pixi-one-door` (nothing outside the folder reaches past
// this index). The rule is worth the guards: the day the renderer is swapped, exactly one FOLDER is
// rewritten and the model does not notice.
//
// It was one 1200-line file. The seams it is cut along are the ones that were already there — a
// filter registry, an overlay registry, the frame-to-frame comparisons, the drawing primitives —
// and cutting on them is what makes each one readable on its own. What did NOT change is the law
// underneath: anything computed in this folder is untestable by construction, because jsdom has no
// WebGL. Keep every one of these files dumb.

import {
  Application,
  Assets,
  Color,
  Container,
  FillGradient,
  Graphics,
  Matrix,
  RenderTexture,
  Text,
  Texture,
} from "pixi.js";
import { type Point } from "../../core/atoms/bounded.js";
import { type Transform } from "../../core/transform.js";
import { type ThemeName } from "../../core/viewer.js";
import { DUST_LEVERS } from "../dust.js";
import { type FilterRef, type OverlayRef } from "../effects.js";
import { type Painter } from "../painter.js";
import { type Mark, type Quad, type QuadText } from "../scenePlan/index.js";
import { paint } from "../theme.js";
import { buildFilter, type LiveFilter } from "./filters.js";
import { boxMatrix, tileMatrix, trace } from "./geometry.js";
import { DESTROY_WHOLE, textFace, UNSET_POSE, type LiveLayer, type LiveQuad } from "./live.js";
import { buildOverlay, type LiveOverlay, type OverlaySample, type OverlaySource } from "./overlays.js";
import {
  sameDraw,
  sameFace,
  sameLayer,
  sameLayers,
  sameMark,
  sameMatrix,
  samePoints,
  sameRef,
  sameStroke,
  sameText,
} from "./same.js";

export { type Painter };
export { registerFilter } from "./filters.js";
export { registerOverlay, type OverlaySample, type OverlaySource } from "./overlays.js";

export interface PixiPainterOptions {
  readonly width: number;
  readonly height: number;
  readonly resolution: number;
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
      if (layer.paint || layer.gradient) {
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
          // `textureSpace: "global"` for the same reason the tiled ground needs it: the axis the
          // plan resolved is in the SHAPE's own pixels, and the renderer's default would stretch it
          // over the bounding box instead — a 45-degree wash would then read as a vertical one on
          // anything that is not square.
          const wash = layer.gradient
            ? new FillGradient({
                type: "linear",
                textureSpace: "global",
                start: layer.gradient.from,
                end: layer.gradient.to,
                // A STOP'S OWN SOLIDITY rides on its colour: the palette's shade, its own alpha (a
                // stop written with none is a stop at nothing) times the stop's — never in place of it.
                colorStops: layer.gradient.stops.map((s) => {
                  const shade = new Color(paint(theme, s.paint));
                  return { offset: s.at, color: shade.setAlpha(shade.alpha * (s.opacity ?? 1)) };
                }),
              })
            : undefined;
          g.fill(wash ? { fill: wash, alpha: layer.opacity } : { color: paint(theme, layer.paint ?? "text"), alpha: layer.opacity });
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
      const key = seen.has(quad.id) ? `${quad.id}\0${i}` : (quad.id as string);
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
    // ASKED FOR EARLY, THROUGH THE VERY SAME DOOR A PLAN ASKS THROUGH (`textureFor`) — so a
    // picture warmed here and a picture drawn later are one load and one cache entry, and the
    // frame that finally names it finds it already standing.
    warm(sources) {
      if (!alive) return;
      for (const src of sources) textureFor(src);
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
