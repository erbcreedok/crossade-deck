// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { Bounded, node, rect, Surfaced, type Mark, type Painter, type Quad } from "../../src/index.js";
import { catalogText } from "../locales/catalog.js";
import { currentSettings } from "./catalogSettings.js";
import { liveReports, setNextSceneId } from "./inspectorBus.js";
import { lazyPixiPainter, scene as buildScene } from "./scene.js";

// jsdom has no WebGL, so a real painter cannot be built here — it fails asynchronously, which
// is worse than failing outright: the suite goes green with unhandled rejections behind it.
// The recording stub is also the only way to assert WHAT the shell asked to be drawn.
let drawn: readonly Quad[] = [];
let marked: readonly Mark[] = [];

function stubPainter(): Painter {
  return {
    ready: Promise.resolve(),
    draw: (plan, marks) => {
      drawn = plan;
      marked = marks;
    },
    resize: () => {},
    destroy: () => {},
  };
}

const scene: typeof buildScene = (root, options = {}, settings = currentSettings()) =>
  buildScene(root, options, settings, stubPainter);

function hudSelect(el: HTMLElement): HTMLSelectElement {
  return el.querySelector("[data-hud-unit]") as HTMLSelectElement;
}

function boundsButton(el: HTMLElement): HTMLButtonElement {
  return el.querySelector("[data-debug-bounds]") as HTMLButtonElement;
}

function gridButton(el: HTMLElement): HTMLButtonElement {
  return el.querySelector("[data-debug-grid]") as HTMLButtonElement;
}

function press(el: HTMLElement): void {
  boundsButton(el).dispatchEvent(new Event("click"));
}

function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event("change"));
}

beforeEach(() => {
  document.body.innerHTML = "";
  drawn = [];
  marked = [];
});

describe("a canvas carries its own settings", () => {
  it("scene.toolbar-drives-this-canvas — the etalon comes from the row above the view", () => {
    const s = scene(node("s1"));
    document.body.appendChild(s.el);
    choose(hudSelect(s.el), "34");
    expect(s.host.unit()).toBe(34);
    s.dispose();
  });

  it("scene.toolbar-auto-releases — back to auto REMOVES the override, not sets a number", () => {
    const s = scene(node("s2"));
    document.body.appendChild(s.el);
    choose(hudSelect(s.el), "60");
    expect(s.host.viewer().hudUnit).toBe(60);
    choose(hudSelect(s.el), "auto");
    expect(s.host.viewer().hudUnit).toBeUndefined();
    s.dispose();
  });

  it("scene.two-canvases-differ — one page, two scenes, two etalons", () => {
    const a = scene(node("s3"));
    const b = scene(node("s4"));
    document.body.append(a.el, b.el);
    choose(hudSelect(a.el), "34");
    choose(hudSelect(b.el), "60");
    expect(a.host.unit()).toBe(34);
    expect(b.host.unit()).toBe(60);
    a.dispose();
    b.dispose();
  });

  it("scene.catalog-cannot-overrule — a language change does not reset the etalon", () => {
    const s = scene(node("s5"));
    document.body.appendChild(s.el);
    choose(hudSelect(s.el), "46");
    s.setSettings({ ...currentSettings(), text: catalogText("ru") });
    expect(s.host.unit()).toBe(46);
    s.dispose();
  });

  it("scene.paints-what-the-tree-holds — the shell hands the plan on, it does not invent one", () => {
    const s = scene(node("s7", Bounded(), Surfaced()));
    document.body.appendChild(s.el);
    expect(drawn.map((q) => q.id)).toEqual(["s7"]);
    s.dispose();
  });

  it("shell.motion-speed-is-a-header-global — the viewer's speed rides the catalog settings into every canvas, and the tuning follows the sliders", () => {
    // The speed is the ONLOOKER's (viewer plane), so it arrives with the catalog's settings — the
    // header's ladder — not as an argument of a story; a re-render with new settings updates the
    // standing host. And a re-render with a `motion` patch RETUNES the standing clock rather than
    // building a second one.
    const base = currentSettings();
    setNextSceneId("story:speed");
    const s = scene(node("sp", Bounded(), Surfaced()), { animate: true, motion: { settleMs: 100 } }, { ...base, viewer: { ...base.viewer, motionSpeed: 0.5 } });
    document.body.appendChild(s.el);
    expect(s.host.viewer().motionSpeed).toBe(0.5);
    expect(s.motions!.tuning().settleMs).toBe(100);

    setNextSceneId("story:speed");
    scene(node("sp2", Bounded(), Surfaced()), { animate: true, motion: { settleMs: 700 } }, { ...base, viewer: { ...base.viewer, motionSpeed: 2 } });
    expect(s.host.viewer().motionSpeed).toBe(2);
    expect(s.motions!.tuning().settleMs).toBe(700);
    s.dispose();
  });

  it("scene.animate-hands-over-the-clock — a drag story gets the runtime, a still scene has none", () => {
    // The handle must be the LIVE one, not decorative: a grab paints the node at the finger,
    // which only the runtime driving this very painter can do. A second runtime would be a
    // second clock on the same glass — the exact thing `attachMotion`'s contract forbids.
    const still = scene(node("sA", Bounded(), Surfaced()));
    expect(still.motions).toBeUndefined();
    still.dispose();

    const s = scene(node("sB", Bounded(), Surfaced()), { animate: true });
    document.body.appendChild(s.el);
    expect(s.motions).toBeTruthy();
    const before = drawn.find((q) => q.id === "sB")!.transform;
    s.motions!.grab([{ id: "sB", offset: { x: 0, y: 0 } }], { anchor: { x: 2, y: 0 } });
    const after = drawn.find((q) => q.id === "sB")!.transform;
    expect(after.e).not.toBe(before.e);
    s.dispose();
  });

  it("scene.note-earns-its-words — 'nothing is drawn' belongs only to an empty plan", () => {
    // Printing it under a painted square would teach the exact opposite of the lesson the
    // sentence exists for.
    const empty = scene(node("s8"));
    const painted = scene(node("s9", Bounded(), Surfaced()));
    document.body.append(empty.el, painted.el);
    const words = (s: { el: HTMLElement }): string => s.el.textContent ?? "";
    expect(words(empty)).toContain("nothing is drawn");
    expect(words(painted)).not.toContain("nothing is drawn");
    empty.dispose();
    painted.dispose();
  });

  it("scene.repaints-on-a-viewer-change — the etalon is a size, so the picture follows it", () => {
    const s = scene(node("s10", Bounded(), Surfaced()));
    document.body.appendChild(s.el);
    choose(hudSelect(s.el), "34");
    const small = drawn[0]!.w;
    choose(hudSelect(s.el), "60");
    expect(drawn[0]!.w).toBeGreaterThan(small);
    s.dispose();
  });

  it("scene.bounds-toggle — the box is shown because somebody asked, and only then", () => {
    // A node with a box and nothing that paints. Until the toggle is pressed the scene is
    // empty and the box has to be taken on trust — which is the state this button exists for.
    const s = scene(node("s11", Bounded()));
    document.body.appendChild(s.el);
    expect(drawn).toEqual([]);
    expect(marked).toEqual([]);

    press(s.el);
    // The box outline plus the two strokes of the origin cross: `(0,0)` is the point `at` puts
    // somewhere and a rotation turns about, and until it was drawn nothing on screen said where
    // it was — a pasted shape can sit far off its own origin.
    expect(marked.map((m) => m.id)).toEqual(["s11", "s11", "s11"]);
    expect(marked.filter((m) => m.closed)).toHaveLength(1);
    expect(drawn).toEqual([]); // still nothing PAINTED: tooling is not a surface

    press(s.el);
    expect(marked).toEqual([]);
    s.dispose();
  });


  it("scene.grid-toggle — a second debug layer, and it is this canvas's own", () => {
    // Two layers that answer different questions: the outline says where a node is, the grid
    // says how big anything is. Both are settings of the CANVAS, so a page holding two scenes
    // gets two answers.
    const a = scene(node("s24", Bounded()));
    const b = scene(node("s25", Bounded()));
    document.body.append(a.el, b.el);
    expect(a.host.viewer().debugGrid).toBe(false);

    gridButton(a.el).dispatchEvent(new Event("click"));
    expect(a.host.viewer().debugGrid).toBe(true);
    expect(b.host.viewer().debugGrid).toBe(false);
    // And it did not switch the other layer on with it.
    expect(a.host.viewer().debugBounds).toBe(false);
    a.dispose();
    b.dispose();
  });
  it("scene.bounds-is-this-canvas-only — two scenes on a page, two answers", () => {
    // Same reasoning as the etalon: a debug layer belongs to the canvas it is drawn over, and
    // one switch above them all would claim to speak for every one.
    const a = scene(node("s12", Bounded()));
    const b = scene(node("s13", Bounded()));
    document.body.append(a.el, b.el);
    press(a.el);
    expect(a.host.viewer().debugBounds).toBe(true);
    expect(b.host.viewer().debugBounds).toBe(false);
    a.dispose();
    b.dispose();
  });

  it("scene.bounds-survives-a-catalog-change — a language switch is not an opinion on tooling", () => {
    const s = scene(node("s14", Bounded()));
    document.body.appendChild(s.el);
    press(s.el);
    s.setSettings({ ...currentSettings(), text: catalogText("ru") });
    expect(s.host.viewer().debugBounds).toBe(true);
    expect(boundsButton(s.el).getAttribute("aria-pressed")).toBe("true");
    s.dispose();
  });

  it("scene.select-is-capped-not-truncated — the control shrinks, the choices do not", () => {
    // A select sizes itself to its WIDEST option, and the widest here is a sentence: on a
    // phone it took two thirds of the row and pushed the toggle beside it off the screen.
    // Capping the CONTROL is safe only because the open list is drawn by the platform and
    // still sizes to its content — so the cap must never be a shorter caption instead.
    const s = scene(node("s15"));
    document.body.appendChild(s.el);
    const select = hudSelect(s.el);
    expect(select.style.maxWidth).toBeTruthy();
    expect(select.style.textOverflow).toBe("ellipsis");
    // The long caption is still there in full, ready for the popup.
    expect([...select.options].some((o) => o.textContent!.length > 20)).toBe(true);
    s.dispose();
  });

  it("scene.a-rerender-feeds-the-scene — the same canvas, a different tree", () => {
    // Storybook calls the story again for every argument change. Building a second scene per
    // call spends a WebGL context per keystroke — a browser hands out about a dozen — and
    // throws away the toolbar with it.
    setNextSceneId("story:x");
    const first = scene(node("s16"));
    document.body.appendChild(first.el);

    setNextSceneId("story:x");
    const again = scene(node("s17"));

    expect(again).toBe(first);
    expect(again.host.view).toBe(first.host.view);
    // What changed is the DATA: the view now shows the tree that arrived second.
    expect(again.host.root.id).toBe("s17");
    expect(liveReports().map((r) => r.sceneId)).toEqual(["story:x"]);
    again.dispose();
  });

  it("scene.settings-survive-new-data — the viewer is not what changed", () => {
    // The etalon and the bounds layer belong to this canvas and to the person looking at it.
    // An argument is neither, and it used to reset both by rebuilding the shell around them.
    setNextSceneId("story:z");
    const s = scene(node("s20"));
    document.body.appendChild(s.el);
    choose(hudSelect(s.el), "34");
    press(s.el);

    setNextSceneId("story:z");
    scene(node("s21"));

    expect(s.host.unit()).toBe(34);
    expect(s.host.viewer().debugBounds).toBe(true);
    s.dispose();
  });

  it("scene.a-tree-swap-redraws — a scene nobody told is a scene showing the old data", () => {
    setNextSceneId("story:w");
    const s = scene(node("s22", Bounded(), Surfaced()));
    document.body.appendChild(s.el);
    expect(drawn.length).toBe(1);

    s.setRoot(node("s23"));
    // A bare node paints nothing, so the plan empties — and it only empties if the swap
    // announced itself the way a resize does.
    expect(drawn).toEqual([]);
    s.dispose();
  });

  it("scene.dispose-retires-only-itself — a stale handle cannot silence the live scene", () => {
    setNextSceneId("story:y");
    const first = scene(node("s18"));
    first.dispose();
    // The slot is free, so the next call builds rather than feeds.
    setNextSceneId("story:y");
    const second = scene(node("s19"));
    document.body.appendChild(second.el);
    expect(second).not.toBe(first);

    first.dispose(); // already retired; must not clear the slot the live scene holds
    expect(liveReports().map((r) => r.sceneId)).toEqual(["story:y"]);
    second.dispose();
    expect(liveReports()).toEqual([]);
  });

  it("scene.toolbar-follows-language — the row is captions, not baked text", () => {
    const s = scene(node("s6"));
    document.body.appendChild(s.el);
    const before = s.el.querySelector("[data-scene-toolbar]")!.textContent ?? "";
    s.setSettings({ ...currentSettings(), text: catalogText("ru") });
    expect(s.el.querySelector("[data-scene-toolbar]")!.textContent).not.toBe(before);
    s.dispose();
  });
  it("scene.two-scenes-one-id — the second call FEEDS the first, it does not build a second", () => {
    // The single most expensive mistake this shell can make. Storybook calls a story again for
    // every argument change and expects an element back; take that literally and each keystroke
    // builds another host, another painter and another WebGL context. A browser hands out about
    // a dozen before it starts taking them back, so one drag of a range control spends them all
    // and the canvas goes blank with a "context lost" nobody can trace to a slider.
    //
    // Same id, twice: one element, one host, and the tree of the second call showing in it.
    setNextSceneId("shared");
    const first = scene(node("one", Bounded({ bounds: rect(1, 1) })));
    setNextSceneId("shared");
    const again = scene(node("two", Bounded({ bounds: rect(2, 2) })));
    expect(again).toBe(first);
    expect(again.el).toBe(first.el);
    expect(again.host).toBe(first.host);
    expect(again.host.root.id).toBe("two");
    first.dispose();
  });
});

// The renderer arrives through a dynamic import and then STARTS asynchronously, and a resize
// can land anywhere in that window — on a phone the page's layout usually settles exactly
// there. The mock below keeps the real renderer's awkward contract (a resize before start is
// refused), because that contract is what the wrapper has to survive.
vi.mock("../../src/render/pixi.js", () => ({
  pixiPainter: (_view: HTMLCanvasElement, size: { width: number; height: number }) => {
    fake = {
      initSize: { ...size },
      sizedTo: [],
      drawnAfterStart: 0,
      started: false,
      start: () => undefined,
    };
    const ready = new Promise<void>((release) => {
      fake!.start = () => {
        fake!.started = true;
        release();
      };
    });
    return {
      ready,
      draw: () => {
        if (fake!.started) fake!.drawnAfterStart += 1;
      },
      resize: (w: number, h: number) => {
        if (fake!.started) fake!.sizedTo.push([w, h]);
      },
      destroy: () => undefined,
    };
  },
}));

interface FakePixi {
  initSize: { width: number; height: number };
  sizedTo: [number, number][];
  drawnAfterStart: number;
  started: boolean;
  start: () => void;
}
let fake: FakePixi | undefined;

describe("the lazy painter against a renderer that starts late", () => {
  it("scene.a-resize-mid-start-is-not-lost — the renderer wakes at the latest size", async () => {
    // The failure this pins down was caught on a phone: the scene measured before layout — one
    // pixel — the layout settled while the renderer was still starting, and the resize from
    // that window was refused by a renderer that could not take it yet. Nothing ever resized
    // again, so the canvas stayed one pixel: an empty scene that any later toggle "fixed".
    fake = undefined;
    const view = document.createElement("canvas");
    const painter = lazyPixiPainter(view, { width: 1, height: 1, resolution: 1 });
    const quad: Quad[] = [];
    painter.draw(quad, [], "dark");

    // Let the (mocked) import land so the real renderer exists but has NOT started.
    await vi.waitFor(() => {
      expect(fake, "the renderer was never constructed").toBeTruthy();
    });
    expect(fake!.initSize).toEqual({ width: 1, height: 1, resolution: 1 });

    // The layout settles now — inside the start window — and the renderer refuses the call.
    painter.resize(390, 500);
    expect(fake!.sizedTo).toEqual([]);

    fake!.start();
    await painter.ready;

    // The wrapper re-asserts the latest size and frame the moment the renderer can listen.
    expect(fake!.sizedTo).toEqual([[390, 500]]);
    expect(fake!.drawnAfterStart).toBeGreaterThan(0);
  });
});
