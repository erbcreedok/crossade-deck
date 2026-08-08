// THE ONLY FILE THAT IMPORTS PIXI. Guarded by a scan, and the rule is worth the guard: the
// day the renderer is swapped, exactly one file is rewritten and the model does not notice.
//
// There is almost nothing here on purpose. What to draw and where is decided by `scenePlan`,
// which is pure and runs in a plain unit test; this turns the answer into objects. Anything
// computed in THIS file is untestable by construction — jsdom has no WebGL, so a rule that
// slips in here is a rule nobody can hold down. Keep it dumb.

import { Application, Graphics } from "pixi.js";
import { type ThemeName } from "../core/viewer.js";
import { type Painter } from "./painter.js";
import { type Mark, type Quad } from "./scenePlan.js";
import { paint } from "./theme.js";

export { type Painter };

export interface PixiPainterOptions {
  readonly width: number;
  readonly height: number;
  readonly resolution: number;
}

/**
 * A debug outline is a HAIRLINE, in pixels and not in units: it describes the box, it is not
 * part of it, so it must not grow with the etalon or it starts reading as a border somebody
 * authored.
 */
const MARK_WIDTH = 1;

export function pixiPainter(view: HTMLCanvasElement, options: PixiPainterOptions): Painter {
  const app = new Application();
  let alive = true;
  let started = false;
  let pending: { plan: readonly Quad[]; marks: readonly Mark[]; theme: ThemeName } | null = null;

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
      if (pending) apply(pending.plan, pending.marks, pending.theme);
    });

  function apply(plan: readonly Quad[], marks: readonly Mark[], theme: ThemeName): void {
    app.stage.removeChildren().forEach((child) => child.destroy());
    for (const quad of plan) {
      const g = new Graphics();
      g.roundRect(quad.x - quad.w / 2, quad.y - quad.h / 2, quad.w, quad.h, quad.radius);
      if (quad.fill) g.fill(paint(theme, quad.fill));
      if (quad.border) g.stroke({ width: quad.borderWidth, color: paint(theme, quad.border), alignment: 0.5 });
      app.stage.addChild(g);
    }

    // Always last, so tooling is never hidden by the thing it is describing. Nothing here
    // branches on a shape: a mark arrives as points, and a circle is already a polygon.
    for (const mark of marks) {
      const g = new Graphics();
      mark.points.forEach((p, i) => (i === 0 ? g.moveTo(p.x, p.y) : g.lineTo(p.x, p.y)));
      g.closePath();
      g.stroke({ width: MARK_WIDTH, color: paint(theme, "debug"), alignment: 0.5 });
      app.stage.addChild(g);
    }
  }

  return {
    ready,
    draw(plan, marks, theme) {
      if (!alive) return;
      if (!started) {
        pending = { plan, marks, theme };
        return;
      }
      apply(plan, marks, theme);
    },
    resize(width, height) {
      if (alive && started) app.renderer.resize(width, height);
    },
    destroy() {
      alive = false;
      if (started) app.destroy(true);
    },
  };
}
