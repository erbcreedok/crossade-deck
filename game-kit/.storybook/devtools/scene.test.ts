// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { node } from "../../src/index.js";
import { catalogText } from "../locales/catalog.js";
import { currentSettings } from "./catalogSettings.js";
import { scene } from "./scene.js";

function hudSelect(el: HTMLElement): HTMLSelectElement {
  return el.querySelector("[data-hud-unit]") as HTMLSelectElement;
}

function choose(select: HTMLSelectElement, value: string): void {
  select.value = value;
  select.dispatchEvent(new Event("change"));
}

beforeEach(() => {
  document.body.innerHTML = "";
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

  it("scene.toolbar-follows-language — the row is captions, not baked text", () => {
    const s = scene(node("s6"));
    document.body.appendChild(s.el);
    const before = s.el.querySelector("[data-scene-toolbar]")!.textContent ?? "";
    s.setSettings({ ...currentSettings(), text: catalogText("ru") });
    expect(s.el.querySelector("[data-scene-toolbar]")!.textContent).not.toBe(before);
    s.dispose();
  });
});
