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
import {
  Camera,
  FLING,
  NO_FLING,
  TURN_FLING,
  ZOOM_FLING,
  wheelGoesToCamera,
  wheelPixels,
  wheelZoomFactor,
} from "./camera.js";

/** A desk far bigger than the glass, so every axis has somewhere to go. */
function bench(limits = { minZoom: 0.25, maxZoom: 4 }): Camera {
  const c = new Camera(limits);
  c.setScreen(400, 300);
  c.setContent({ x: 0, y: 0, w: 2000, h: 2000 }, 1); // 2000 × 2000 units at one pixel each
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
    c.setContent({ x: 0, y: 0, w: 100, h: 50 }, 1);
    c.panBy(999, 999);
    expect(c.x).toBeCloseTo((400 - 100) / 2, 6);
    expect(c.y).toBeCloseTo((300 - 50) / 2, 6);
    expect(c.overflowX).toBe(false);
    expect(c.overflowY).toBe(false);
  });

  it("camera.a-desk-laid-out-around-zero-stops-at-its-own-edges", () => {
    // THE KIT'S DESKS ARE CENTRED ON THE ORIGIN — a table spanning -1000…1000 is 2000 wide and
    // begins at -1000. Told only "2000 wide", a camera holds the view inside the quarter that
    // starts at zero, and every clamp, every scrollbar and every fit reads perfectly correct
    // while three quarters of the desk cannot be reached at all.
    const c = new Camera({ minZoom: 0.25, maxZoom: 4 });
    c.setScreen(400, 300);
    c.setContent({ x: -1000, y: -1000, w: 2000, h: 2000 }, 1);
    c.lookAt({ x: 0, y: 0 });
    // Centred: the middle of the glass shows the middle of the desk.
    expect(c.toContent(200, 150)).toEqual({ x: 0, y: 0 });
    c.panBy(10_000, 10_000);
    // Pushed to the top-left stop, the desk's own corner is on the glass's corner.
    expect(c.toContent(0, 0).x).toBeCloseTo(-1000, 6);
    expect(c.toContent(0, 0).y).toBeCloseTo(-1000, 6);
    expect(c.state().scrollX).toBeCloseTo(0, 6);
    c.panBy(-10_000, -10_000);
    expect(c.toContent(400, 300).x).toBeCloseTo(1000, 6);
    expect(c.toContent(400, 300).y).toBeCloseTo(1000, 6);
    expect(c.state().scrollX).toBeCloseTo(1, 6);
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
    const c = new Camera({ minZoom: 0.25, maxZoom: 4, inertia: { pan: NO_FLING } });
    c.setScreen(400, 300);
    c.setContent({ x: 0, y: 0, w: 2000, h: 2000 }, 1);
    c.grab();
    c.trackPan(-300, 0, 0.1);
    c.trackPan(-300, 0, 0.116);
    const parked = c.x;
    c.release();
    expect(c.flinging).toBe(false);
    expect(c.stepFling(1 / 60)).toBe(false);
    expect(c.x).toBe(parked);
  });

  it("camera.a-zoom-coasts-and-dies — and holds the spot it was let go over", () => {
    // The zoom keeps its speed in LOG space, where a decay is symmetric: coasting outwards has to
    // die exactly as coasting inwards does, or letting go while zooming out feels like a different
    // mechanism from letting go while zooming in.
    const out = bench({ minZoom: 0.05, maxZoom: 8 });
    const held = { x: 120, y: 90 };
    out.trackPinch(1, 0, 0.1);
    out.trackPinch(1.25, 0, 0.116); // a quarter bigger in sixteen milliseconds
    out.release(held);
    expect(out.flinging).toBe(true);
    const started = out.zoom;
    out.stepFling(1 / 60);
    expect(out.zoom).toBeGreaterThan(started);
    // The spot under the fingers does not move while it coasts — a lurch at the exact moment the
    // hand lets go is worse than no coast at all.
    const spot = out.toContent(held.x, held.y);
    for (let i = 0; i < 200; i += 1) out.stepFling(1 / 60);
    expect(out.toContent(held.x, held.y).x).toBeCloseTo(spot.x, 4);
    expect(out.flinging, "the coast never stopped").toBe(false);

    // …and the mirror flick lands on the exact RECIPROCAL zoom, which is what log space buys: the
    // same gesture out and in travels the same distance, and a linear model — where the speed is a
    // difference rather than a ratio — does not, so zooming out would coast further than zooming in
    // from the very same flick. Kept gentle so the cap does not flatten both to the same number.
    const coastTo = (step: number): number => {
      const c = bench({ minZoom: 0.05, maxZoom: 8 });
      c.trackPinch(1, 0, 0.1);
      c.trackPinch(step, 0, 0.116);
      c.release(held);
      for (let i = 0; i < 400 && c.stepFling(1 / 60); i += 1);
      return c.zoom;
    };
    expect(coastTo(1.03) * coastTo(1 / 1.03)).toBeCloseTo(1, 9);
  });

  it("camera.a-turn-coasts-and-dies", () => {
    const c = bench();
    c.trackPinch(1, 0, 0.1);
    c.trackPinch(1, 6, 0.116); // six degrees in sixteen milliseconds — a real spin
    c.release();
    expect(c.flinging).toBe(true);
    const was = c.rotation;
    c.stepFling(1 / 60);
    expect(c.rotation).toBeGreaterThan(was);
    for (let i = 0; i < 300; i += 1) c.stepFling(1 / 60);
    expect(c.flinging).toBe(false);
  });

  it("camera.each-axis-coasts-on-its-own-switch — and a pinch never throws the pan", () => {
    // Three feels in three units, so three switches: a desk may coast under the hand while its
    // zoom stops dead. And no rule is needed to keep a pinch from sliding the desk — a gesture
    // that only zoomed never fed a pan velocity, so there is nothing to throw.
    const still = new Camera({
      minZoom: 0.05,
      maxZoom: 8,
      inertia: { zoom: NO_FLING, turn: NO_FLING },
    });
    still.setScreen(400, 300);
    still.setContent({ x: 0, y: 0, w: 2000, h: 2000 }, 1);
    still.clamp();
    const was = { zoom: still.zoom, rotation: still.rotation, x: still.x };
    still.trackPinch(1, 0, 0.1);
    still.trackPinch(1.25, 6, 0.116);
    still.release();
    expect(still.flinging, "an axis with no inertia threw anyway").toBe(false);
    expect(still.zoom).toBe(was.zoom);
    expect(still.rotation).toBe(was.rotation);

    // The other way round: the zoom coasts, the pan does not budge.
    const zoomy = bench({ minZoom: 0.05, maxZoom: 8 });
    zoomy.trackPinch(1, 0, 0.1);
    zoomy.trackPinch(1.25, 0, 0.116);
    zoomy.release({ x: 200, y: 150 });
    const middle = zoomy.toContent(200, 150);
    for (let i = 0; i < 60; i += 1) zoomy.stepFling(1 / 60);
    expect(zoomy.zoom).toBeGreaterThan(1);
    expect(zoomy.toContent(200, 150).x).toBeCloseTo(middle.x, 4);
  });

  it("camera.the-stock-inertias-are-in-their-own-units", () => {
    // One shape, three quantities: pixels a second, log-zoom a second, degrees a second. Written as
    // one number for all three, a flick of the zoom would be measured against a floor meant for a
    // hand crossing a desk, and would never coast at all.
    expect(FLING.floor).toBeGreaterThan(ZOOM_FLING.floor);
    expect(TURN_FLING.floor).toBeGreaterThan(ZOOM_FLING.floor);
    expect(ZOOM_FLING.cap).toBeLessThan(FLING.cap);
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
    small.setContent({ x: 0, y: 0, w: 100, h: 50 }, 1);
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
    c.setContent({ x: 0, y: 0, w: 2000, h: 2000 }, 10);
    c.panBy(-500, 0);
    expect(at(c.transform())).not.toBeCloseTo(at(), 3);
    // …and it is the camera's own answer, not an approximation of it.
    expect(at(c.transform())).toBeCloseTo(apply(c.transform(), { x: 0, y: 0 }).x, 6);
  });

  it("camera.a-turn-goes-around-the-target — a seat is a literal, not a mechanism", () => {
    // The whole reason the state is `{ target, zoom, rotation }` and not `{ x, y, zoom }`: "seat
    // this player at 45° facing the middle" has to be data. If a turn went around the glass's
    // corner, or around the desk's origin, seating anyone would need code of its own.
    const c = bench();
    c.lookAt({ x: 640, y: 480 });
    const middle = c.toContent(200, 150);
    c.turnTo(45);
    const after = c.toContent(200, 150);
    expect(after.x).toBeCloseTo(middle.x, 6);
    expect(after.y).toBeCloseTo(middle.y, 6);
    expect(c.state().rotation).toBe(45);
    // …and the desk really did turn: a step along the desk's x now goes diagonally on the glass.
    const o = apply(c.transform(), { x: 640, y: 480 });
    const along = apply(c.transform(), { x: 641, y: 480 });
    expect(along.x - o.x).toBeCloseTo(Math.cos(Math.PI / 4), 6);
    expect(along.y - o.y).toBeCloseTo(Math.sin(Math.PI / 4), 6);
  });

  it("camera.a-drag-under-a-turn-follows-the-hand — not the desk's own axis", () => {
    // A screen delta has to become a TARGET delta turned back through the camera's angle. Skip the
    // inverse turn and a desk at 30° slides off sideways under a finger going straight down — the
    // kind of wrong that reads as a broken touch layer rather than as a missing matrix.
    const c = bench();
    c.turnTo(30);
    const held = c.toContent(200, 150);
    c.panBy(-40, 25);
    const now = apply(c.transform(), held);
    expect(now.x).toBeCloseTo(200 - 40, 6);
    expect(now.y).toBeCloseTo(150 + 25, 6);
  });

  it("camera.a-turned-desk-is-held-by-its-upright-box", () => {
    // What stays inside the glass is the upright box around the TURNED desk. A desk at 45° is
    // therefore reachable less far than a square one — deliberately: the alternative reaches
    // further one way and stops sooner another, for a reason no player could guess by looking.
    const c = bench();
    c.turnTo(45);
    c.panBy(10_000, 10_000);
    const box = c.state();
    expect(box.scrollX).toBeCloseTo(0, 6);
    expect(box.scrollY).toBeCloseTo(0, 6);
    // The corner of the turned desk sits on the corner of the glass, not inside it: at 45° the
    // topmost point of the box is the desk's own top corner.
    const inv = [
      { x: 0, y: 0 },
      { x: 2000, y: 0 },
      { x: 2000, y: 2000 },
      { x: 0, y: 2000 },
    ].map((p) => apply(c.transform(), p));
    expect(Math.min(...inv.map((p) => p.x))).toBeCloseTo(0, 6);
    expect(Math.min(...inv.map((p) => p.y))).toBeCloseTo(0, 6);
  });

  it("camera.fit-measures-the-turned-desk — a square desk at 45° needs more room", () => {
    const c = bench({ minZoom: 0.001, maxZoom: 4 });
    const square = c.fitZoom();
    c.turnTo(45);
    // Its diagonal is what has to fit now: √2 wider, so the fit is √2 smaller.
    expect(c.fitZoom()).toBeCloseTo(square / Math.SQRT2, 6);
  });

  it("camera.a-pitch-lays-the-desk-back — and the horizon does not roll with it", () => {
    // The tilt belongs to the CAMERA, not to the desk: a head laid back squashes what it sees along
    // the SCREEN's vertical, whichever way the desk is turned underneath. Composed inside the roll
    // instead, turning the view would carry the tilt round with it and the horizon would spin.
    const c = bench();
    c.lookAt({ x: 1000, y: 1000 });
    const flat = c.transform();
    c.pitch = 60;
    const laid = c.transform();
    // Half the height (cos 60), full width — measured on the vectors, not on a corner.
    expect(laid.a).toBeCloseTo(flat.a, 9);
    expect(laid.d).toBeCloseTo(flat.d * 0.5, 6);
    // Rolled, the squash is still the screen's: a horizontal step of the DESK now has a vertical
    // component, and it is the halved one.
    c.turnTo(90);
    const rolled = c.transform();
    expect(rolled.b).toBeCloseTo(c.zoom * 0.5, 6); // desk +x goes down the screen, at half height
    expect(rolled.c).toBeCloseTo(-c.zoom, 6); // desk +y goes left, at full width
  });

  it("camera.a-pitch-never-collapses-the-desk", () => {
    // Ninety degrees is edge-on, and edge-on is not a view: every quad zero pixels tall, every
    // inverse singular, and a picture no reader can tell from a renderer that died.
    const c = bench();
    c.pitch = 90;
    expect(c.squash).toBeGreaterThan(0);
    const there = c.toContent(200, 150);
    expect(Number.isFinite(there.x) && Number.isFinite(there.y)).toBe(true);
  });

  it("camera.fit-measures-the-laid-back-desk — a squashed desk needs less height", () => {
    // A desk laid back is shorter on the glass, so more of it fits: a fit that ignored the pitch
    // would leave a third of the screen empty at sixty degrees.
    const c = bench({ minZoom: 0.001, maxZoom: 4 });
    // 2000 units of desk on 400×300 of glass: upright, the HEIGHT is what binds (300/2000).
    expect(c.fitZoom()).toBeCloseTo(300 / 2000, 6);
    c.pitch = 60;
    // Laid back it is half as tall, so the height stops binding and the WIDTH takes over — and a
    // fit that ignored the pitch would still be answering 0.15, leaving a third of the glass empty.
    expect(c.fitZoom()).toBeCloseTo(400 / 2000, 6);
    c.pitch = 80;
    // Further back still, and it is the width from here on: the answer stops moving.
    expect(c.fitZoom()).toBeCloseTo(400 / 2000, 6);
  });

  it("camera.fit-shows-the-whole-desk — and still obeys the limits", () => {
    const c = bench({ minZoom: 0.01, maxZoom: 4 });
    // the tighter side decides — 300 px of glass against 2000 units of desk
    expect(c.fitZoom()).toBeCloseTo(300 / 2000, 6);
    const floored = new Camera({ minZoom: 0.5, maxZoom: 4 });
    floored.setScreen(400, 300);
    floored.setContent({ x: 0, y: 0, w: 2000, h: 2000 }, 1);
    expect(floored.fitZoom(), "a fit below the limit is still the limit").toBe(0.5);
  });
});
