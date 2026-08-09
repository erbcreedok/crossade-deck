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

/**
 * EVERY ASSERTION NAMES ITS READING, because the panel IS the report.
 *
 * The Interactions panel prints a call with its arguments, and `expect` takes a message as its
 * second one — so `expect(0, "inked pixels").toBe(0)` reads as a sentence where `expect(0).toBe(0)`
 * said nothing at all. Bare numbers are the failure mode this section exists to avoid: a reader
 * watching the steps has only what is printed, and a green line nobody can read is worth as little
 * as a red one.
 *
 * The message is not decoration — it is also what the failure says, since the same string is
 * prefixed to the assertion error.
 *
 * KEEP IT UNDER FIFTY CHARACTERS. The panel ellipsizes a string argument at 50, and it does so
 * silently — a longer message reads as a sentence that stops mid-word, which is worse than a
 * short one. Numbers belong in it (`303px against 304px` is the whole point), so the words
 * around them have to be few.
 */

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
  const found = scene.el.querySelector("canvas");
  if (!found) throw new Error("the scene painted without a canvas");
  const view = found as HTMLCanvasElement;
  // A CANVAS WITH NO SIZE IS NOT A PICTURE, and `data-painted` cannot tell the difference.
  //
  // The shell mounts the scene into an element Storybook has NOT put in the document yet, so the
  // host measures nothing and floors the view at one pixel — and the first frame, the one the
  // painted flag goes up on, is drawn at that size. A `ResizeObserver` corrects it the moment the
  // element lands, and every picture after it is right.
  //
  // A check that read the glass inside that gap measured a canvas one pixel wide, where the
  // middle IS the corner: "the middle is the card" fails, and so would every other claim about a
  // picture. It only lost the race on a loaded machine — the whole suite running at once — which
  // is the shape of a flake nobody can reproduce on demand.
  //
  // AND THE WAIT IS AN EVENT, not a deadline, for the same reason `ready` is one: what is being
  // waited for is the MANAGER laying its panels out, and how long that takes is a property of the
  // machine, not of this catalog. A four-second budget was enough on an idle laptop and not enough
  // with the whole suite running — which is to say the number was never a measurement of anything.
  await sized(scene);
  // One more frame, because the size arriving is not the redraw at that size.
  await settled();
  return view;
}

/**
 * Settles when the host has a viewport worth reading — the scene's own notification, not a clock.
 *
 * The host re-measures on every resize and tells its listeners, so the question "does this page
 * have a layout yet" has an event behind it. Nothing here polls, and nothing here gives up.
 */
async function sized(scene: Scene): Promise<void> {
  const laidOut = (): boolean => {
    const box = scene.host.viewport();
    return box.width > 8 && box.height > 8;
  };
  if (laidOut()) return;
  await new Promise<void>((done) => {
    const stop = scene.host.onChange(() => {
      if (!laidOut()) return;
      stop();
      done();
    });
  });
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

/**
 * Two readings held against each other, ready to be SPREAD into `expect`: how far apart they are,
 * and a message naming both.
 *
 * `expect(...gap("ink width", 129, 128)).toBeLessThan(15)` prints
 * `expect(1, "ink width: 129px against 128px").toBeLessThan(15)` — the difference is what the
 * claim is about, and the two measurements are what a reader needs to see to believe it. A bare
 * difference against a bare tolerance says neither how big the thing was nor what it was compared
 * with, which is exactly how a size check becomes unreadable.
 *
 * Rounded, because these are buffer pixels: a claim written to fifteen decimal places is a claim
 * about floating point, not about a picture.
 */
export function gap(what: string, got: number, want: number): [number, string] {
  return [Math.round(Math.abs(got - want)), `${what}: ${Math.round(got)}px against ${Math.round(want)}px`];
}

/** A tolerance in whole pixels, as a fraction of the etalon — so it scales with the picture. */
export function nearly(perUnit: number, fraction: number): number {
  return Math.round(perUnit * fraction);
}

/** Whether two snapshots show a different picture, anywhere at all. */
export function imagesDiffer(a: ImageData, b: ImageData, by = 8): boolean {
  if (a.width !== b.width || a.height !== b.height) return true;
  for (let i = 0; i < a.data.length; i += 1) {
    if (Math.abs(a.data[i]! - b.data[i]!) > by) return true;
  }
  return false;
}
