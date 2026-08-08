// WHAT A RENDERER MUST BE ABLE TO DO — the contract, kept away from the renderer itself.
//
// It lives in its own file so that binding a host to a painter costs no import of `pixi.js`:
// a type erased at compile time still drags the module in at runtime if it shares a file with
// real code. That is also what keeps the single-import guard meaningful rather than technical.

import { type ThemeName } from "../core/viewer.js";
import { type Mark, type Quad } from "./scenePlan.js";

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
  draw(plan: readonly Quad[], marks: readonly Mark[], theme: ThemeName): void;
  /** In CSS pixels. Device pixels are the painter's own business. */
  resize(width: number, height: number): void;
  destroy(): void;
}
