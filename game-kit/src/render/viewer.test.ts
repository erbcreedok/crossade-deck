// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { HUD_UNIT_FRACTION, mount } from "./host.js";
import { node } from "../core/node.js";
import { DEFAULT_VIEWER, withViewer } from "../core/viewer.js";

function container(w: number, h: number): HTMLElement {
  const el = document.createElement("div");
  el.getBoundingClientRect = () =>
    ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("the viewer plane cascades", () => {
  it("viewer.defaults — a host with no settings still has a full set", () => {
    const host = mount(container(800, 600), node("v1"));
    expect(host.viewer()).toEqual(DEFAULT_VIEWER);
    host.unmount();
  });

  it("viewer.reaches-context — settings arrive at resolution as defaults, not per call", () => {
    const root = node("v2");
    const host = mount(container(800, 600), root, withViewer(DEFAULT_VIEWER, { theme: "light" }));
    expect(host.contextFor(root).viewer.theme).toBe("light");
    host.unmount();
  });

  it("viewer.hud-unit-override — the accessibility knob wins over the computed etalon", () => {
    const host = mount(container(800, 600), node("v3"));
    expect(host.unit()).toBe(Math.round(600 * HUD_UNIT_FRACTION));
    host.setViewer(withViewer(DEFAULT_VIEWER, { hudUnit: 34 }));
    expect(host.unit()).toBe(34);
    // Sizes in units are untouched: only how many px one unit is worth for THIS onlooker.
    expect(host.viewport().height).toBe(600);
    host.unmount();
  });

  it("viewer.change-notifies — a mounted scene follows without being rebuilt", () => {
    const host = mount(container(400, 400), node("v4"));
    let seen = 0;
    host.onChange(() => (seen += 1));
    host.setViewer(withViewer(DEFAULT_VIEWER, { theme: "light" }));
    expect(seen).toBe(1);
    host.unmount();
  });

  it("viewer.never-state — settings live on the host, never on a node", () => {
    const root = node("v5");
    const host = mount(container(400, 400), root, withViewer(DEFAULT_VIEWER, { hudUnit: 60, theme: "light" }));
    expect(root.atoms.size).toBe(0);
    expect(JSON.stringify(root.children)).toBe("[]");
    host.unmount();
  });
});
