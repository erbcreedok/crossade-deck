// The shared shell for a catalog scene: a toolbar of THIS canvas's own settings, the view
// under it, and nothing drawn on top of either.
//
// The tree used to sit beside the stage in the same box. On a phone that left a strip of
// desk and a column of text — so the scene now only REPORTS what it holds, and the catalog
// draws it where there is room: the panel next to Controls in story mode, a block under the
// canvas on a docs page.
//
// The hud etalon, by contrast, came the other way: it used to live in the catalog's toolbar,
// which cannot be right on a page holding several canvases. It is a setting OF a canvas, so
// it stands on the canvas it belongs to.
//
// Viewer settings arrive as ONE object from the catalog and cascade through the host into the
// resolve context. A scene wires them once here, not toggle by toggle — otherwise the sixth
// switch would be wired in a sixth different way. The words ride ALONGSIDE that object, not
// inside it: the kit knows no language, so the captions stop here, in the catalog's own shell.

import {
  attachPainter,
  inspect,
  installStockHeads,
  installStockLayouts,
  installStockSurfaces,
  installTheme,
  mount,
  s,
  scenePlan,
  t,
  type Host,
  type Node,
  type Painter,
  type Mark,
  type Quad,
  type ThemeName,
  type ViewerSettings,
} from "../../src/index.js";
// The renderer comes through its OWN door, and that is what keeps `pixi.js` out of every
// module that merely touches a scene type. Loaded lazily for the same reason: a shell built
// in a headless test never reaches for a canvas context it cannot have.
import { currentSettings, onSettingsChange, type CatalogSettings } from "./catalogSettings.js";
import { hudUnitPatch, type HudUnitChoice } from "./hudUnitChoices.js";
import { clearInspect, publishInspect, takeSceneId } from "./inspectorBus.js";
import { sceneToolbar } from "./sceneToolbar.js";

export interface Scene {
  readonly el: HTMLElement;
  readonly host: Host;
  /** Who this scene publishes as — the catalog matches a tree block to it by this. */
  readonly id: string;
  /**
   * Settled when the FIRST frame is genuinely on the glass, rejected if the renderer dies on
   * the way up. An event, not a timeout: on a dev server the renderer arrives through a
   * dynamic import that a cold cache can hold up for a minute, and any deadline a check
   * could pick is either too short for that or long enough to hang a real failure on.
   */
  readonly ready: Promise<void>;
  /** Re-apply theme, language and the rest without rebuilding the scene. */
  setSettings(next: CatalogSettings): void;
  /** Show a different tree in the same view — see `scene()` on why this is not a rebuild. */
  setRoot(next: Node): void;
  /** Stop following the catalog and tear the view down. */
  dispose(): void;
}

export interface PainterSize {
  readonly width: number;
  readonly height: number;
  readonly resolution: number;
}

/**
 * How a scene gets its renderer. Injectable for ONE reason: jsdom has no WebGL, so a unit test
 * of the shell cannot let a real GPU painter be built. It is not a feature — it is the seam
 * that keeps the shell testable at all.
 */
export type MakePainter = (view: HTMLCanvasElement, size: PainterSize) => Painter;

/**
 * The scene currently standing for each story id.
 *
 * Storybook calls a story again on every argument change and expects an element back; it never
 * tells the previous one to go away. This map is what makes the second call a FEED rather than
 * a build — see `scene()` — so one story owns one host, one painter and one WebGL context for
 * as long as it is open. A browser gives out about a dozen contexts before it starts taking
 * them back, and a range control would have spent them in a single drag.
 *
 * Keyed by id rather than counted, because that is exactly the identity that repeats: the
 * catalog names a scene after its story, so a re-render collides with itself and nothing else.
 */
const LIVE = new Map<string, Scene>();

export interface SceneOptions {
  /**
   * Start with the debug outline switched on.
   *
   * It stays a VIEWER setting — the toolbar still owns it and the reader can turn it off. What
   * this changes is where the switch STARTS, and one section genuinely needs that: `Bounded`
   * paints nothing at all, so its scenes open on an empty stage and the reader has to be told
   * to press a button before the page shows anything. A section about the invisible is the one
   * place where "invisible by default" teaches nothing.
   */
  readonly bounds?: boolean;
  /**
   * Override who gets their matrix folded into their geometry.
   *
   * Absent means the kit's own default — ask each node, which is what a consumer gets without
   * writing anything. A scene knob rather than a viewer setting: it changes nothing an onlooker
   * sees, only WHO does the arithmetic, and `Engine/Baking nodes` uses it to put the
   * override and the default in one picture.
   */
  readonly bake?: (node: Node) => boolean;
}

export function scene(
  root: Node,
  options: SceneOptions = {},
  settings: CatalogSettings = currentSettings(),
  makePainter: MakePainter = lazyPixiPainter,
): Scene {
  installTheme(document, settings.viewer.theme);
  // Names the model refers to but does not own: the stock layouts and surfaces. Installed
  // here rather than on import, so nothing depends on module order.
  installStockLayouts();
  installStockSurfaces();
  installStockHeads();
  const id = takeSceneId();

  // AN ARGUMENT CHANGE IS NEW DATA, NOT A NEW SCENE.
  //
  // Storybook calls the story again for every argument change and expects an element back. Take
  // that literally and each keystroke builds another host, another painter and another WebGL
  // context — and, less obviously, another toolbar: the etalon and the bounds layer are locals
  // of this function, so they went back to their defaults every time an unrelated control moved.
  //
  // They are the viewer plane, and the viewer is not what changed. So the scene for a story is
  // built once and afterwards only fed: the same element goes back, with a different tree in it.
  // That is also the path real data takes — a move from the server, a save loaded — so the
  // catalog exercises it rather than a mechanism only Storybook would ever use.
  const standing = LIVE.get(id);
  if (standing) {
    standing.setRoot(root);
    standing.setSettings(settings);
    return standing;
  }

  const el = document.createElement("div");
  el.style.cssText = [
    "position:relative",
    "height:100%",
    "min-height:320px",
    `background:${t("stageBg")}`,
    `color:${t("text")}`,
  ].join(";");

  // THE STAGE IS THE WHOLE BLOCK, and the toolbar floats in its corner.
  //
  // The row used to be a grid track above the view, which took its height out of the picture:
  // the origin of a scene is the centre of the VIEW, so the square everything is measured from
  // sat half a toolbar below the middle of the block a reader is actually looking at. Off by
  // 15px at 900x640, and more on a phone, where the row is taller.
  //
  // Floating it is what the note at the other corner has always done. The scene keeps its
  // corners free by construction — content is laid out around the origin — so chrome in one
  // costs nothing, while a track costs every scene the same strip forever.
  const stage = document.createElement("div");
  stage.style.cssText = [
    "position:absolute",
    "inset:0",
    "overflow:hidden",
    `background-image:radial-gradient(${t("grid")} 1px,transparent 1px)`,
    "background-size:22px 22px",
  ].join(";");

  // The etalon is this canvas's own, so the choice lives here rather than in any global: two
  // scenes on one page hold two different values and neither speaks for the other.
  let hudChoice: HudUnitChoice = "auto";
  // Same reasoning as the etalon: a debug layer belongs to the canvas it is drawn over, and a
  // page may hold several. One switch above them all would claim to speak for every one.
  let boundsOn = options.bounds ?? false;
  // Off by default, always. Unlike the outline, a grid has no section whose lesson is invisible
  // without it — it is a ruler somebody reaches for, not a thing a page opens on.
  let gridOn = false;
  let fromCatalog = settings;

  const bar = sceneToolbar(
    document,
    () => ({ text: fromCatalog.text, hudUnit: hudChoice, bounds: boundsOn, grid: gridOn }),
    {
      onHudUnit(choice) {
        hudChoice = choice;
        pushViewer();
      },
      onBounds(on) {
        boundsOn = on;
        pushViewer();
      },
      onGrid(on) {
        gridOn = on;
        pushViewer();
      },
    },
  );
  el.appendChild(stage);
  el.appendChild(bar.el); // after the stage, so the row is not painted over by it

  const host = mount(stage, root, viewerFor(settings.viewer));
  const first = host.viewport();
  const painter = makePainter(host.view, { width: first.width, height: first.height, resolution: first.dpr });
  // Handed straight through, ABSENCE INCLUDED — and absence has to stay absence rather than
  // become `bake: undefined`: no `bake` means the kit's own default, and the catalog has no
  // business inventing a different one for the reader to learn instead.
  const stopPainting = attachPainter(host, painter, options.bake ? { bake: options.bake } : {});

  // A GPU renderer starts asynchronously and draws on the next frame, so "the scene is up" is
  // not observable from the outside without saying so. The flag is for the browser tests: the
  // alternative is waiting on a timeout, which is how a suite becomes flaky and then ignored.
  // TWO frames, not one: the first is the frame the draw was scheduled into, the second is
  // proof that it was actually presented. One frame was enough on an idle machine and not
  // enough on a busy one, which is the definition of a flaky signal.
  const firstFrame = painter.ready.then(
    () =>
      new Promise<void>((shown) => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            el.setAttribute("data-painted", "");
            shown();
          }),
        );
      }),
  );
  // The failure is LOUD in both places, because the silent version cost an evening. The
  // renderer arrives through a dynamic import, and on a dev server that import can hang or
  // fail — a stale dependency cache after an `npm install` did exactly that. Unhandled, the
  // scene was a blank canvas under a note that said everything was fine, and every layer above
  // reported "the scene never painted" about code that had no way to paint.
  firstFrame.catch((reason: unknown) => {
    note.textContent = `renderer failed to load: ${reason instanceof Error ? reason.message : String(reason)}`;
  });

  function pushViewer(): void {
    host.setViewer(viewerFor(fromCatalog.viewer));
  }

  /** The catalog's settings plus the two that belong to THIS canvas. */
  function viewerFor(base: ViewerSettings): ViewerSettings {
    return { ...withHudUnit(base, hudChoice), debugBounds: boundsOn, debugGrid: gridOn };
  }

  const note = document.createElement("div");
  note.style.cssText = [
    "position:absolute",
    "left:16px",
    "bottom:14px",
    `font-family:${s("font.mono")}`,
    `font-size:${s("font.size.m")}`,
    `line-height:${s("font.line.normal")}`,
    `color:${t("textFaint")}`,
    "max-width:44ch",
    "pointer-events:none",
  ].join(";");
  stage.appendChild(note);

  const refresh = (): void => {
    const v = host.viewport();
    const text = fromCatalog.text;
    // `host.root`, never the argument this shell was built with: the tree can be replaced under
    // a standing scene, and a note or a report reading the original would describe a scene that
    // is no longer on screen.
    const showing = host.root;
    // The "nothing is drawn" line is EARNED, not assumed: it belongs to a scene whose plan is
    // genuinely empty. Printing it under a painted square would teach the opposite of the
    // lesson it exists for.
    const empty =
      scenePlan({ root: showing, unit: host.unit(), width: v.width, height: v.height, viewer: host.viewer() })
        .length === 0;
    const measured = text.text("scene.viewport", { w: v.width, h: v.height, unit: host.unit() });
    note.textContent = empty ? `${measured} — ${text.text("scene.nothingDrawn")}` : measured;
    bar.refresh();
    publishInspect({ sceneId: id, nodes: inspect(showing) });
  };
  refresh();
  host.onChange(refresh);

  // A catalog change reaches a MOUNTED scene without rebuilding it — and never overrides the
  // etalon this canvas was set to by hand.
  const applySettings = (next: CatalogSettings): void => {
    fromCatalog = next;
    installTheme(document, next.viewer.theme);
    pushViewer(); // notifies listeners, so the note, the bar and the tree re-read it
  };
  const stopFollowing = onSettingsChange(applySettings);

  const built: Scene = {
    el,
    host,
    id,
    ready: firstFrame,
    setSettings: applySettings,
    setRoot(next) {
      host.setRoot(next);   // notifies, so the note, the toolbar and the tree all re-read it
    },
    dispose() {
      // Own resources go unconditionally; SHARED ones only while this scene still holds the
      // slot. A superseded scene that cleared the bus entry would silence the tree of the one
      // actually on screen — which is what happens if the two are torn down together.
      const stillOurs = LIVE.get(id) === built;
      if (stillOurs) {
        LIVE.delete(id);
        clearInspect(id);
      }
      stopFollowing();
      stopPainting();
      painter.destroy();
      host.unmount();
    },
  };
  LIVE.set(id, built);
  BY_ELEMENT.set(el, built);
  return built;
}

/**
 * The scene standing in an element — the seam a story's own checks reach it through.
 *
 * A story hands Storybook an ELEMENT and keeps nothing; a `play` function is handed that same
 * element and nothing else. Without a way back, a check can only look at the picture, and half
 * the claims worth making on this rung are about DRIVING the scene — feed it a tree without the
 * card, feed it one with the card back — and then looking.
 *
 * A WeakMap rather than a property on the node: nothing is added to the DOM that a reader could
 * find and mistake for part of the kit, and a discarded element takes its entry with it.
 */
const BY_ELEMENT = new WeakMap<HTMLElement, Scene>();

export function sceneOf(el: HTMLElement): Scene | undefined {
  return BY_ELEMENT.get(el);
}

/**
 * The stock painter, fetched only when a scene is actually built.
 *
 * `pixi.js` reaches for a canvas context the moment it is imported, so a static import would
 * drag WebGL into every module that merely mentions a scene — including the shell's own tests,
 * which then fail asynchronously and go green with rejections behind them.
 *
 * The wrapper is a real painter from the first instant: it records what it was asked to draw
 * and replays the LAST request when the renderer arrives. A scene that mounts and paints in
 * the same breath must not lose that first frame.
 */
function lazyPixiPainter(view: HTMLCanvasElement, size: PainterSize): Painter {
  let real: Painter | null = null;
  let pending: { plan: readonly Quad[]; marks: readonly Mark[]; theme: ThemeName } | null = null;
  let box = size;
  let dead = false;

  const ready = import("../../src/render/pixi.js").then(async ({ pixiPainter }) => {
    if (dead) return;
    real = pixiPainter(view, box);
    if (pending) real.draw(pending.plan, pending.marks, pending.theme);
    await real.ready;
  });

  return {
    ready,
    draw(plan, marks, theme) {
      pending = { plan, marks, theme };
      real?.draw(plan, marks, theme);
    },
    resize(width, height) {
      // Kept even while there is no renderer: it is built with a size, and a resize that
      // arrived first would otherwise be forgotten exactly once — on the very first frame.
      box = { ...box, width, height };
      real?.resize(width, height);
    },
    destroy() {
      dead = true;
      real?.destroy();
    },
  };
}

/** `auto` must REMOVE the override, not set it to a number that only looks like absence. */
function withHudUnit(base: ViewerSettings, choice: HudUnitChoice): ViewerSettings {
  const { hudUnit: _ignored, ...rest } = base;
  return { ...rest, ...hudUnitPatch(choice) };
}
