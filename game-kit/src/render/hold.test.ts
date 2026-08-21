// THE LAW THIS FILE EXISTS FOR: a long press is a finger that STAYS. Everything here is a way of
// saying that — long enough, still enough, and counted once.
//
// Time is faked, because the alternative is a suite that waits half a second per case and is flaky
// on a loaded machine. What is NOT faked is the geometry: the pick runs against a real tree.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { add, node, type Node } from "../core/node.js";
import { Bounded } from "../core/atoms/bounded.js";
import { Container, registerLayout, resetLayouts } from "../core/atoms/container.js";
import { caps } from "../core/node.js";
import { Draggable } from "../core/atoms/draggable.js";
import { freeLayout, rowLayout } from "../core/atoms/layouts.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Transformable } from "../core/atoms/transformable.js";
import { installStockSurfaces } from "../presets/surfaces.js";
import { resetSurfaces } from "./surfaces.js";
import { rect } from "../presets/shapes.js";
import { DEFAULT_VIEWER } from "../core/viewer.js";
import { type Host } from "./host.js";
import { HOLD_MS, wireHold } from "./hold.js";

/** A view that only records its listeners — the wiring asks it for nothing else worth faking. */
function stubView(): { el: HTMLCanvasElement; fire: (type: string, x: number, y: number) => void } {
  const listeners = new Map<string, (e: PointerEvent) => void>();
  const el = {
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (t: string, f: (e: PointerEvent) => void) => void listeners.set(t, f),
    removeEventListener: (t: string) => void listeners.delete(t),
  } as unknown as HTMLCanvasElement;
  return {
    el,
    fire: (type, x, y) => listeners.get(type)?.({ clientX: x, clientY: y, pointerId: 1 } as unknown as PointerEvent),
  };
}

/** Two cards side by side on an 800×600 view at 100px/unit: centres land at x 350 and 450, y 300. */
function fixture(): { fire: (t: string, x: number, y: number) => void; held: string[]; stop: () => void } {
  const desk = node("desk", Container({ layout: "row" }));
  for (const id of ["left", "right"]) add(desk, node(id, Bounded({ bounds: rect(0.9, 1.2) }), Surfaced(), Draggable()));
  const view = stubView();
  const host = {
    view: view.el,
    root: desk,
    unit: () => 100,
    viewport: () => ({ width: 800, height: 600, dpr: 1 }),
    viewer: () => DEFAULT_VIEWER,
    setRoot: () => undefined,
  } as unknown as Host;
  const held: string[] = [];
  // A hold lands on what the CONSUMER says it may land on — here, anything a hand can pick up.
  const stop = wireHold({ host, want: (n: Node) => caps(n).has("Draggable"), onHold: (n) => held.push(n.id) });
  return { fire: view.fire, held, stop };
}

beforeEach(() => {
  resetLayouts();
  registerLayout("free", freeLayout);
  registerLayout("row", rowLayout({ gap: 0.2, padding: 0 }));
  resetSurfaces();
  installStockSurfaces();
  vi.useFakeTimers();
});

describe("the long press", () => {
  it("hold.a-finger-that-stays-is-a-hold — long enough, on what the consumer allows", () => {
    const f = fixture();
    f.fire("pointerdown", 350, 300);
    expect(f.held, "not yet — the finger has only just landed").toEqual([]);
    vi.advanceTimersByTime(HOLD_MS);
    expect(f.held, "the node under the finger, not the one beside it").toEqual(["left"]);
    f.stop();
  });

  it("hold.a-short-press-is-not-one — a tap must never open a menu", () => {
    const f = fixture();
    f.fire("pointerdown", 350, 300);
    vi.advanceTimersByTime(HOLD_MS - 1);
    f.fire("pointerup", 350, 300);
    vi.advanceTimersByTime(HOLD_MS);
    expect(f.held, "released a millisecond early, and a release cancels").toEqual([]);
    f.stop();
  });

  it("hold.a-finger-that-travelled-was-going-somewhere — a drag is not a hold", () => {
    // The one that matters most in play: a hold firing mid-drag opens a menu while a card is being
    // carried, which is the single thing a player never means by moving their thumb.
    const f = fixture();
    f.fire("pointerdown", 350, 300);
    f.fire("pointermove", 380, 300);
    vi.advanceTimersByTime(HOLD_MS);
    expect(f.held).toEqual([]);
    f.stop();
  });

  it("hold.a-tremor-is-not-travel — a thumb is never perfectly still", () => {
    // Pixels, not units: zooming the desk out must not turn a steady thumb into a drag.
    const f = fixture();
    f.fire("pointerdown", 350, 300);
    f.fire("pointermove", 353, 302);
    vi.advanceTimersByTime(HOLD_MS);
    expect(f.held).toEqual(["left"]);
    f.stop();
  });

  it("hold.it-counts-once — a resting finger does not repeat", () => {
    const f = fixture();
    f.fire("pointerdown", 350, 300);
    vi.advanceTimersByTime(HOLD_MS * 4);
    expect(f.held, "one gesture, one hold, however long it lasts").toEqual(["left"]);
    f.fire("pointerup", 350, 300);
    vi.advanceTimersByTime(HOLD_MS * 4);
    expect(f.held, "and the release after it fired starts nothing").toEqual(["left"]);
    f.stop();
  });

  it("hold.nothing-under-the-finger-is-not-a-hold — empty desk stays quiet", () => {
    const f = fixture();
    f.fire("pointerdown", 50, 50);
    vi.advanceTimersByTime(HOLD_MS);
    expect(f.held).toEqual([]);
    f.stop();
  });

  it("hold.what-it-may-land-on-is-the-consumers-word — a node without the capability is passed over", () => {
    // No default `want`, on purpose: a game that holds cards and one that holds zones want different
    // answers, and a kit that guessed would be silently wrong in one of them.
    const desk = node("desk2", Container({ layout: "row" }));
    add(desk, node("plain", Bounded({ bounds: rect(0.9, 1.2) }), Surfaced(), Transformable()));
    const view = stubView();
    const host = {
      view: view.el,
      root: desk,
      unit: () => 100,
      viewport: () => ({ width: 800, height: 600, dpr: 1 }),
      viewer: () => DEFAULT_VIEWER,
      setRoot: () => undefined,
    } as unknown as Host;
    const held: string[] = [];
    const stop = wireHold({ host, want: (n: Node) => caps(n).has("Draggable"), onHold: (n) => held.push(n.id) });
    view.fire("pointerdown", 400, 300);
    vi.advanceTimersByTime(HOLD_MS);
    expect(held, "it is under the finger, but the consumer never said it counts").toEqual([]);
    stop();
  });

  it("hold.teardown-stops-the-clock — a scene that left does not fire into it", () => {
    // A story remounts on every knob turn. A timer that outlived its scene would call a handler
    // holding a tree nobody is drawing any more.
    const f = fixture();
    f.fire("pointerdown", 350, 300);
    f.stop();
    vi.advanceTimersByTime(HOLD_MS * 2);
    expect(f.held).toEqual([]);
  });
});
