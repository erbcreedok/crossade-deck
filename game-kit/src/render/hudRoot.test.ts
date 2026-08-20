// @vitest-environment jsdom

// TWO ROOTS, ONE FRAME — and the difference between them is exactly one thing.
//
// The canon settles it before any code does: a camera transforms the canvas root and does not touch
// the HUD one. There is no `anchor` field to set and no second renderer to reach for; which root a
// node hangs under IS the answer, so a widget moving between the desk and the screen is a change of
// parent. These claims are read off the PLAN, because that is where the difference either exists or
// does not.

import { describe, expect, it } from "vitest";
import { Bounded } from "../core/atoms/bounded.js";
import { Container, registerLayout, resetLayouts } from "../core/atoms/container.js";
import { freeLayout } from "../core/atoms/layouts.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Transformable } from "../core/atoms/transformable.js";
import { add, node, remove } from "../core/node.js";
import { move } from "../core/transform.js";
import { rect } from "../presets/shapes.js";
import { installStockSurfaces } from "../presets/surfaces.js";
import { mount } from "./host.js";
import { registerSurface, resetSurfaces } from "./surfaces.js";
import { renderFrame } from "./stage.js";
import { pickTop } from "./pointer.js";
import { type Painter } from "./painter.js";
import { type Quad } from "./scenePlan.js";

function bench() {
  resetLayouts();
  registerLayout("free", freeLayout);
  resetSurfaces();
  installStockSurfaces();
  registerSurface("plain", { layers: [{ paint: "accent" }] });

  const desk = node("desk", Container({ layout: "free" }));
  add(desk, node("card", Bounded({ bounds: rect(1, 1) }), Surfaced({ surface: "plain" }), Transformable({})));
  const screen = node("hud", Container({ layout: "free" }));
  add(screen, node("bar", Bounded({ bounds: rect(1, 1) }), Surfaced({ surface: "plain" }), Transformable({})));

  let last: readonly Quad[] = [];
  const painter: Painter = { ready: Promise.resolve(), draw: (plan) => (last = plan), resize: () => {}, destroy: () => {} };
  const host = mount(document.createElement("div"), desk);
  return { host, painter, screen, xOf: (id: string) => last.find((q) => q.id === id)?.x, ids: () => last.map((q) => q.id) };
}

describe("the two roots", () => {
  it("hud.a-scene-with-no-hud-is-what-it-always-was", () => {
    const b = bench();
    renderFrame(b.host, b.painter);
    expect(b.ids()).toEqual(["card"]);
  });

  it("hud.the-second-root-draws-and-draws-last", () => {
    // Last, and therefore on top: a control the camera cannot reach must not be reachable by a card
    // either — a hand dealt across the screen would otherwise bury the button that ends the turn.
    const b = bench();
    b.host.setHudRoot(b.screen);
    renderFrame(b.host, b.painter);
    expect(b.ids()).toEqual(["card", "bar"]);
  });

  it("hud.the-camera-moves-the-desk-and-never-the-screen", () => {
    // THE WHOLE DIFFERENCE, in one reading. The same view is handed to the frame; the card travels
    // with it and the bar does not move a pixel.
    const b = bench();
    b.host.setHudRoot(b.screen);
    renderFrame(b.host, b.painter);
    const still = { card: b.xOf("card")!, bar: b.xOf("bar")! };
    renderFrame(b.host, b.painter, { view: () => move(3, 0) });
    expect(b.xOf("card")).toBeGreaterThan(still.card);
    expect(b.xOf("bar")).toBe(still.bar);
  });

  it("hud.taking-the-hud-away-leaves-the-desk-alone", () => {
    const b = bench();
    b.host.setHudRoot(b.screen);
    renderFrame(b.host, b.painter);
    const withHud = b.xOf("card");
    b.host.setHudRoot(undefined);
    renderFrame(b.host, b.painter);
    expect(b.ids()).toEqual(["card"]);
    expect(b.xOf("card")).toBe(withHud);
  });

  it("hud.a-widget-moves-between-them-by-changing-parent", () => {
    // No flag to flip: the same node, taken out of one root and added to the other, stops travelling
    // with the camera. That is what "there is no `anchor` field" means in practice.
    const b = bench();
    b.host.setHudRoot(b.screen);
    const widget = node("widget", Bounded({ bounds: rect(1, 1) }), Surfaced({ surface: "plain" }), Transformable({}));
    add(b.host.root, widget);
    renderFrame(b.host, b.painter, { view: () => move(3, 0) });
    const onDesk = b.xOf("widget")!;
    remove(b.host.root, widget);
    add(b.screen, widget);
    renderFrame(b.host, b.painter, { view: () => move(3, 0) });
    expect(b.xOf("widget")).toBeLessThan(onDesk); // it stopped riding the camera
  });

  it("hud.the-finger-tests-the-screen-before-the-desk", () => {
    // A hit-test that disagreed with the paint is the worst kind of wrong: a button plainly visible
    // under the finger, answering for whatever card happens to lie beneath it. Both quads sit on the
    // middle here, so only the order can tell them apart.
    const b = bench();
    b.host.setHudRoot(b.screen);
    const v = b.host.viewport();
    const middle = { x: v.width / 2, y: v.height / 2 };
    expect(pickTop(b.host, middle, () => true)?.id).toBe("bar");
    b.host.setHudRoot(undefined);
    expect(pickTop(b.host, middle, () => true)?.id).toBe("card");
  });

  it("hud.the-camera-is-handed-to-the-desk-alone", () => {
    // Panned far away, the desk's card is no longer under the finger — and the bar still is, because
    // the view never reached it. The same asymmetry the paint has, read through the finger.
    const b = bench();
    b.host.setHudRoot(b.screen);
    const v = b.host.viewport();
    const middle = { x: v.width / 2, y: v.height / 2 };
    expect(pickTop(b.host, middle, (n) => n.id === "card", move(40, 0))).toBeUndefined();
    expect(pickTop(b.host, middle, (n) => n.id === "bar", move(40, 0))?.id).toBe("bar");
  });
});
