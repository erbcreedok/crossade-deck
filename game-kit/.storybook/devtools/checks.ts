// THE CHECKS A STORY RUNS ON ITSELF — and the SECTION is the switch.
//
// Storybook plays a story's `play` function the moment the story renders, on every render. For
// a component library that is right; here a scene holds a live WebGL canvas, and a reader
// turning a knob would be driving a stress suite. So checks live ONLY in the `Tests/` section
// of the tree: opening one of those pages is the request, and the rest of the catalog carries
// no play at all. No hidden toggle, nothing to be told about — the list of cases is the
// section, on screen.
//
// The first cut was a switch above the story tree, gating every play behind a global. It
// failed as UX in one showing: the panel sat empty, the switch meant nothing to anyone who had
// not read this file, and the list of cases existed nowhere a reader could see.
//
// ONE BODY, TWO CONSUMERS, which is the whole reason for using Storybook's own mechanism
// rather than a panel of buttons: a reader watches the steps tick past in the Interactions
// panel; automation opens the same story and asserts on the same steps. There is no second
// copy to keep in step, and a check that passes for one cannot be failing for the other.

import { type PlayFunctionContext } from "storybook/internal/types";
import { sceneOf, type Scene } from "./scene.js";

/** What a play function is handed. Narrowed to what the checks below actually use. */
export type CheckContext = PlayFunctionContext & {
  readonly canvasElement: HTMLElement;
  readonly globals: Record<string, unknown>;
};

/** One named step of a check, run in order and reported as its own line in the panel. */
export interface Step {
  readonly name: string;
  run(ctx: CheckContext): Promise<void> | void;
}

/** A story's checks, as its `play` function: named steps, run in order. */
export function checks(steps: readonly Step[]) {
  return async (ctx: CheckContext): Promise<void> => {
    // LET THE PANEL SIT DOWN FIRST. The Interactions panel lives in the MANAGER document and
    // subscribes to the instrumenter's events after the preview has already started playing —
    // on a cold page load the whole run could finish before anyone was listening, and the
    // panel then showed nothing at all. An empty panel over a suite that ran and passed is
    // indistinguishable from a suite that never ran, which is exactly the report it produced.
    await new Promise((settle) => setTimeout(settle, 800));
    for (const step of steps) {
      // `ctx.step` groups the assertions under a name in the panel, so a failure says WHICH
      // claim broke instead of pointing at the story.
      await ctx.step(step.name, async () => {
        await step.run(ctx);
      });
    }
  };
}

/**
 * The scene's canvas, once it has actually painted.
 *
 * A GPU renderer starts asynchronously and draws on the next frame, so "the story rendered" and
 * "there is a picture" are two different moments. The shell marks the second with
 * `data-painted`, and waiting on that attribute is the difference between a suite that reads
 * the glass and one that reads an empty buffer — intermittently, which is worse.
 */
export async function painted(ctx: CheckContext): Promise<HTMLCanvasElement> {
  // AN EVENT, NOT A DEADLINE. The renderer arrives through a dynamic import, and a dev server
  // with a cold cache can spend over a minute transforming `pixi.js` for the first open — any
  // timeout a check could pick is either shorter than that or long enough to hang a genuine
  // failure on. The scene's own `ready` settles on the first presented frame and rejects if
  // the renderer dies, so waiting on it is exact in both directions.
  //
  // Found through the DOCUMENT, not the story root. On a cold load Storybook can render the
  // story more than once, and the scene — one standing object per story, see `scene()` — is
  // REPARENTED into the newest root: a play started by the earlier render would poll a root
  // the scene has already left. One story is one scene in the preview, so the document-wide
  // question has exactly one honest answer.
  const doc = ctx.canvasElement.ownerDocument;
  const scene = await waitFor(() => {
    for (const el of doc.querySelectorAll("#storybook-root > div")) {
      const found = sceneOf(el as HTMLElement);
      if (found) return found;
    }
    return undefined;
  }, "no scene ever mounted in this story");
  await scene.ready;
  const view = scene.el.querySelector("canvas");
  if (!view) throw new Error("the scene painted without a canvas");
  return view as HTMLCanvasElement;
}

/** The live scene behind the element the story handed back — the handle a check DRIVES. */
export async function standing(ctx: CheckContext): Promise<Scene> {
  const el = await waitFor(() => ctx.canvasElement.querySelector("[data-painted]"), "the scene never painted");
  const found = sceneOf(el as HTMLElement);
  if (!found) throw new Error("the painted element is not a scene of this catalog");
  return found;
}

/** Two frames later — one to schedule the draw, one to prove it was presented. */
export const settled = (): Promise<void> =>
  new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => done())));

/** Poll until a value turns up. A fixed sleep is how a suite becomes flaky and then ignored. */
export async function waitFor<T>(get: () => T | null | undefined, complaint: string, ms = 4000): Promise<T> {
  const started = performance.now();
  for (;;) {
    const value = get();
    if (value) return value;
    if (performance.now() - started > ms) throw new Error(complaint);
    await new Promise((resolve) => requestAnimationFrame(resolve));
  }
}

/**
 * What is actually on the glass at one point, as `[r, g, b, a]`.
 *
 * The one measurement no other layer can make. Everything above this runs against a pure
 * function or a fake, and jsdom has no WebGL at all — so "the plan says draw a square" and "a
 * square is on the glass" stay two different claims until something reads a pixel back.
 *
 * Coordinates are FRACTIONS of the canvas, not pixels: the buffer is sized by the device
 * pixel ratio, and a check written in pixels quietly measures a different place on a retina
 * screen than on the machine it was written on.
 */
export function pixelAt(view: HTMLCanvasElement, fx: number, fy: number): [number, number, number, number] {
  const probe = document.createElement("canvas");
  probe.width = view.width;
  probe.height = view.height;
  const ctx = probe.getContext("2d");
  if (!ctx) throw new Error("no 2d context to read the glass with");
  ctx.drawImage(view, 0, 0);
  const x = Math.round(fx * (view.width - 1));
  const y = Math.round(fy * (view.height - 1));
  const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
  return [r!, g!, b!, a!];
}

/** Whether two readings differ enough to be a different colour rather than a rounding. */
export function differs(a: readonly number[], b: readonly number[], by = 8): boolean {
  return a.some((v, i) => Math.abs(v - (b[i] ?? 0)) > by);
}

/**
 * The whole glass at once, as one `ImageData`.
 *
 * `pixelAt` answers for a point; a check about an OUTLINE cannot use points, because a stroke a
 * couple of device pixels wide slips between any grid of probes somebody picks — and whether it
 * slips depends on the viewport and the pixel ratio, which is a flake with a delay on it. One
 * read of the full buffer makes the question exact.
 */
export function snapshot(view: HTMLCanvasElement): ImageData {
  const probe = document.createElement("canvas");
  probe.width = view.width;
  probe.height = view.height;
  const ctx = probe.getContext("2d");
  if (!ctx) throw new Error("no 2d context to read the glass with");
  ctx.drawImage(view, 0, 0);
  return ctx.getImageData(0, 0, view.width, view.height);
}

/** Where the picture differs from a background reading: how many pixels, and their box. */
export interface Ink {
  readonly count: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Every pixel that is not the background, counted and boxed.
 *
 * The box is the measurement a size claim stands on: "the rect got wider" is `maxX - minX`
 * growing, in buffer pixels, with no opinion about where the stroke runs or how it is dashed.
 * The background is a READING (a corner pixel), not a constant — the desk colour belongs to the
 * theme, and a check that hard-codes it breaks on the day the palette moves.
 */
export function inkOf(image: ImageData, background: readonly number[], by = 8): Ink {
  let count = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const { data, width, height } = image;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 4;
      if (differs([data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!], background, by)) {
        count += 1;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { count, minX, minY, maxX, maxY };
}

/** Whether two snapshots show a different picture, anywhere at all. */
export function imagesDiffer(a: ImageData, b: ImageData, by = 8): boolean {
  if (a.width !== b.width || a.height !== b.height) return true;
  for (let i = 0; i < a.data.length; i += 1) {
    if (Math.abs(a.data[i]! - b.data[i]!) > by) return true;
  }
  return false;
}
