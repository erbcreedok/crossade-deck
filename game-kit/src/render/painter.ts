// WHAT A RENDERER MUST BE ABLE TO DO — the contract, kept away from the renderer itself.
//
// It lives in its own file so that binding a host to a painter costs no import of `pixi.js`:
// a type erased at compile time still drags the module in at runtime if it shares a file with
// real code. That is also what keeps the single-import guard meaningful rather than technical.

import { type ThemeName } from "../core/viewer.js";
import { type Mark, type Quad } from "./scenePlan/index.js";

/** How one frame is put on the glass. */
export interface DrawOptions {
  /**
   * Keep what the glass already shows and paint this frame OVER it, clearing nothing. The stage
   * hands only the flying quads with this on (`PaintOptions.retain`), so a thrown card leaves its
   * trail and nothing at rest is painted twice. Off, the frame replaces the picture, as always.
   */
  readonly retain?: boolean | undefined;
}

export interface Painter {
  /**
   * A GPU renderer initialises asynchronously, so a painter is usable before it is ready.
   * Callers may ignore this: drawing early records the plan and applies it on arrival, which
   * is what a scene that mounts and paints in the same breath needs.
   */
  readonly ready: Promise<void>;
  /**
   * Colours arrive as token names; the renderer is the only thing that can resolve them.
   *
   * Marks are a SECOND list rather than more quads: a quad is a surface somebody authored, a
   * mark is tooling drawn over it. They are always on top, and they are empty unless the
   * onlooker asked — the model does not know this layer exists.
   */
  draw(plan: readonly Quad[], marks: readonly Mark[], theme: ThemeName, options?: DrawOptions): void;
  /**
   * ASK FOR THESE PICTURES NOW, before any plan mentions them.
   *
   * A renderer loads a texture the first time a plan asks to draw it, and until it lands the layer
   * draws nothing (`textureFor`) — which is right, and is also why a die stutters through its first
   * roll: it changes picture ten times a second and every face it has not shown yet is a frame of
   * nothing. Warming is a question for the RENDERER's own cache, so it is asked of the renderer;
   * the alternative the shelf used to run — a tiny node per picture, parked off the felt so that a
   * PLAN would mention them all — put the whole asset registry on the desk as a strip of sprites.
   *
   * Absent is the ordinary case: a painter with no cache of its own has nothing to warm, and the
   * lack of the capability is the refusal (there is no `warm: false`).
   */
  warm?(sources: readonly string[]): void;
  /** In CSS pixels. Device pixels are the painter's own business. */
  resize(width: number, height: number): void;
  destroy(): void;
}
