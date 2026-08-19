// THE LAWS THIS FILE EXISTS FOR: a view has BOUNDS it may not leave, a throw DIES, and zooming is
// a ratio so that out-and-back lands where it started.
//
// None of it is checkable by eye. A camera that drifts a pixel past its edge per gesture looks fine
// for the first minute; a fling whose decay depends on the frame rate feels right on the machine it
// was tuned on and wrong on every other one; a zoom that adds instead of multiplying loses the
// place a finger was holding, which is felt as the desk squirming away from the pinch.

import { describe, expect, it } from "vitest";
import { apply, type Transform } from "../core/transform.js";
import { add, node } from "../core/node.js";
import { Bounded } from "../core/atoms/bounded.js";
import { Container, registerLayout, resetLayouts } from "../core/atoms/container.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Transformable } from "../core/atoms/transformable.js";
import { freeLayout } from "../core/atoms/layouts.js";
import { rect } from "../presets/shapes.js";
import { resetSurfaces } from "./surfaces.js";
import { installStockSurfaces } from "../presets/surfaces.js";
import { scenePlan } from "./scenePlan.js";
import { DEFAULT_VIEWER } from "../core/viewer.js";
import { Camera, FLING, NO_FLING, wheelGoesToCamera, wheelPixels, wheelZoomFactor } from "./camera.js";

/** A desk far bigger than the glass, so every axis has somewhere to go. */
function bench(limits = { minZoom: 0.25, maxZoom: 4 }): Camera {
  const c = new Camera(limits);
  c.setScreen(400, 300);
  c.setContent(2000, 2000, 1); // 2000 x 2000 units at one pixel each
  c.clamp();
  return c;
}

describe("the camera", () => {
  it("camera.the-view-never-leaves-its-bounds — however hard it is pushed", () => {
    const c = bench();
    c.panBy(10_000, 10_000);
    expect(c.x).toBe(0);
    expect(c.y).toBe(0);
    c.panBy(-10_000, -10_000);
    // the far edge: the content's right side lands on the glass's right side, never inside it
    expect(c.x).toBe(400 - 2000);
    expect(c.y).toBe(300 - 2000);
  });

  it("camera.a-desk-smaller-than-the-glass-is-centred — not pinned to a corner", () => {
    // Pinned, the whole layout jumps sideways the moment the window changes width, because a small
    // desk has no meaningful edge to be held against.
    const c = new Camera({ minZoom: 0.25, maxZoom: 4 });
    c.setScreen(400, 300);
    c.setContent(100, 50, 1);
    c.panBy(999, 999);
    expect(c.x).toBeCloseTo((400 - 100) / 2, 6);
    expect(c.y).toBeCloseTo((300 - 50) / 2, 6);
    expect(c.overflowX).toBe(false);
    expect(c.overflowY).toBe(false);
  });

  it("camera.zoom-keeps-the-point-under-the-finger — the desk does not squirm away", () => {
    const c = bench();
    const before = c.toContent(120, 80);
    c.zoomAround(120, 80, 2);
    const after = c.toContent(120, 80);
    expect(after.x).toBeCloseTo(before.x, 6);
    expect(after.y).toBeCloseTo(before.y, 6);
  });

  it("camera.a-notch-out-and-back-lands-where-it-began — the wheel multiplies, never adds", () => {
    const c = bench();
    c.setZoom(1.7);
    const was = c.zoom;
    c.zoomAround(200, 150, wheelZoomFactor(120));
    c.zoomAround(200, 150, wheelZoomFactor(-120));
    expect(c.zoom).toBeCloseTo(was, 10);
  });

  it("camera.zoom-obeys-its-limits — at both ends", () => {
    const c = bench({ minZoom: 0.5, maxZoom: 2 });
    c.setZoom(99);
    expect(c.zoom).toBe(2);
    c.setZoom(0.001);
    expect(c.zoom).toBe(0.5);
    c.zoomAround(0, 0, 1000);
    expect(c.zoom).toBe(2);
  });

  it("camera.a-throw-dies — and dies at the same rate whatever the frame rate", () => {
    const fast = bench();
    const slow = bench();
    for (const c of [fast, slow]) {
      c.grab();
      c.trackPan(-30, 0, 0.1);
      c.trackPan(-30, 0, 0.116);
      c.release();
      expect(c.flinging).toBe(true);
    }
    // one second of sliding, at 120 Hz and at 30 Hz
    for (let i = 0; i < 120; i += 1) fast.stepFling(1 / 120);
    for (let i = 0; i < 30; i += 1) slow.stepFling(1 / 30);
    // The DECAY is what has to be frame-rate independent, and it is: the two slides land within a
    // few per cent. They are not identical and are not meant to be — the position is integrated a
    // step at a time, so a coarser step samples a slightly faster velocity for slightly longer.
    // What this rules out is the mistake worth ruling out: a per-FRAME decay (`v *= 0.92` each
    // tick) makes the very same flick travel four times as far at 120 Hz as at 30.
    expect(Math.abs(fast.x / slow.x)).toBeGreaterThan(0.9);
    expect(Math.abs(fast.x / slow.x)).toBeLessThan(1.1);
    expect(fast.flinging).toBe(false);
    expect(slow.flinging).toBe(false);
  });

  it("camera.a-tremble-is-not-a-throw — and a rocket is capped", () => {
    const still = bench();
    still.grab();
    still.trackPan(-0.2, 0, 0.1);
    still.trackPan(-0.2, 0, 0.2);
    still.release();
    expect(still.flinging, "a hand coming to rest threw the desk").toBe(false);

    const wild = bench();
    wild.grab();
    // an absurd sample: a very large step across a very short gap
    wild.trackPan(-4000, 0, 0.1);
    wild.trackPan(-4000, 0, 0.101);
    wild.release();
    wild.stepFling(1 / 60);
    // capped: one frame of the throw cannot move further than the cap allows
    expect(Math.abs(wild.x)).toBeLessThanOrEqual((FLING.cap / 60) * 1.0001);
  });

  it("camera.a-throw-that-hits-the-edge-stops-pressing-against-it", () => {
    const c = bench();
    c.grab();
    c.trackPan(400, 0, 0.1);
    c.trackPan(400, 0, 0.116);
    c.release();
    for (let i = 0; i < 200; i += 1) c.stepFling(1 / 60);
    expect(c.x).toBe(0);
    expect(c.flinging).toBe(false);
  });

  it("camera.inertia-can-be-switched-off — the view stops with the finger", () => {
    const c = new Camera({ minZoom: 0.25, maxZoom: 4, fling: NO_FLING });
    c.setScreen(400, 300);
    c.setContent(2000, 2000, 1);
    c.grab();
    c.trackPan(-300, 0, 0.1);
    c.trackPan(-300, 0, 0.116);
    const parked = c.x;
    c.release();
    expect(c.flinging).toBe(false);
    expect(c.stepFling(1 / 60)).toBe(false);
    expect(c.x).toBe(parked);
  });

  it("camera.the-wheel-is-not-taken-when-there-is-nothing-to-move", () => {
    // A canvas that eats the wheel with nowhere to scroll reads as a hung site, not as a desk
    // declining to move.
    expect(wheelGoesToCamera({ zoom: false, canPan: false, inDocument: false })).toBe(false);
    expect(wheelGoesToCamera({ zoom: false, canPan: true, inDocument: false })).toBe(true);
    // …and on a page of several desks with prose between them, panning is never claimed at all.
    expect(wheelGoesToCamera({ zoom: false, canPan: true, inDocument: true })).toBe(false);
    // Zoom with a modifier always means zoom.
    expect(wheelGoesToCamera({ zoom: true, canPan: false, inDocument: true })).toBe(true);
  });

  it("camera.a-wheel-delta-arrives-in-pixels — whatever unit the browser reported", () => {
    expect(wheelPixels(3, 0, 800)).toBe(3);
    expect(wheelPixels(3, 1, 800)).toBe(48); // lines
    expect(wheelPixels(1, 2, 800)).toBe(800); // pages
  });

  it("camera.looking-at-a-point-puts-it-in-the-middle", () => {
    const c = bench();
    c.setZoom(2);
    c.lookAt({ x: 500, y: 400 });
    const middle = c.toContent(200, 150);
    expect(middle.x).toBeCloseTo(500, 6);
    expect(middle.y).toBeCloseTo(400, 6);
  });

  it("camera.the-transform-is-the-one-door — the same answer the inverse gives", () => {
    const c = bench();
    c.setZoom(1.8);
    c.panBy(-140, -90);
    const glass = apply(c.transform(), { x: 300, y: 220 });
    const back = c.toContent(glass.x, glass.y);
    expect(back.x).toBeCloseTo(300, 6);
    expect(back.y).toBeCloseTo(220, 6);
  });

  it("camera.the-state-says-where-the-view-sits — a scrollbar needs nothing else", () => {
    const c = bench();
    c.panBy(9999, 9999);
    const top = c.state();
    expect(top.scrollX).toBeCloseTo(0, 6);
    expect(top.scrollableX).toBe(true);
    expect(top.thumbX).toBeCloseTo(400 / 2000, 6);
    c.panBy(-9999, -9999);
    expect(c.state().scrollX).toBeCloseTo(1, 6);

    const small = new Camera({ minZoom: 0.25, maxZoom: 4 });
    small.setScreen(400, 300);
    small.setContent(100, 50, 1);
    small.clamp();
    expect(small.state().scrollableX).toBe(false);
    expect(small.state().thumbX).toBe(1);
  });

  it("camera.the-plan-draws-through-the-camera — and asks it again every frame", () => {
    // The seam the story rides: a view handed over ONCE would freeze at the moment the painter was
    // attached, and the desk would never pan again. So the plan takes a transform and the painter
    // takes a GETTER — this checks the first half, that a plan honours a camera at all.
    resetLayouts();
    registerLayout("free", freeLayout);
    resetSurfaces();
    installStockSurfaces();
    const desk = node("desk", Container({ layout: "free" }));
    add(desk, node("piece", Bounded({ bounds: rect(2, 2) }), Surfaced(), Transformable({ at: { x: 0, y: 0 } })));
    const at = (view?: Transform): number =>
      scenePlan({ root: desk, unit: 10, width: 400, height: 300, viewer: DEFAULT_VIEWER, ...(view ? { view } : {}) }).find(
        (q) => q.id === "piece",
      )!.x;

    const c = bench();
    c.setContent(2000, 2000, 10);
    c.panBy(-500, 0);
    expect(at(c.transform())).not.toBeCloseTo(at(), 3);
    // …and it is the camera's own answer, not an approximation of it.
    expect(at(c.transform())).toBeCloseTo(apply(c.transform(), { x: 0, y: 0 }).x, 6);
  });

  it("camera.fit-shows-the-whole-desk — and still obeys the limits", () => {
    const c = bench({ minZoom: 0.01, maxZoom: 4 });
    // the tighter side decides — 300 px of glass against 2000 units of desk
    expect(c.fitZoom()).toBeCloseTo(300 / 2000, 6);
    const floored = new Camera({ minZoom: 0.5, maxZoom: 4 });
    floored.setScreen(400, 300);
    floored.setContent(2000, 2000, 1);
    expect(floored.fitZoom(), "a fit below the limit is still the limit").toBe(0.5);
  });
});
