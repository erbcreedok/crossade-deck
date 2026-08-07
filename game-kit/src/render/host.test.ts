// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { node } from "../core/node.js";
import { HUD_UNIT_FRACTION, mount } from "./host.js";

function container(w: number, h: number): HTMLElement {
  const el = document.createElement("div");
  // jsdom has no layout, so the box is supplied rather than measured.
  el.getBoundingClientRect = () => ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h, x: 0, y: 0, toJSON: () => ({}) });
  document.body.appendChild(el);
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
});

describe("host", () => {
  it("host.owns-pixels — the node knows units, the host knows the viewport", () => {
    const root = node("h1");
    const host = mount(container(800, 600), root);
    expect(host.viewport().width).toBe(800);
    expect(host.viewport().height).toBe(600);
    // Nothing about pixels reached the node.
    expect(root.atoms.size).toBe(0);
    host.unmount();
  });

  it("host.hud-unit-from-viewport — the etalon is a fraction of the SHORTER side", () => {
    const host = mount(container(1000, 400), node("h2"));
    expect(host.unit()).toBe(Math.round(400 * HUD_UNIT_FRACTION));
    host.unmount();
  });

  it("host.view-not-called-canvas — the element is a canvas, the name is view", () => {
    const host = mount(container(320, 240), node("h3"));
    expect(host.view.tagName.toLowerCase()).toBe("canvas");
    expect(host.view.isConnected).toBe(true);
    host.unmount();
  });

  it("host.mount-unmount — nothing is left behind", () => {
    const el = container(320, 240);
    const host = mount(el, node("h4"));
    expect(el.children.length).toBe(1);
    host.unmount();
    expect(el.children.length).toBe(0);
  });

  it("host.context-carries-unit — resolution gets the etalon and the chain", () => {
    const root = node("h5");
    const host = mount(container(600, 600), root);
    const ctx = host.contextFor(root);
    expect(ctx.unit).toBe(150);
    expect(ctx.chain).toEqual([root]);
    host.unmount();
  });
});
