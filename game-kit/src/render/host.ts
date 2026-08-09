// HOST — the only place that knows about pixels and the DOM.
//
// A node lives in units and knows nothing of the screen. The host owns the `view`, its size
// and the resize observer, and computes the HUD etalon as a fraction of the viewport, which
// it puts into the ResolveContext.
//
// NOTE on the name: the HTMLCanvasElement is called `view`, never `canvas` — "Canvas" in this
// project means the desk space, and the collision has bitten before.
//
// Slice 1 draws nothing: with only Node and Root there is no atom that paints. Pixi arrives
// with `Surfaced`, in `render/pixi.ts`, and that will be its only import site in the tree.

import { contextFor, type ResolveContext } from "../core/resolve.js";
import { type Node } from "../core/node.js";
import { DEFAULT_VIEWER, type ViewerSettings } from "../core/viewer.js";

/** The etalon is a fraction of the SHORTER side, so rotating the screen does not resize the HUD. */
export const HUD_UNIT_FRACTION = 0.25;

export interface Viewport {
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
}

export interface Host {
  readonly view: HTMLCanvasElement;
  /** The tree currently on screen. Read on every draw, so it may be replaced under way. */
  readonly root: Node;
  /**
   * Show a different tree in the same view.
   *
   * New data — a move from the server, a save loaded, a spec edited — replaces what is drawn,
   * it does not replace the canvas. Tearing the host down and building another would drop the
   * WebGL context and every viewer setting with it, and a browser only hands out about a dozen
   * contexts before it starts taking them back.
   */
  setRoot(next: Node): void;
  /** The viewer plane, carried once so a scene does not wire each toggle by hand. */
  viewer(): ViewerSettings;
  setViewer(next: ViewerSettings): void;
  viewport(): Viewport;
  /** The HUD etalon in px. Sizes in units are the truth; pixels are per viewer. */
  unit(): number;
  contextFor(n: Node): ResolveContext;
  /** Called after every resize, so a scene can redraw on demand rather than on a ticker. */
  onChange(listener: () => void): () => void;
  unmount(): void;
}

export function mount(container: HTMLElement, root: Node, initialViewer: ViewerSettings = DEFAULT_VIEWER): Host {
  const view = container.ownerDocument.createElement("canvas");
  view.style.display = "block";
  view.style.width = "100%";
  view.style.height = "100%";
  container.appendChild(view);

  const listeners = new Set<() => void>();
  let box: Viewport = measure(container, view);
  let viewer: ViewerSettings = initialViewer;
  let tree: Node = root;

  const sync = (): void => {
    box = measure(container, view);
    view.width = Math.max(1, Math.round(box.width * box.dpr));
    view.height = Math.max(1, Math.round(box.height * box.dpr));
    for (const l of listeners) l();
  };
  sync();

  const RO = (container.ownerDocument.defaultView as unknown as { ResizeObserver?: typeof ResizeObserver })
    ?.ResizeObserver;
  const observer = RO ? new RO(() => sync()) : undefined;
  observer?.observe(container);

  // The viewer's override wins: this is the accessibility knob, and sizes in units are
  // untouched by it — only how many pixels one unit is worth for THIS onlooker.
  //
  // AND NEVER ZERO. The viewport is already floored at one pixel, but a quarter of one pixel
  // rounds to nothing — and an etalon of nothing says one world unit is worth no pixels at all.
  // Nothing crashes: the plan guards its division and every quad comes out at zero scale, so a
  // container measured before layout — or on a hidden tab — draws a blank canvas and reports
  // success. One pixel is wrong too, but it is VISIBLY wrong, and it recovers on the next
  // resize.
  const unit = (): number =>
    viewer.hudUnit ?? Math.max(1, Math.round(Math.min(box.width, box.height) * HUD_UNIT_FRACTION));

  return {
    view,
    // A getter, not the value it was mounted with: everything downstream reads `host.root` at
    // draw time, so replacing the tree is enough to redraw a different one.
    get root() {
      return tree;
    },
    setRoot(next) {
      tree = next;
      for (const l of listeners) l();
    },
    viewport: () => box,
    unit,
    viewer: () => viewer,
    setViewer(next) {
      viewer = next;
      for (const l of listeners) l();
    },
    contextFor: (n) => contextFor(n, unit(), viewer),
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    unmount() {
      observer?.disconnect();
      listeners.clear();
      view.remove();
    },
  };
}

function measure(container: HTMLElement, view: HTMLCanvasElement): Viewport {
  const rect = container.getBoundingClientRect();
  const win = view.ownerDocument.defaultView;
  return {
    width: Math.max(1, Math.round(rect.width)),
    height: Math.max(1, Math.round(rect.height)),
    dpr: win?.devicePixelRatio ?? 1,
  };
}
