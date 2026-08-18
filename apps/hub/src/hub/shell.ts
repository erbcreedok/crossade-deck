// THE HUB ITSELF — a host, a painter, and a tree. No HTML interface anywhere: the title, the
// tiles, the shadows and the press are all ordinary nodes drawn by the engine.
//
// THE HUB'S CANVAS IS NEVER TORN DOWN. It is created once per page load and kept, and switching
// between the shelf and a running game is `setRoot` — a tree swap, which is exactly what `setRoot`
// exists for. Tearing it down instead would drop a WebGL context (a browser gives out about a
// dozen) and, worse, would leave the back control with nowhere to be drawn, since the hub has no
// HTML to fall back on.

import {
  attachPainter,
  DEFAULT_VIEWER,
  installStockCoats,
  installStockLayouts,
  installStockSurfaces,
  installTheme,
  mount,
  type Host,
} from "game-kit";
import { pixiPainter } from "game-kit/pixi";
import { hubRuler } from "../look/fonts.js";
import { installHubLook } from "../look/surfaces.js";
import { hubTree } from "./grid.js";

/** The shelf is about eight units across and six down; fit whichever is tighter. */
function fitUnit(v: { width: number; height: number }): number {
  return Math.max(16, Math.min(v.width / 9.2, v.height / 6.4));
}

export function startHub(chrome: HTMLElement, _stage: HTMLElement): () => void {
  // The theme is installed for exactly one reason, and it is worth naming: every colour the hub
  // draws is a literal from `palette.ts`, so a palette switch changes nothing here — EXCEPT the ink
  // of a cast shadow, which the plan resolves from the `shadow` token. Dark gives black, which is
  // what a hard offset drop wants.
  installTheme(document, DEFAULT_VIEWER.theme);
  installStockLayouts();
  installStockSurfaces();
  installStockCoats();
  installHubLook();

  const host: Host = mount(chrome, hubTree(), { ...DEFAULT_VIEWER, hudUnit: fitUnit({ width: 900, height: 600 }) });
  const first = host.viewport();
  const painter = pixiPainter(host.view, { width: first.width, height: first.height, resolution: first.dpr });
  const ruler = hubRuler();
  const stopPainting = attachPainter(host, painter, { measure: ruler });

  host.view.style.touchAction = "none";

  let lastUnit = -1;
  const applyFit = (): void => {
    const u = fitUnit(host.viewport());
    if (u === lastUnit) return;
    lastUnit = u;
    host.setViewer({ ...host.viewer(), hudUnit: u });
  };
  const stopFitting = host.onChange(applyFit);
  applyFit();

  // The faces are not measurable until they arrive, and a caption laid out against the fallback
  // stays that way. So the first frame drawn with real metrics is asked for HERE, once the ruler
  // says it has them — `setRoot` with the tree it already holds is the redraw.
  let alive = true;
  void ruler.ready.then(() => {
    if (alive) host.setRoot(host.root);
  });

  return () => {
    alive = false;
    stopFitting();
    stopPainting();
    painter.destroy();
    host.unmount();
  };
}
