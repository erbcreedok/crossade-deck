// The shared shell for a catalog scene: a toolbar of THIS canvas's own settings, the view
// under it, and nothing drawn on top of either.
//
// The tree used to sit beside the stage in the same box. On a phone that left a strip of
// table and a column of text — so the scene now only REPORTS what it holds, and the catalog
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
  /** Re-apply theme, language and the rest without rebuilding the scene. */
  setSettings(next: CatalogSettings): void;
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
 * Storybook rebuilds a story on every argument change and hands the renderer a fresh element;
 * it does not tell the old one to go away. Without this, moving a slider would leave a live
 * host, a live painter and a WebGL context behind on every step — and a browser gives out
 * about a dozen contexts before it starts taking them back.
 *
 * Keyed by id rather than counted, because that is exactly the identity that repeats: the
 * catalog names a scene after its story, so a re-render collides with itself and nothing else.
 */
const LIVE = new Map<string, Scene>();

export function scene(
  root: Node,
  settings: CatalogSettings = currentSettings(),
  makePainter: MakePainter = lazyPixiPainter,
): Scene {
  installTheme(document, settings.viewer.theme);
  // Names the model refers to but does not own: the stock layouts and surfaces. Installed
  // here rather than on import, so nothing depends on module order.
  installStockLayouts();
  installStockSurfaces();
  const id = takeSceneId();
  LIVE.get(id)?.dispose();

  const el = document.createElement("div");
  el.style.cssText = [
    "display:grid",
    "grid-template-rows:auto 1fr",
    "height:100%",
    "min-height:320px",
    `background:${t("stageBg")}`,
    `color:${t("text")}`,
  ].join(";");

  const stage = document.createElement("div");
  stage.style.cssText = [
    "position:relative",
    "overflow:hidden",
    `background-image:radial-gradient(${t("grid")} 1px,transparent 1px)`,
    "background-size:22px 22px",
  ].join(";");

  // The etalon is this canvas's own, so the choice lives here rather than in any global: two
  // scenes on one page hold two different values and neither speaks for the other.
  let hudChoice: HudUnitChoice = "auto";
  // Same reasoning as the etalon: a debug layer belongs to the canvas it is drawn over, and a
  // page may hold several. One switch above them all would claim to speak for every one.
  let boundsOn = false;
  let fromCatalog = settings;

  const bar = sceneToolbar(
    document,
    () => ({ text: fromCatalog.text, hudUnit: hudChoice, bounds: boundsOn }),
    {
      onHudUnit(choice) {
        hudChoice = choice;
        pushViewer();
      },
      onBounds(on) {
        boundsOn = on;
        pushViewer();
      },
    },
  );
  el.appendChild(bar.el);
  el.appendChild(stage);

  const host = mount(stage, root, viewerFor(settings.viewer));
  const first = host.viewport();
  const painter = makePainter(host.view, { width: first.width, height: first.height, resolution: first.dpr });
  const stopPainting = attachPainter(host, painter);

  // A GPU renderer starts asynchronously and draws on the next frame, so "the scene is up" is
  // not observable from the outside without saying so. The flag is for the browser tests: the
  // alternative is waiting on a timeout, which is how a suite becomes flaky and then ignored.
  // TWO frames, not one: the first is the frame the draw was scheduled into, the second is
  // proof that it was actually presented. One frame was enough on an idle machine and not
  // enough on a busy one, which is the definition of a flaky signal.
  void painter.ready.then(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => el.setAttribute("data-painted", "")));
  });

  function pushViewer(): void {
    host.setViewer(viewerFor(fromCatalog.viewer));
  }

  /** The catalog's settings plus the two that belong to THIS canvas. */
  function viewerFor(base: ViewerSettings): ViewerSettings {
    return { ...withHudUnit(base, hudChoice), debugBounds: boundsOn };
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
    // The "nothing is drawn" line is EARNED, not assumed: it belongs to a scene whose plan is
    // genuinely empty. Printing it under a painted square would teach the opposite of the
    // lesson it exists for.
    const empty =
      scenePlan({ root, unit: host.unit(), width: v.width, height: v.height, viewer: host.viewer() }).length === 0;
    const measured = text.text("scene.viewport", { w: v.width, h: v.height, unit: host.unit() });
    note.textContent = empty ? `${measured} — ${text.text("scene.nothingDrawn")}` : measured;
    bar.refresh();
    publishInspect({ sceneId: id, nodes: inspect(root) });
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
    setSettings: applySettings,
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
  return built;
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
