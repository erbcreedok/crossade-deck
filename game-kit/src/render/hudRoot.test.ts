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
import { dockLayout, freeLayout } from "../core/atoms/layouts.js";
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
import { safeArea } from "./safeArea.js";
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
  // A REAL-SIZED PIECE OF GLASS. jsdom lays nothing out, so a bare div measures 1×1 — and a safe
  // area computed against one pixel cannot tell an edge from the middle.
  //
  // And a RESIZE OBSERVER, because turning a phone is the claim docking exists for: jsdom has none,
  // so the host would never re-measure and the test would prove only that a box can be set once.
  let observed: (() => void) | undefined;
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    constructor(cb: () => void) {
      observed = cb;
    }
    observe(): void {}
    disconnect(): void {}
  };
  const container = document.createElement("div");
  container.getBoundingClientRect = () => ({ width: 400, height: 300, x: 0, y: 0, top: 0, left: 0, right: 400, bottom: 300, toJSON: () => "" }) as DOMRect;
  const host = mount(container, desk);
  const resize = (w: number, h: number): void => {
    container.getBoundingClientRect = () => ({ width: w, height: h, x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, toJSON: () => "" }) as DOMRect;
    observed?.(); // the host re-measures exactly as it does when a real observer fires
  };
  return {
    host,
    painter,
    screen,
    resize,
    xOf: (id: string) => last.find((q) => q.id === id)?.x,
    yOf: (id: string) => last.find((q) => q.id === id)?.y,
    ids: () => last.map((q) => q.id),
  };
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
    const v = b.host.viewport();
    renderFrame(b.host, b.painter, { view: () => move(v.width / 2 + 60, v.height / 2) });
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
    const v = b.host.viewport();
    const panned = () => move(v.width / 2 + 60, v.height / 2);
    renderFrame(b.host, b.painter, { view: panned });
    const onDesk = b.xOf("widget")!;
    remove(b.host.root, widget);
    add(b.screen, widget);
    renderFrame(b.host, b.painter, { view: panned });
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

  // ── the room the HUD leaves ─────────────────────────────────────────────────────────────────
  //
  // The one thing the HUD tells the camera, and the only wire between them: a rectangle. Two layers
  // that know one rectangle about each other cannot grow a dependency out of it.

  /** A HUD plate of `w`×`h` units at `at`, so a test can put a bar on an edge on purpose. */
  const plate = (id: string, w: number, h: number, at: { x: number; y: number }) =>
    node(id, Bounded({ bounds: rect(w, h) }), Surfaced({ surface: "plain" }), Transformable({ at }));

  /** How far a point in units sits from the middle of the glass, in pixels. */
  const px = (host: ReturnType<typeof bench>["host"], units: number) => units * host.unit();

  it("safe.no-hud-leaves-the-whole-glass", () => {
    const b = bench();
    const v = b.host.viewport();
    expect(safeArea(b.host)).toEqual({ x: 0, y: 0, width: v.width, height: v.height });
  });

  it("safe.a-bar-on-an-edge-takes-a-strip-off-that-edge-alone", () => {
    // A dock takes a STRIP, which is why the answer is a rect and not an inset: three sides are
    // untouched, and a scalar would have had to be wrong about all of them.
    const b = bench();
    const v = b.host.viewport();
    const screen = node("hud", Container({ layout: "free" }));
    const wide = v.width / b.host.unit();
    const half = v.height / 2 / b.host.unit();
    add(screen, plate("bar", wide, 1, { x: 0, y: half - 0.5 })); // spans the glass, lying on the floor
    b.host.setHudRoot(screen);
    const room = safeArea(b.host);
    expect(room.x).toBe(0);
    expect(room.y).toBe(0);
    expect(room.width).toBe(v.width);
    expect(room.height).toBeLessThan(v.height);
    expect(v.height - room.height).toBeCloseTo(px(b.host, 1), 0);
  });

  it("safe.a-panel-in-the-middle-takes-nothing", () => {
    // It is HUD too, and it is not a dock. Cutting its box out would leave a hole no rectangle can
    // describe, and the desk would spend the dialogue's whole life squeezed into a corner.
    const b = bench();
    const v = b.host.viewport();
    const screen = node("hud", Container({ layout: "free" }));
    add(screen, plate("dialogue", 2, 2, { x: 0, y: 0 }));
    b.host.setHudRoot(screen);
    expect(safeArea(b.host)).toEqual({ x: 0, y: 0, width: v.width, height: v.height });
  });

  it("safe.every-edge-answers-for-itself", () => {
    const b = bench();
    const v = b.host.viewport();
    const screen = node("hud", Container({ layout: "free" }));
    const halfW = v.width / 2 / b.host.unit();
    const halfH = v.height / 2 / b.host.unit();
    add(screen, plate("rail", 1, v.height / b.host.unit(), { x: -halfW + 0.5, y: 0 }));
    add(screen, plate("bar", v.width / b.host.unit(), 1, { x: 0, y: halfH - 0.5 }));
    b.host.setHudRoot(screen);
    const room = safeArea(b.host);
    expect(room.x).toBeCloseTo(px(b.host, 1), 0); // the rail pushed the left in
    expect(room.y).toBe(0); // and said nothing about the top
    expect(v.height - room.height).toBeCloseTo(px(b.host, 1), 0); // the bar took the floor
  });

  it("safe.a-curtain-docks-nowhere — covering the glass is not docking to it", () => {
    // Spanning BOTH axes is what a full-screen overlay does, and an overlay is not a dock: it is a
    // curtain, drawn on top and hiding the desk rather than making room beside it. Read as four
    // docks at once it would leave the desk nowhere to be, which is a worse answer than the true
    // one — the desk keeps its room and is simply behind something.
    const b = bench();
    const v = b.host.viewport();
    const screen = node("hud", Container({ layout: "free" }));
    add(screen, plate("curtain", (v.width / b.host.unit()) * 2, (v.height / b.host.unit()) * 2, { x: 0, y: 0 }));
    b.host.setHudRoot(screen);
    expect(safeArea(b.host)).toEqual({ x: 0, y: 0, width: v.width, height: v.height });
  });

  it("safe.two-facing-docks-never-cross — the room bottoms out at nothing", () => {
    // Not a negative size for somebody downstream to divide by: two rails wide enough to meet in
    // the middle leave zero, and zero is what is reported.
    const b = bench();
    const v = b.host.viewport();
    const wide = v.width / b.host.unit();
    const tall = v.height / b.host.unit();
    const screen = node("hud", Container({ layout: "free" }));
    add(screen, plate("left", wide * 0.8, tall, { x: -wide * 0.3, y: 0 }));
    add(screen, plate("right", wide * 0.8, tall, { x: wide * 0.3, y: 0 }));
    b.host.setHudRoot(screen);
    const room = safeArea(b.host);
    expect(room.width).toBe(0);
  });


  // ── docking ─────────────────────────────────────────────────────────────────────────────────
  //
  // Declared ONCE and true afterwards, which is the whole ask: turn the phone and the bar is at the
  // bottom of the new glass without anybody having been told about the rotation.

  it("dock.a-bar-sits-against-the-wall-of-the-room-it-is-in", () => {
    const b = bench();
    registerLayout("dock.bottom", dockLayout("bottom", { pad: 0 }));
    const screen = node("hud", Container({ layout: "dock.bottom" }));
    add(screen, node("bar", Bounded({ bounds: rect(2, 1) }), Surfaced({ surface: "plain" }), Transformable({})));
    b.host.setHudRoot(screen);
    renderFrame(b.host, b.painter);
    const v = b.host.viewport();
    // The bar's middle sits half its own height off the floor — flush, not hanging through it.
    expect(b.yOf("bar")).toBeCloseTo(v.height - (1 * b.host.unit()) / 2, 0);
  });

  it("dock.turning-the-phone-moves-the-bar-and-nobody-was-told", () => {
    // The claim the whole variant was chosen for. The arrangement is untouched; only the room
    // changed, and the room is measured rather than declared.
    const b = bench();
    registerLayout("dock.bottom", dockLayout("bottom", { pad: 0 }));
    const screen = node("hud", Container({ layout: "dock.bottom" }));
    add(screen, node("bar", Bounded({ bounds: rect(2, 1) }), Surfaced({ surface: "plain" }), Transformable({})));
    b.host.setHudRoot(screen);
    renderFrame(b.host, b.painter);
    const portrait = b.yOf("bar")!;
    b.resize(300, 400);
    renderFrame(b.host, b.painter);
    expect(b.yOf("bar")).not.toBeCloseTo(portrait, 0);
    expect(b.yOf("bar")).toBeCloseTo(400 - (1 * b.host.unit()) / 2, 0);
  });

  it("dock.without-a-box-it-places-nobody — a wall it cannot see is not guessed at", () => {
    const b = bench();
    registerLayout("dock.bottom", dockLayout("bottom", { pad: 0 }));
    const loose = node("loose", Container({ layout: "dock.bottom" })); // no Bounded: no walls
    const bar = node("bar", Bounded({ bounds: rect(2, 1) }), Surfaced({ surface: "plain" }), Transformable({ at: { x: 0, y: 0 } }));
    add(loose, bar);
    add(b.host.root, loose);
    renderFrame(b.host, b.painter);
    const v = b.host.viewport();
    expect(b.yOf("bar")).toBeCloseTo(v.height / 2, 0); // its own pose stands, as under `free`
  });

  it("dock.the-same-arrangement-docks-inside-a-ZONE — nothing here knows about screens", () => {
    // The canon's "a widget moves between the desk and the screen by changing parent" only holds
    // while docking never mentions which root it is on. Put on a zone, the bar sits on the ZONE's
    // bottom — the same record, a smaller room.
    const b = bench();
    registerLayout("dock.bottom", dockLayout("bottom", { pad: 0 }));
    const zone = node(
      "zone",
      Bounded({ bounds: rect(4, 2) }),
      Container({ layout: "dock.bottom" }),
      Transformable({ at: { x: 0, y: 0 } }),
    );
    add(zone, node("bar", Bounded({ bounds: rect(2, 1) }), Surfaced({ surface: "plain" }), Transformable({})));
    add(b.host.root, zone);
    renderFrame(b.host, b.painter);
    const v = b.host.viewport();
    // Half the zone (1 unit) down from its middle, less half the bar (0.5) — inside the zone, not
    // on the glass's floor.
    expect(b.yOf("bar")).toBeCloseTo(v.height / 2 + 0.5 * b.host.unit(), 0);
  });
});