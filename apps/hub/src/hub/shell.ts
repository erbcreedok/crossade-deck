// THE HUB ITSELF — a host, a painter, and two trees it swaps between. No HTML interface anywhere:
// the title, the tiles, the shadows, the press and the way back are all ordinary nodes.
//
// THE HUB'S CANVAS IS NEVER TORN DOWN. It is created once per page load and kept; moving between
// the shelf and a running game is `setRoot`, which is exactly what `setRoot` exists for. Tearing it
// down instead would drop a WebGL context (a browser gives out about a dozen) and, worse, would
// leave the way back with nowhere to be drawn, since the hub has no HTML to fall back on.
//
// The game gets its OWN host in its own region. That keeps the seam at `(container) => teardown` —
// the shape an iframe or a separate page would also take — and keeps two sets of pointer listeners
// off one canvas, which is a bug the kit's own devtools keep a WeakMap to avoid.

import {
  attachPainter,
  byId,
  Coated,
  compose,
  DEFAULT_VIEWER,
  installStockCoats,
  installStockLayouts,
  installStockSurfaces,
  installTheme,
  mount,
  NO_COAT,
  type Host,
} from "game-kit";
import { pixiPainter } from "game-kit/pixi";
import { hubRuler } from "../look/fonts.js";
import { installHubLook } from "../look/surfaces.js";
import { PALETTE } from "../look/palette.js";
import { barTree, hubTree } from "./grid.js";
import { wirePress } from "./press.js";
import { CATALOGUE, type Teardown } from "./catalogue.js";
import { goTo, onRoute, routeOf } from "./route.js";

/** The shelf is about nine units across and six down. ONE fit, because the region never changes. */
function fitUnit(v: { width: number; height: number }): number {
  return Math.max(16, Math.min(v.width / 9.2, v.height / 6.4));
}

/** The strip the hub keeps for itself while a game runs, in CSS pixels — matches the stylesheet. */
const STRIP_PX = 56;

/** A dynamic import has no bytes-so-far to report, so the bar sweeps rather than reports. */
const SWEEP_MS = 900;
/** A warm cache would otherwise show a single frame of gold, which reads as a glitch. */
const MIN_BUSY_MS = 250;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export function startHub(chrome: HTMLElement, stage: HTMLElement): () => void {
  // The theme is installed for exactly one reason, worth naming: every colour the hub draws is a
  // literal from `palette.ts`, so a palette switch changes nothing here — EXCEPT the ink of a cast
  // shadow, which the plan resolves from the `shadow` token. Dark gives black, which is what a hard
  // offset drop wants.
  installTheme(document, DEFAULT_VIEWER.theme);
  installStockLayouts();
  installStockSurfaces();
  installStockCoats();
  installHubLook();

  const shell = chrome.parentElement;
  const host: Host = mount(chrome, hubTree(), { ...DEFAULT_VIEWER, hudUnit: 64 });
  const first = host.viewport();
  const painter = pixiPainter(host.view, { width: first.width, height: first.height, resolution: first.dpr });
  const ruler = hubRuler();
  const stopPainting = attachPainter(host, painter, { measure: ruler });

  let playing = false;
  let running: Teardown | undefined;
  let busy = false;
  let alive = true;

  let lastUnit = -1;
  const applyFit = (): void => {
    const u = fitUnit(host.viewport());
    if (u === lastUnit) return;
    lastUnit = u;
    host.setViewer({ ...host.viewer(), hudUnit: u });
  };
  const stopFitting = host.onChange(applyFit);

  const setMode = (mode: "hub" | "play"): void => {
    playing = mode === "play";
    shell?.setAttribute("data-mode", mode);
    // The bar sits in the strip at the top of a full-height canvas: half the viewport up, then
    // half the strip back down, in units.
    const v = host.viewport();
    const unit = host.unit();
    const topY = (STRIP_PX / 2 - v.height / 2) / unit;
    // Three quarters of the ribbon, so the plate has air above and below it.
    host.setRoot(playing ? barTree({ topY, height: (STRIP_PX * 0.75) / unit }) : hubTree());
    lastUnit = -1;
    applyFit();
  };

  /**
   * The tile fills with gold while its game is fetched. `fill` is the only stock coat whose mark is
   * a CUT rather than a fade — a half-drawn thing rather than a half-faded one — which is what a
   * progress bar is. The sweep is cancelled in a `finally`, never in a `then`: a failed import must
   * not leave a frame loop running for the rest of the session.
   */
  const sweep = (faceId: string): (() => void) => {
    const started = performance.now();
    let frame = 0;
    const tick = (): void => {
      const face = byId(host.root, faceId);
      if (!face || !alive) return;
      const level = ((performance.now() - started) % SWEEP_MS) / SWEEP_MS;
      compose(face, Coated({ self: { recipe: "fill", level, tint: PALETTE.gold }, cast: NO_COAT }));
      host.setRoot(host.root);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      const face = byId(host.root, faceId);
      if (face) compose(face, Coated({ self: NO_COAT, cast: NO_COAT }));
    };
  };

  const enter = async (id: string, write = true): Promise<void> => {
    const entry = CATALOGUE.find((g) => g.id === id);
    if (!entry || busy || running) return;
    busy = true;
    const stopSweep = sweep(`tile/${entry.id}/face`);
    try {
      const [start] = await Promise.all([entry.load(), sleep(MIN_BUSY_MS)]);
      if (!alive) return;
      stopSweep();
      setMode("play");
      running = start(stage);
      if (write) goTo(id);
    } catch {
      // A blip, or a game that will not parse. Without this the hub sits in a dead screen with a
      // spinning tile and no way out — the one failure a launcher must not have.
      stopSweep();
      setMode("hub");
      if (write) goTo(undefined, "replace");
    } finally {
      busy = false;
    }
  };

  const leave = (write = true): void => {
    if (!running) return;
    running();
    running = undefined;
    // Belt and braces: `host.unmount()` inside the game already removes its view, but a teardown
    // that threw halfway must not leave an orphan canvas holding a context.
    stage.replaceChildren();
    setMode("hub");
    if (write) goTo(undefined);
  };

  const stopPress = wirePress({
    host,
    onPress: (meaning) => {
      if (meaning["nav"] === "back") leave();
      else if (typeof meaning["game"] === "string") void enter(meaning["game"]);
    },
  });

  setMode("hub");

  // THE URL IS THE PLACE. A reload lands back in the game the player was in, and the browser's own
  // Back leaves it — which is the gesture a phone user reaches for before finding any button.
  // Restoring writes nothing: the address is already right, and writing it again would push a
  // second identical entry onto the history for every reload.
  const opened = routeOf();
  if (opened) void enter(opened, false);

  const stopRouting = onRoute((id) => {
    if (id && !running) void enter(id, false);
    else if (!id && running) leave(false);
  });

  // The faces are not measurable until they arrive, and a caption laid out against the fallback
  // stays that way. So the first frame drawn with real metrics is asked for here, once the ruler
  // says it has them.
  void ruler.ready.then(() => {
    if (alive) host.setRoot(host.root);
  });

  return () => {
    alive = false;
    leave(false);
    stopRouting();
    stopPress();
    stopFitting();
    stopPainting();
    painter.destroy();
    host.unmount();
  };
}
