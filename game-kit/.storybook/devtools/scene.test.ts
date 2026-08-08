// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { Bounded, node, Surfaced, type Mark, type Painter, type Quad } from "../../src/index.js";
import { catalogText } from "../locales/catalog.js";
import { currentSettings } from "./catalogSettings.js";
import { liveReports, setNextSceneId } from "./inspectorBus.js";
import { scene as buildScene } from "./scene.js";

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

const scene: typeof buildScene = (root, settings = currentSettings()) => buildScene(root, settings, stubPainter);

function hudSelect(el: HTMLElement): HTMLSelectElement {
  return el.querySelector("[data-hud-unit]") as HTMLSelectElement;
}

function boundsButton(el: HTMLElement): HTMLButtonElement {
  return el.querySelector("[data-debug-bounds]") as HTMLButtonElement;
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
    expect(marked.map((m) => m.id)).toEqual(["s11"]);
    expect(drawn).toEqual([]); // still nothing PAINTED: tooling is not a surface

    press(s.el);
    expect(marked).toEqual([]);
    s.dispose();
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

  it("scene.rebuild-retires-the-old-one — a slider must not leak a GPU context per step", () => {
    // Storybook rebuilds a story on every argument change and never tells the old element to
    // go away. A browser hands out about a dozen WebGL contexts; a range control would spend
    // them in one drag.
    setNextSceneId("story:x");
    const first = scene(node("s16"));
    document.body.appendChild(first.el);

    setNextSceneId("story:x");
    const second = scene(node("s17"));
    document.body.appendChild(second.el);

    // The first is gone: unmounted, unsubscribed, and no longer speaking for a tree.
    expect(first.host.view.isConnected).toBe(false);
    expect(second.host.view.isConnected).toBe(true);
    expect(liveReports().map((r) => r.sceneId)).toEqual(["story:x"]);
    second.dispose();
  });

  it("scene.dispose-retires-only-itself — a stale handle cannot silence the live scene", () => {
    setNextSceneId("story:y");
    const first = scene(node("s18"));
    setNextSceneId("story:y");
    const second = scene(node("s19"));
    document.body.appendChild(second.el);

    first.dispose(); // already replaced; must be a no-op for the slot
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
});
