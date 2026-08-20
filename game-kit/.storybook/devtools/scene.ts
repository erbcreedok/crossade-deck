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
  attachMotion,
  type TuningPatch,
  attachPainter,
  Camera,
  caps,
  domTextMeasure,
  facing,
  glassOf,
  inspect,
  installStockEasings,
  installStockHeads,
  installStockLayouts,
  installStockSurfaces,
  installTheme,
  mount,
  pick,
  s,
  scenePlan,
  setFacing,
  t,
  renderFrame,
  wireCamera,
  wireButtons,
  type CameraContent,
  type CameraControl,
  type CameraLimits,
  type Host,
  type Motions,
  type Node,
  type Painter,
  type Mark,
  type Meaning,
  type Point,
  type Quad,
  type ThemeName,
  type Transform,
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
  /**
   * The motion runtime of an `animate` scene — the same handle `attachMotion` gives a game. A
   * drag story speaks to the one clock through it (`grab`/`dragTo`/`release`); a still scene
   * has no clock, and the absence says so.
   */
  readonly motions?: Motions;
  /** The camera of a `camera` scene — the same object the story tuned, for a check to read. */
  readonly camera?: Camera;
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

/** What each live scene's press handler is RIGHT NOW — see `SceneOptions.press`. */
const PRESSED = new Map<string, ((meaning: Meaning, control: Node) => void) | undefined>();

/** The same for the tap handler — see `SceneOptions.tap`. */
const TAPPED = new Map<string, ((hit: Node | undefined) => void) | undefined>();

/** How each live scene takes new camera numbers — the same "feed, do not rebuild" rule. */
const CAMERAS = new Map<string, (next: CameraScene) => void>();

export interface SceneOptions {
  /**
   * WHICH SCREEN THIS IS, when a story has several — a board watched from two seats, four players
   * around one desk. Absent, the story owns one scene and this is the case every other page is.
   *
   * It exists because the identity a scene is kept alive by is its NAME: keyed, each screen finds
   * itself standing on the next render and is fed new data; unkeyed, the second screen would take a
   * fresh number every keystroke, and each number is another WebGL context the browser eventually
   * starts taking back.
   */
  readonly key?: string | undefined;
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
  /**
   * Wire every `Pressable` in the scene, and hear what was pressed.
   *
   * A control story that only DREW its controls would be teaching a picture: hover, sink and the
   * press itself are the whole of what a reader came to feel. The wiring is attached once, with the
   * scene, and a re-render only swaps the handler — the same reason a re-render is a feed and not a
   * build. Attaching it in a story body instead would stack a listener set per keystroke.
   */
  readonly press?: (meaning: Meaning, control: Node) => void;
  /**
   * Turn a node over when the finger lands on it — the gesture a `turns` slider cannot teach.
   *
   * The subject is the nearest node with its OWN `Flippable` at or above what was hit, so a tile
   * hands the turn to its arena. A tap that lands on no node of the tree — bare desk, or a face a
   * content swap put there — turns the root, when the root is what turns. The panel keeps its
   * handle: a re-render feeds the tree in as always. Attached once, for the same reason `press` is.
   */
  readonly flipOnTap?: boolean;
  /**
   * A TAP ON THE DESK, with the node it landed on — `undefined` for bare desk.
   *
   * The shell's job here is the picking and nothing else: it says WHAT was tapped, through the
   * camera when there is one, and the story decides what that means. A shuffle shelf shuffles
   * again, and a reader who came to watch a shuffle can start one by touching the pack instead of
   * hunting for a counter on the panel.
   *
   * Attached ONCE, like `press`: the listener lives as long as the scene, and the handler is looked
   * up at tap time, so the newest render's answer is the one that runs.
   */
  readonly tap?: (hit: Node | undefined) => void;
  /**
   * Drive the scene through the MOTION runtime (`attachMotion`) instead of the still painter, so a
   * tree fed a new pose eases there instead of teleporting. A re-render with a different tree — which
   * is exactly what a control change is — becomes a settle the reader can watch.
   */
  readonly animate?: boolean;
  /**
   * The game's tuning for an `animate` scene — any subset of `MotionTuning`, handed to `attachMotion`
   * AS IS. A story's controls are these fields under these names; nothing translates in between.
   */
  readonly motion?: TuningPatch;
  /**
   * PUT A CAMERA ON THIS CANVAS: the desk is then looked AT rather than merely fitted into the view,
   * and the finger pans, pinches and wheels it (`wireCamera`).
   *
   * A re-render retunes the standing camera instead of building another, exactly as the motion
   * tuning does — a control change is new numbers for the same view, not a new view. Which is also
   * why `start` is applied once and never again: re-applying it would yank the desk back to the
   * middle on every keystroke in the panel.
   */
  readonly camera?: CameraScene;
}

/** Everything the catalog's shell needs to stand a camera up — the kit's own fields, by name. */
export interface CameraScene {
  readonly limits: CameraLimits;
  /** Where the desk is and how big, in units. A VALUE: a re-render brings the panel's newest one. */
  readonly content: CameraContent;
  /** What one unit is worth in pixels at zoom 1. Absent, the host's own etalon. */
  readonly unit?: number | undefined;
  /** How hard the wheel zooms — `ZOOM_SENS` absent. */
  readonly sensitivity?: number | undefined;
  /** Which nodes take a finger for themselves; over one of them the camera stands down. */
  readonly claims?: ((n: Node) => boolean) | undefined;
  /** How far the desk is laid back, in degrees. Live: a re-render feeds the standing camera. */
  readonly pitch?: number | undefined;
  /**
   * The view's angle, in degrees — applied when it CHANGES and at no other time.
   *
   * Not on every feed, or a panel would fight the fingers: twist the desk by hand, touch any other
   * control, and the view would snap back to whatever the slider still says. Changed, it is the
   * reader's word and wins.
   */
  readonly turn?: number | undefined;
  /** Where the view opens. Read ONCE, when the scene is built. */
  readonly start?: { readonly at?: Point; readonly zoom?: number | "fit" } | undefined;
}

/** One ruler for the whole page: the answers are cached, so twenty stories measure a caption once. */
const ruler = domTextMeasure();

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
  const id = takeSceneId(options.key);

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
    // The handler is the STORY's closure and it is new on every render, while the listeners are
    // the scene's and must not be. So the ref is swapped and nothing is re-attached.
    PRESSED.set(id, options.press);
    TAPPED.set(id, options.tap);
    standing.setRoot(root);
    standing.setSettings(settings);
    // The tuning follows the sliders on the standing clock — a re-render is new numbers for the
    // same runtime, the way a game's settings screen retunes without rebuilding the desk.
    if (options.motion) standing.motions?.retune(options.motion);
    // And so does the camera: new limits, a new desk, a new sensitivity — under the SAME view.
    // `start` is deliberately not re-read; see `SceneOptions.camera`.
    if (options.camera) CAMERAS.get(id)?.(options.camera);
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
  // THE CATALOG IS THE TEXT PORT'S FIRST CONSUMER, and that is on purpose: a port the kit's own
  // showcase could not use would be the wrong port. One ruler for every scene on the page — the
  // measurements are cached inside it, so a shelf of twenty stories measures each caption once.

  // THE CAMERA IS BUILT ONCE AND FED AFTERWARDS, like everything else on a standing scene. What a
  // re-render brings is new numbers — limits, a bigger desk, another sensitivity — never a new view.
  let cam = options.camera;
  const camera = cam ? new Camera(cam.limits) : undefined;
  const viewOf = camera ? () => camera.transform() : undefined;
  /** Beside the view and from the same camera, so the two can never disagree. */
  const pitchOf = camera ? () => camera.pitch : undefined;

  // A motion scene runs the one clock (and needs the stock easings) instead of the still painter;
  // both hand back a teardown of the same shape, so the rest of the shell does not care which.
  // The runtime handle is KEPT when it exists: a drag story speaks to the clock (`grab`/`dragTo`/
  // `release`), and building a second runtime for that would put two clocks on one glass.
  const motions = options.animate
    ? (installStockEasings(),
      attachMotion(host, painter, {
        ...options.motion,
        measure: ruler,
        ...(options.bake ? { bake: options.bake } : {}),
        ...(viewOf ? { view: viewOf } : {}),
        ...(pitchOf ? { pitch: pitchOf } : {}),
      }))
    : undefined;
  PRESSED.set(id, options.press);
  // Attached whenever the story asked for it once. The listeners live as long as the scene does,
  // and what they call is looked up at press time — so the newest handler always answers.
  const stopButtons = options.press
    ? wireButtons({ host, onPress: (m, n) => PRESSED.get(id)?.(m, n), ...(viewOf ? { view: viewOf } : {}) })
    : () => {};
  const stopTaps = options.flipOnTap ? wireFlipTap(host, motions) : () => {};
  TAPPED.set(id, options.tap);
  const stopTapping = options.tap ? wireTap(host, (hit) => TAPPED.get(id)?.(hit), viewOf, () => motions?.poses()) : () => {};
  const stopPainting = motions
    ? motions.stop
    : attachPainter(host, painter, {
        measure: ruler,
        ...(options.bake ? { bake: options.bake } : {}),
        ...(viewOf ? { view: viewOf } : {}),
        ...(pitchOf ? { pitch: pitchOf } : {}),
      });

  // THE CATALOG RUNS THE CAMERA'S CLOCK, because the kit refuses to (`guard.one-clock`): a throw is
  // stepped by whoever already has frames, and here that is the consumer. The loop sleeps whenever
  // the view is still — a canvas asking for frames with nothing to show is how a phone gets warm.
  let stopCamera = (): void => {};
  if (camera && cam) {
    let dirty = false;
    let running = false;
    let lastMs = 0;
    const repaint = (): void => {
      // Straight to the frame, never through `host.setRoot`: a notify rebuilds the plan for the
      // note, the toolbar and the inspector too, and at sixty frames a second that is the whole
      // tree walked and published for a desk that only slid four pixels.
      if (motions) motions.redraw();
      else renderFrame(host, painter, { measure: ruler, view: () => camera.transform(), pitch: () => camera.pitch });
    };
    const tick = (nowMs: number): void => {
      const dt = Math.min(0.1, (nowMs - lastMs) / 1000);
      lastMs = nowMs;
      const going = control.step(dt);
      if (dirty) {
        dirty = false;
        repaint();
      }
      if (going || dirty) requestAnimationFrame(tick);
      else running = false;
    };
    const wake = (): void => {
      dirty = true;
      if (running) return;
      running = true;
      lastMs = performance.now();
      requestAnimationFrame(tick);
    };
    const control: CameraControl = wireCamera({
      host,
      camera,
      content: () => cam!.content,
      onView: wake,
      ...(cam.unit === undefined ? {} : { unit: () => cam!.unit! }),
      ...(cam.claims ? { claims: (n) => cam!.claims!(n) } : {}),
      ...(cam.sensitivity === undefined ? {} : { sensitivity: cam.sensitivity }),
    });
    // WHERE THE VIEW OPENS — once, and not before there is a glass to open it on.
    //
    // Storybook hands the story's element back and appends it afterwards, so at this line the stage
    // has no layout at all and the host reports its floor: one pixel by one. "The middle of the
    // desk" measured against that glass is the top-left corner of it — which is exactly where this
    // scene opened, at the wrong end of a two-thousand-unit zone, until the reader touched it.
    //
    // So it is a LATCH, not a line: the first frame with a real glass sets the opening view, and
    // every resize after that is only a clamp. Re-applying it would drag the reader back to the
    // middle whenever the window changed width.
    const start = cam.start;
    let opened = false;
    const openView = (): void => {
      const v = host.viewport();
      if (opened || v.width <= 1 || v.height <= 1) return;
      opened = true;
      if (cam?.pitch !== undefined) camera.pitch = cam.pitch;
      if (cam?.turn !== undefined) camera.turnTo(cam.turn);
      if (start?.zoom !== undefined) camera.setZoom(start.zoom === "fit" ? camera.fitZoom() : start.zoom);
      camera.lookAt(start?.at ?? { x: 0, y: 0 });
      // At once, not on the next frame: the painter above already drew one, through a camera that
      // had not been told where to look.
      repaint();
    };
    openView();
    host.onChange(() => {
      control.refresh(); // a resize is a new glass, and the clamp has to know
      openView();
    });
    CAMERAS.set(id, (next) => {
      const turned = next.turn !== undefined && next.turn !== cam?.turn;
      cam = next;
      // The tilt is not a gesture — nothing on the glass fights the slider for it — so unlike the
      // turn it is simply applied every time.
      if (next.pitch !== undefined) camera.pitch = next.pitch;
      camera.retune(next.limits);
      if (turned) camera.turnTo(next.turn!);
      control.refresh();
    });
    stopCamera = () => {
      CAMERAS.delete(id);
      control.stop();
    };
  }

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
    ...(motions ? { motions } : {}),
    ...(camera ? { camera } : {}),
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
      stopCamera();
      stopButtons();
      stopTaps();
      stopTapping();
      TAPPED.delete(id);
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
 * The plain tap — see `SceneOptions.tap`. It reports what was under the finger and stops there;
 * every decision after that is the story's.
 */
function wireTap(host: Host, onTap: (hit: Node | undefined) => void, view?: () => Transform, poses?: () => ReadonlyMap<string, Transform> | undefined): () => void {
  const onDown = (e: PointerEvent): void => {
    onTap(pick(host, host.root, glassOf(host.view, e), () => true, view?.(), poses?.()));
  };
  host.view.addEventListener("pointerdown", onDown);
  return () => host.view.removeEventListener("pointerdown", onDown);
}

/**
 * The tap that turns a card — see `SceneOptions.flipOnTap`. The clock plays the turn when the
 * scene has one; without a clock the turn still happens, at once.
 */
function wireFlipTap(host: Host, motions: Motions | undefined): () => void {
  const onDown = (e: PointerEvent): void => {
    const root = host.root;
    const turn = ownsTheTurn(pick(host, root, glassOf(host.view, e), () => true)) ?? flippable(root);
    if (!turn) return;
    const commit = (): void => {
      setFacing(turn, facing(turn) === "up" ? "down" : "up");
      host.setRoot(root); // the note and the tree panel re-read the turn
    };
    if (motions) motions.flip(turn.id, commit);
    else commit();
  };
  host.view.addEventListener("pointerdown", onDown);
  return () => host.view.removeEventListener("pointerdown", onDown);
}

/** The hit node if it turns in its own right, else the nearest owner of a turn above it. */
function ownsTheTurn(hit: Node | undefined): Node | undefined {
  for (let n: Node | null | undefined = hit; n; n = n.parent) if (caps(n).has("Flippable")) return n;
  return undefined;
}

const flippable = (n: Node): Node | undefined => (caps(n).has("Flippable") ? n : undefined);

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
export function lazyPixiPainter(view: HTMLCanvasElement, size: PainterSize): Painter {
  let real: Painter | null = null;
  let pending: { plan: readonly Quad[]; marks: readonly Mark[]; theme: ThemeName } | null = null;
  let box = size;
  let dead = false;

  const ready = import("../../src/render/pixi.js").then(async ({ pixiPainter }) => {
    if (dead) return;
    real = pixiPainter(view, box);
    if (pending) real.draw(pending.plan, pending.marks, pending.theme);
    await real.ready;
    if (dead) return;
    // THE SIZE MAY HAVE MOVED WHILE THE RENDERER WAS STARTING — on a phone the layout often
    // settles inside exactly this window, and a renderer that has not started yet cannot
    // resize. Re-assert the latest size and frame now that it can listen, or the canvas keeps
    // whatever it measured before layout — one pixel, presented as an empty scene that any
    // later toggle mysteriously "fixes".
    real.resize(box.width, box.height);
    if (pending) real.draw(pending.plan, pending.marks, pending.theme);
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
