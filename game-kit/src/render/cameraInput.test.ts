// THE LAWS THIS FILE EXISTS FOR: a gesture over an element is the ELEMENT'S, a throw outlives the
// finger and nothing else, and the wheel is never taken from a page that had to scroll.
//
// None of the three is visible by eye until it is wrong in front of a player. A camera that takes a
// finger off a card looks like a card that will not be picked up; a fling that keeps its speed
// through the next grab looks like a desk fighting the hand; a canvas that eats the wheel over prose
// looks like a hung site. All of it is a state machine over five listeners, and a state machine is
// exactly the thing a plain test holds down better than a hundred careful drags.

import { beforeEach, describe, expect, it } from "vitest";
import { Container, registerLayout, resetLayouts } from "../core/atoms/container.js";
import { freeLayout } from "../core/atoms/layouts.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Transformable } from "../core/atoms/transformable.js";
import { Bounded } from "../core/atoms/bounded.js";
import { add, node, type Node } from "../core/node.js";
import { DEFAULT_VIEWER } from "../core/viewer.js";
import { rect } from "../presets/shapes.js";
import { installStockSurfaces } from "../presets/surfaces.js";
import { resetSurfaces } from "./surfaces.js";
import { type Host } from "./host.js";
import { Camera, LOCKED_INPUT, NO_FLING, type CameraInput } from "./camera.js";
import { TWIST, wireCamera, type CameraControl } from "./cameraInput.js";

/** A view that records its listeners and fires them — the wiring asks it for nothing else. */
function stubView(): {
  el: HTMLCanvasElement;
  down: (id: number, x: number, y: number, t?: number) => void;
  move: (id: number, x: number, y: number, t?: number) => void;
  up: (id: number, x: number, y: number, t?: number) => void;
  wheel: (e: Partial<WheelEvent>) => boolean;
  listening: () => string[];
} {
  const listeners = new Map<string, (e: never) => void>();
  const el = {
    style: {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener: (t: string, f: (e: never) => void) => void listeners.set(t, f),
    removeEventListener: (t: string) => void listeners.delete(t),
    setPointerCapture: () => undefined,
    releasePointerCapture: () => undefined,
  } as unknown as HTMLCanvasElement;
  const fire = (type: string, id: number, x: number, y: number, t: number): void =>
    listeners.get(type)?.({ pointerId: id, clientX: x, clientY: y, timeStamp: t } as never);
  return {
    el,
    down: (id, x, y, t = 0) => fire("pointerdown", id, x, y, t),
    move: (id, x, y, t = 0) => fire("pointermove", id, x, y, t),
    up: (id, x, y, t = 0) => fire("pointerup", id, x, y, t),
    wheel: (e) => {
      let prevented = false;
      listeners.get("wheel")?.({
        deltaX: 0,
        deltaY: 0,
        deltaMode: 0,
        clientX: 200,
        clientY: 150,
        preventDefault: () => void (prevented = true),
        ...e,
      } as never);
      return prevented;
    },
    listening: () => [...listeners.keys()],
  };
}

interface Bench {
  readonly camera: Camera;
  readonly hand: ReturnType<typeof stubView>;
  readonly wiring: CameraControl;
  readonly painted: () => number;
  readonly root: Node;
}

/**
 * A desk of 20×20 units laid out AROUND ZERO — a kit desk — at 100px a unit on a 400×300 glass, so
 * every axis has somewhere to go. One card sits at the origin for the arbitration to find.
 */
function bench(
  options: { claims?: (n: Node) => boolean; inDocument?: boolean; fling?: boolean; input?: CameraInput } = {},
): Bench {
  const root = node("desk", Container({ layout: "free" }));
  add(root, node("card", Bounded({ bounds: rect(1, 1) }), Surfaced(), Transformable({ at: { x: 0, y: 0 } })));
  const hand = stubView();
  const host = {
    view: hand.el,
    root,
    unit: () => 100,
    viewport: () => ({ width: 400, height: 300, dpr: 1 }),
    viewer: () => DEFAULT_VIEWER,
    setRoot: () => undefined,
  } as unknown as Host;
  const camera = new Camera({
    minZoom: 0.1,
    maxZoom: 4,
    ...(options.fling === false ? { inertia: { pan: NO_FLING } } : {}),
    ...(options.input ? { input: options.input } : {}),
  });
  let painted = 0;
  const wiring = wireCamera({
    host,
    camera,
    content: () => ({ x: -10, y: -10, w: 20, h: 20 }),
    onView: () => void (painted += 1),
    ...(options.claims ? { claims: options.claims } : {}),
    ...(options.inDocument === undefined ? {} : { inDocument: options.inDocument }),
  });
  camera.lookAt({ x: 0, y: 0 });
  return { camera, hand, wiring, painted: () => painted, root };
}

beforeEach(() => {
  resetLayouts();
  registerLayout("free", freeLayout);
  resetSurfaces();
  installStockSurfaces();
});

describe("the camera's fingers", () => {
  it("cameraInput.a-finger-on-empty-desk-moves-the-view", () => {
    const b = bench();
    const was = b.camera.x;
    b.hand.down(1, 300, 200);
    b.hand.move(1, 260, 170, 16);
    expect(b.camera.x).toBeCloseTo(was - 40, 6);
    expect(b.camera.y).toBeCloseTo(b.camera.y, 6);
    expect(b.wiring.gesture()).toBe("pan");
    expect(b.painted()).toBeGreaterThan(0);
    b.hand.up(1, 260, 170, 32);
    expect(b.wiring.gesture()).toBe("none");
  });

  it("cameraInput.a-finger-on-an-element-is-not-the-camera-s — the arbitration law", () => {
    // Over an element the ELEMENT is driven, over empty desk the camera (`docs/design/camera.md`).
    // Without this a card can never be picked up: the desk slides out from under every grab, and
    // it looks exactly like a card that refuses the finger rather than like a camera that stole it.
    const b = bench({ claims: (n) => n.id === "card" });
    const was = b.camera.x;
    b.hand.down(1, 200, 150); // the card is at the origin, and the origin is mid-glass
    b.hand.move(1, 100, 150, 16);
    expect(b.wiring.gesture()).toBe("given");
    expect(b.camera.x).toBe(was);
    // …and empty desk, one pixel of card away, still moves the view.
    b.hand.up(1, 100, 150, 32);
    b.hand.down(2, 380, 40);
    b.hand.move(2, 340, 40, 48);
    expect(b.wiring.gesture()).toBe("pan");
    expect(b.camera.x).toBeCloseTo(was - 40, 6);
  });

  it("cameraInput.a-gesture-given-away-is-not-taken-back", () => {
    // A second finger arriving mid-drag would pinch the desk out from under a card that is still
    // following the first — the element's own wiring owns that pointer and cannot be told to stop.
    const b = bench({ claims: (n) => n.id === "card" });
    const was = { x: b.camera.x, zoom: b.camera.zoom };
    b.hand.down(1, 200, 150);
    b.hand.down(2, 300, 150);
    b.hand.move(2, 380, 150, 16);
    expect(b.wiring.gesture()).toBe("given");
    expect(b.camera.zoom).toBe(was.zoom);
    expect(b.camera.x).toBe(was.x);
  });

  it("cameraInput.two-fingers-zoom-about-the-spot-between-them — and carry it along", () => {
    // A pinch is not "zoom about the midpoint": the midpoint travels, and the spot the hand grabbed
    // has to stay between the fingers wherever they take it. Anchored at the start and pinned to
    // the middle NOW — one statement, so the zoom and the pan cannot disagree.
    const b = bench();
    b.hand.down(1, 150, 150);
    b.hand.down(2, 250, 150);
    const held = b.camera.toContent(200, 150);
    b.hand.move(1, 60, 150, 16); // spread to 280 apart, and the middle drifts to 200
    b.hand.move(2, 340, 150, 24);
    expect(b.camera.zoom).toBeCloseTo(280 / 100, 6);
    const now = b.camera.toContent(200, 150);
    expect(now.x).toBeCloseTo(held.x, 6);
    expect(now.y).toBeCloseTo(held.y, 6);
    // One finger lifted: the other carries on panning rather than the gesture ending under a hand
    // that never left the glass.
    b.hand.up(1, 60, 150, 32);
    expect(b.wiring.gesture()).toBe("pan");
  });

  it("cameraInput.a-pinch-throws-what-it-was-doing — and one finger still down parks all of it", () => {
    // Each axis throws with the speed IT was carrying: a spreading pinch coasts its zoom, a twist
    // coasts its turn, and neither slides the desk — a gesture that only zoomed never fed a pan
    // velocity, so no rule is needed to stop it. What DOES stop everything is a hand still on the
    // glass: lifting one finger of two leaves the other panning, and a desk coasting under a finger
    // that never left is a desk fighting the hand.
    const both = bench();
    both.hand.down(1, 150, 150);
    both.hand.down(2, 250, 150);
    both.hand.move(1, 140, 150, 16);
    both.hand.move(2, 300, 150, 24);
    const parked = both.camera.x;
    both.hand.up(1, 140, 150, 32); // one of two: the gesture becomes a pan under the finger left
    // The first finger of the two is up; the second is still on the glass, so nothing is thrown.
    expect(both.wiring.gesture()).toBe("pan");
    expect(both.camera.flinging, "a finger stayed on the glass and the view coasted anyway").toBe(false);
    both.hand.up(2, 300, 150, 40);

    expect(parked).toBe(both.camera.x); // nothing slid while a hand was on the glass

    // …and once the LAST finger goes, what the pinch was carrying is thrown: the zoom coasts on,
    // about the spot the fingers were over, and the desk does not slide with it.
    const zoomWas = both.camera.zoom;
    const spot = both.camera.toContent(220, 150); // the middle the fingers were over
    expect(both.camera.flinging, "both fingers gone and the zoom was not thrown").toBe(true);
    both.wiring.step(1 / 60);
    expect(both.camera.zoom).toBeGreaterThan(zoomWas);
    expect(both.camera.toContent(220, 150).x).toBeCloseTo(spot.x, 4);
  });

  it("cameraInput.the-throw-outlives-the-finger-and-nothing-else", () => {
    const b = bench();
    b.hand.down(1, 350, 150);
    b.hand.move(1, 300, 150, 16);
    b.hand.move(1, 250, 150, 32);
    b.hand.up(1, 250, 150, 48);
    expect(b.camera.flinging).toBe(true);
    const before = b.camera.x;
    expect(b.wiring.step(1 / 60)).toBe(true);
    expect(b.camera.x).toBeLessThan(before);
    // A finger landing again STOPS it dead: a desk still coasting under the hand is a desk
    // fighting it.
    b.hand.down(2, 200, 150, 64);
    expect(b.camera.flinging).toBe(false);
    expect(b.wiring.step(1 / 60)).toBe(false);
  });

  it("cameraInput.letting-go-wakes-the-consumer — or the throw never runs at all", () => {
    // Caught in a browser, not here: the desk flew perfectly and then stopped dead the instant the
    // finger left it, with `flinging` true for the rest of the session. `onView` is the one channel
    // this file has, the WHOLE of a fling happens after the last event it will ever hear, and a
    // loop that sleeps until something moves cannot learn that something is about to.
    const b = bench();
    b.hand.down(1, 350, 150);
    b.hand.move(1, 300, 150, 16);
    b.hand.move(1, 250, 150, 32);
    const before = b.painted();
    b.hand.up(1, 250, 150, 48);
    expect(b.camera.flinging).toBe(true);
    expect(b.painted(), "the release said nothing, so nobody will step the throw").toBeGreaterThan(before);

    // A release that is NOT a throw wakes nobody: a frame with nothing in it is a frame wasted.
    const still = bench();
    still.hand.down(1, 200, 150);
    still.hand.move(1, 199, 150, 16);
    still.hand.move(1, 199, 150, 200);
    const quiet = still.painted();
    still.hand.up(1, 199, 150, 216);
    expect(still.camera.flinging).toBe(false);
    expect(still.painted()).toBe(quiet);
  });

  it("cameraInput.the-wheel-is-not-taken-from-a-page-that-had-to-scroll", () => {
    // Panning is claimed only where the desk IS the page. In a document the wheel goes through
    // untouched — nothing prevented — or the block under the reader's cursor freezes the article.
    expect(bench({ inDocument: true }).hand.wheel({ deltaY: 120 })).toBe(false);
    expect(bench().hand.wheel({ deltaY: 120 })).toBe(true);
    // Zoom with a modifier is always the desk's, document or not.
    expect(bench({ inDocument: true }).hand.wheel({ deltaY: -120, ctrlKey: true })).toBe(true);
  });

  it("cameraInput.the-wheel-pans-with-the-page-s-sign-and-zooms-about-the-cursor", () => {
    const b = bench();
    const was = b.camera.y;
    b.hand.wheel({ deltaY: 100 });
    expect(b.camera.y).toBeCloseTo(was - 100, 6); // content follows the fingers: down moves it up
    const zoomed = bench();
    const held = zoomed.camera.toContent(320, 80);
    zoomed.hand.wheel({ deltaY: -120, ctrlKey: true, clientX: 320, clientY: 80 });
    expect(zoomed.camera.zoom).toBeGreaterThan(1);
    expect(zoomed.camera.toContent(320, 80).x).toBeCloseTo(held.x, 6);
  });

  it("cameraInput.two-fingers-turn-the-desk — after they have meant it", () => {
    // Fingers never spread along a perfect line, so without a threshold every plain pinch leaves
    // the desk a few degrees off true — the loudest complaint a rotating canvas gets. And the
    // threshold is SUBTRACTED once crossed: a desk that jumped twelve degrees to start turning
    // would be a worse cure than the disease.
    const b = bench();
    b.hand.down(1, 150, 150);
    b.hand.down(2, 250, 150);
    // A small twist, under the threshold: nothing turns.
    b.hand.move(2, 250, 158, 16); // about 4.6°
    expect(b.camera.rotation).toBe(0);
    // Past it: the desk turns by the excess, not by the whole swing.
    b.hand.move(2, 250, 150 + 100 * Math.tan((Math.PI / 180) * 40), 32);
    expect(b.camera.rotation).toBeCloseTo(40 - TWIST, 4);
  });

  it("cameraInput.a-rule-can-close-a-gesture — and the others stay open", () => {
    // The three gates are DATA a rule may change mid-game: a puzzle that pins the view for its last
    // move, a tutorial that will not let the desk turn yet. Nothing is rebuilt and nothing is
    // re-wired — the wiring asks the camera at gesture time, every time.
    const b = bench({ input: { pan: false, zoom: true, rotate: false } });
    const was = { x: b.camera.x, y: b.camera.y, zoom: b.camera.zoom };
    b.hand.down(1, 300, 200);
    b.hand.move(1, 200, 120, 16);
    expect(b.wiring.gesture(), "a view that may not be panned took a finger anyway").toBe("none");
    expect(b.camera.x).toBe(was.x);
    // …while the wheel still zooms, because that gate is open.
    expect(b.hand.wheel({ deltaY: -120, ctrlKey: true })).toBe(true);
    expect(b.camera.zoom).toBeGreaterThan(was.zoom);
    // …and two fingers still zoom, about the middle of the glass rather than about themselves.
    const mid = b.camera.toContent(200, 150);
    b.hand.down(2, 150, 150);
    b.hand.down(3, 250, 150);
    b.hand.move(2, 100, 150, 48);
    b.hand.move(3, 300, 150, 56);
    expect(b.camera.zoom).toBeGreaterThan(was.zoom);
    expect(b.camera.rotation, "rotation was closed").toBe(0);
    expect(b.camera.toContent(200, 150).x).toBeCloseTo(mid.x, 6);
  });

  it("cameraInput.a-locked-view-refuses-every-gesture — and does not eat the wheel", () => {
    // `locked` is not a mode the engine knows; it is the three switches off. A locked desk that
    // still swallowed the wheel would freeze the page it sits in — which is exactly how a canvas
    // gets read as a hung site.
    const b = bench({ input: LOCKED_INPUT });
    const was = { x: b.camera.x, zoom: b.camera.zoom, rotation: b.camera.rotation };
    b.hand.down(1, 300, 200);
    b.hand.move(1, 200, 120, 16);
    b.hand.up(1, 200, 120, 32);
    b.hand.down(2, 150, 150);
    b.hand.down(3, 250, 150);
    b.hand.move(3, 350, 250, 48);
    expect(b.hand.wheel({ deltaY: 120 })).toBe(false);
    expect(b.hand.wheel({ deltaY: -120, ctrlKey: true })).toBe(false);
    expect({ x: b.camera.x, zoom: b.camera.zoom, rotation: b.camera.rotation }).toEqual(was);
    expect(b.camera.flinging).toBe(false);

    // …and opening a gate again is one call on the standing camera, not a rebuild.
    b.hand.up(2, 150, 150, 56);
    b.hand.up(3, 350, 250, 56);
    b.camera.retune({ input: { pan: true, zoom: false, rotate: false } });
    b.hand.down(4, 300, 200, 64);
    b.hand.move(4, 260, 200, 80);
    expect(b.camera.x).toBeCloseTo(was.x - 40, 6);
  });

  it("cameraInput.stopping-forgets-every-listener-and-the-throw", () => {
    // A scene torn down while the desk still coasts leaves a fling nobody steps and five listeners
    // on a canvas nobody looks at — and the next scene's first frame inherits both.
    const b = bench();
    b.hand.down(1, 350, 150);
    b.hand.move(1, 300, 150, 16); // two samples: the first only starts the clock the speed is read from
    b.hand.move(1, 250, 150, 32);
    b.hand.up(1, 250, 150, 48);
    expect(b.camera.flinging).toBe(true);
    b.wiring.stop();
    expect(b.camera.flinging).toBe(false);
    expect(b.hand.listening()).toEqual([]);
  });
});
