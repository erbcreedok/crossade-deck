import { Container, Graphics } from "pixi.js";
import {
  DUST_FLICKER,
  DUST_LEVERS,
  DUST_PER_CELL,
  MOTE_CAP,
  dustCells,
  dustParams,
  dustPoints,
  dustStep,
  moteAt,
  thinPoints,
} from "../dust.js";
import { type OverlayRef } from "../effects.js";
import { knob } from "./filters.js";

// THE OVERLAY REGISTRY — name → things DRAWN over a quad, and the second thing the clock drives.
//
// A filter reworks the pixels the box already put on the glass; an overlay is handed a look at
// them and builds its OWN objects on top. Two seams and not one with a flag, because the painter
// genuinely does two different jobs — and because there is a whole class of effect a shader cannot
// reach: the censor's dust is a thousand little squares, each one the colour of the spot it was
// born on, moving independently. No filter can be handed that and no wash can imitate it.
//
// The discipline is the filter's, exactly: the plan carries a NAME and numbers, the objects are
// built here, and a name nobody registered is skipped rather than thrown over.
export interface LiveOverlay {
  readonly view: Container;
  readonly tick?: (seconds: number) => void;
}

/** A shrunken picture of the face under an overlay: `cols × rows` RGBA pixels, premultiplied. */
export interface OverlaySample {
  readonly cols: number;
  readonly rows: number;
  readonly pixels: ArrayLike<number>;
}

/**
 * What the painter can tell an overlay about the quad it is going over — and it is deliberately
 * almost nothing. `width`/`height` are the quad's extent in the plan's pixels, which is the space
 * the overlay's own view draws in; `sample` reads the face into a grid of `step`-pixel cells.
 *
 * Reading the glass is the ONE thing only the renderer can do, so it is the one thing this hands
 * over. What the grid then means — which cells are lit, what colour a mote inherits, where it is
 * at second `t` — is decided in `render/dust.ts`, under a unit test.
 */
export interface OverlaySource {
  readonly width: number;
  readonly height: number;
  sample(step: number): OverlaySample;
}

type OverlayFactory = (params: Readonly<Record<string, number>>, source: OverlaySource) => LiveOverlay;

const OVERLAYS = new Map<string, OverlayFactory>();

/** Register an overlay under a name a coat can point at. The filter registry's twin. */
export function registerOverlay(name: string, factory: OverlayFactory): void {
  OVERLAYS.set(name, factory);
}

/** Build the named overlay, or `undefined` — a dangling name, or a builder that threw. */
export function buildOverlay(ref: OverlayRef, source: OverlaySource): LiveOverlay | undefined {
  const factory = OVERLAYS.get(ref.name);
  if (!factory) return undefined;
  try {
    return factory(ref.params, source);
  } catch {
    return undefined;
  }
}

// CENSOR'S `dust` — the hidden face ground up, and the reason the overlay seam exists.
//
// Motes are born on the node's own silhouette, each carrying the colour of the cell it came from,
// drift outwards, fade in and out over their own short lives and are replaced. A censored card
// still reads as THAT card, smeared, which is the whole difference between a censor and a grey bar.
//
// Everything decided here is decided in one line each, because everything else was decided in
// `dust.ts` where a test can reach it: the grid step, which cells are lit, what colour a mote
// carries, and where it is at second `t`. This only reads pixels and draws squares.
registerOverlay("dust", (params, source) => {
  const motes = dustParams(
    {
      block: knob(params, "block", DUST_LEVERS.block),
      swapsPerSec: knob(params, "swapsPerSec", DUST_LEVERS.swapsPerSec),
      jitterAmp: knob(params, "jitterAmp", DUST_LEVERS.jitterAmp),
      jitterFreq: knob(params, "jitterFreq", DUST_LEVERS.jitterFreq),
    },
    DUST_FLICKER,
  );
  const step = dustStep(source.width, source.height);
  const shot = source.sample(step);
  const cloud = thinPoints(
    dustPoints(dustCells(shot.pixels, shot.cols * shot.rows), shot.cols, shot.rows, step, DUST_PER_CELL),
    MOTE_CAP,
  );
  const view = new Container();
  const g = new Graphics();
  view.addChild(g);
  // How thickly the cloud is drawn — the coat's `level`, and the one knob the story exposes.
  view.alpha = Math.max(0, Math.min(1, knob(params, "level", 0.7)));
  const side = motes.dot;
  return {
    view,
    // ONE Graphics REBUILT PER FRAME, not a thousand objects moved. A mote is a square that lives
    // under a second; keeping an object per mote would spend the whole frame on bookkeeping for
    // things that are about to be thrown away.
    tick: (t) => {
      g.clear();
      for (let i = 0; i < cloud.length; i += 1) {
        const mote = moteAt(cloud, i, motes, t);
        // Below this the square costs a fill and shows nothing.
        if (mote.alpha <= 0.02) continue;
        g.rect(mote.x - side / 2, mote.y - side / 2, side, side).fill({ color: mote.color, alpha: mote.alpha });
      }
    },
  };
});
