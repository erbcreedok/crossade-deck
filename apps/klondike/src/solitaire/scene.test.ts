// @vitest-environment jsdom

// THE HINT GOES DARK — the owner's rule (`scene.ts`, "A LIT HINT DOES NOT OUTLIVE ITS MOMENT") is
// checked here, not eyeballed: a lit ring that a finger cannot dismiss for real, or that outlives
// its own four seconds, only shows up under an actual clock and an actual touch.
//
// Real Pixi cannot run in this environment (no WebGL), so the painter is a fake that only counts
// the frames it is handed — exactly like `game-kit`'s own painter tests. What it draws is real,
// though: `scenePlan` is renderer-agnostic, so the quad it hands the fake for "hud/hint" carries
// the button's true glass-pixel position, and a synthetic pointer aimed at that quad presses the
// SAME control a finger would.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startSolitaire } from "./scene.js";

/** The one shape this file reads off a `Quad` — the kit does not export the type itself. */
interface DrawnQuad {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly text?: { readonly lines: readonly { readonly text: string }[] };
}

let lastPlan: readonly DrawnQuad[] = [];

vi.mock("game-kit/pixi", () => ({
  pixiPainter: () => ({
    ready: Promise.resolve(),
    draw: (plan: readonly DrawnQuad[]) => {
      lastPlan = plan;
    },
    resize: () => {},
    destroy: () => {},
  }),
}));

function container(): HTMLElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
  document.body.appendChild(el);
  return el;
}

const finger = (type: string, x: number, y: number): PointerEvent =>
  Object.assign(new MouseEvent(type, { clientX: x, clientY: y, bubbles: true }), { pointerId: 1 }) as unknown as PointerEvent;

let stop: (() => void) | undefined;

/** A fixed shuffle — the deal is random otherwise, and a hint needs a move to actually be there. */
function seededRandom(): () => number {
  let s = 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

beforeEach(() => {
  localStorage.clear();
  lastPlan = [];
  vi.useFakeTimers();
  vi.spyOn(Math, "random").mockImplementation(seededRandom());
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

/** One frame of the motion clock, flushed by hand since the timer is fake. */
function frame(): void {
  vi.advanceTimersByTime(20);
}

function mounted(): HTMLCanvasElement {
  const el = container();
  stop = startSolitaire(el);
  const view = el.querySelector("canvas") as HTMLCanvasElement;
  view.getBoundingClientRect = () => ({ width: 800, height: 600, top: 0, left: 0, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => ({}) });
  frame();
  return view;
}

function press(view: HTMLCanvasElement, x: number, y: number): void {
  view.dispatchEvent(finger("pointerdown", x, y));
  view.dispatchEvent(finger("pointerup", x, y));
  frame();
}

/** The centre of the control's own quad — the OUTER node, which is what answers a finger. */
function centreOf(id: string): { x: number; y: number } {
  const q = lastPlan.find((quad) => quad.id === id);
  if (!q) throw new Error(`no quad for ${id} — plan has: ${lastPlan.map((p) => p.id).join(", ")}`);
  return { x: q.x, y: q.y };
}

/** What the control's caption reads right now — carried on `${id}/face`, the inner node. */
function labelOf(id: string): string | undefined {
  const q = lastPlan.find((quad) => quad.id === `${id}/face`);
  return q?.text?.lines.map((l) => l.text).join("");
}

function pressHint(view: HTMLCanvasElement): void {
  const { x, y } = centreOf("hud/hint");
  press(view, x, y);
}

/** The opening tap: lays the triangle out. The deal flies one card at a time, so the clock is run
 * forward far past its total span before anything is asked to find a move on the dealt table. */
function deal(view: HTMLCanvasElement): void {
  const { x, y } = centreOf("stock");
  press(view, x, y);
  vi.advanceTimersByTime(5000);
  frame();
}

describe("the hint goes dark", () => {
  it("hint.touch-anywhere-clears-it — a press that is not the second one on the hint dismisses it", () => {
    const view = mounted();
    // Deal the table — a face-up card must exist for `findMove` to have anything to offer.
    deal(view);
    pressHint(view);
    expect(labelOf("hud/hint")).toBe("Сыграть"); // lit: the second press would play the move

    // A touch far off any pile or control — the table itself, not the button's second press.
    press(view, 780, 20);

    expect(labelOf("hud/hint")).toBe("Подсказка"); // dark again: the touch dismissed it
  });

  it("hint.times-out — a hint nobody answers goes dark on its own after four seconds", () => {
    const view = mounted();
    deal(view);
    pressHint(view);
    expect(labelOf("hud/hint")).toBe("Сыграть");

    vi.advanceTimersByTime(4000);
    frame();

    expect(labelOf("hud/hint")).toBe("Подсказка");
  });
});
