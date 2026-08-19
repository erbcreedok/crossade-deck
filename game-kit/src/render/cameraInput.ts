// THE FINGERS ON THE DESK — the second wiring the kit owns, and it owns it for the same reason it
// owns the button's.
//
// The kit hands a game `glassOf`/`toUnits`/`pick` and refuses to write the twenty lines around them,
// because what a gesture MEANS is the game's business. Two of them are exceptions, and they are the
// two whose meaning is fixed for every game there will ever be: "down and up on the same control"
// is a press, and "the hand moved across empty desk" is the view moving. A camera every consumer
// re-wired by hand would be four copies of a state machine whose bugs are invisible — a pinch that
// forgets its anchor, a fling that outlives its finger, a wheel taken from a page that had to scroll.
//
// Ported, not invented: `client2/src/game/engine/panZoom.ts` and the pan/pinch half of its
// `inputRouter.ts`, on the kit's terms. The maths is already next door in `camera.ts`; this file is
// only the hand — which pointer is doing what, and who the gesture belongs to.
//
// IT HOLDS NO CLOCK (`guard.one-clock`). A throw is stepped by whoever already runs frames, through
// `step(dt)`, exactly as `attachPanZoom(...).step()` was called from the sandbox's ticker.

import { type Node } from "../core/node.js";
import { type Point } from "../core/atoms/bounded.js";
import { type Host } from "./host.js";
import { glassOf, pick } from "./pointer.js";
import {
  Camera,
  wheelGoesToCamera,
  wheelPixels,
  wheelZoomFactor,
  ZOOM_SENS,
  type CameraContent,
} from "./camera.js";

export interface CameraGestures {
  readonly host: Host;
  readonly camera: Camera;
  /**
   * Where the desk is and how big, in units — asked FRESH, so a desk that grows or a screen that
   * turns is followed without anyone re-wiring anything.
   */
  readonly content: () => CameraContent;
  /**
   * What one unit is worth in pixels at zoom 1. Absent, the host's own etalon — which is the right
   * answer for a desk measured in cards, and the wrong one for a desk measured in the thousands,
   * where a unit is a pixel and the camera is the only scale.
   */
  readonly unit?: (() => number) | undefined;
  /**
   * WHO ELSE MAY WANT THIS FINGER — the arbitration law, as a predicate over nodes.
   *
   * A gesture over an element drives the ELEMENT, over empty desk it drives the camera
   * (`docs/design/camera.md`). The pick reads the same plan the painter drew, through the same
   * camera, so what declines the finger is exactly what the eye sees under it. Absent, every
   * gesture is the desk's.
   */
  readonly claims?: ((n: Node) => boolean) | undefined;
  /** The view moved — repaint. Called for gestures and for every step of a throw. */
  readonly onView?: (() => void) | undefined;
  /**
   * This desk is one block on a page of prose. The wheel is then never claimed for panning: a
   * canvas that swallows it leaves the page frozen, which reads as a hung site.
   */
  readonly inDocument?: boolean | undefined;
  /** How hard the wheel zooms. Absent, the stock `ZOOM_SENS`. */
  readonly sensitivity?: number | undefined;
}

export interface CameraControl {
  /** Re-read the glass and the desk and hold the view inside them — after a resize or a new desk. */
  refresh(): void;
  /**
   * One step of the throw, in seconds, from the CONSUMER's clock. `true` while it is still moving.
   *
   * The kit runs no frame loop of its own, and this is where that shows: a scene that never steps
   * simply has no inertia, and a scene that already animates gets it for one line.
   */
  step(dtSeconds: number): boolean;
  /** What the hand is doing right now — a scene may want to know before it starts something else. */
  gesture(): Gesture;
  /** Forget the listeners and the fingers. */
  stop(): void;
}

/**
 * HOW FAR TWO FINGERS MUST TURN before it counts as a turn, in degrees.
 *
 * Every two-finger gesture is a little bit of a twist: fingers do not spread along a perfect line,
 * and without a threshold a plain pinch-zoom leaves the desk a few degrees off true every time —
 * the single most complained-about behaviour a rotating canvas has. Once it is crossed the
 * threshold is SUBTRACTED rather than jumped, so the desk starts turning from where it stood
 * instead of snapping twelve degrees.
 *
 * The same shape as `client2`'s drag slop, and for the same reason: a gesture has to be meant.
 */
export const TWIST = 12;

/**
 * `given` is the arbitration made visible: a finger that landed on an element belongs to the
 * element until it is lifted, and the camera does not take it back halfway through.
 */
export type Gesture = "none" | "pan" | "pinch" | "given";

/** Two fingers, as the camera reads them: the middle, the span, and the line they lie on. */
interface Span {
  readonly mid: Point;
  readonly dist: number;
  /** Degrees, clockwise on screen — the same convention as the camera's own turn. */
  readonly angle: number;
}

/** A difference of angles brought into ±180, so a gesture across the seam is not a full circle. */
const turnOf = (deg: number): number => ((((deg + 180) % 360) + 360) % 360) - 180;

export function wireCamera(w: CameraGestures): CameraControl {
  const view = w.host.view;
  view.style.touchAction = "none";

  const pointers = new Map<number, Point>();
  let gesture: Gesture = "none";
  let panLast: Point = { x: 0, y: 0 };
  /**
   * Where the pinch began: the desk point between the fingers, the span and the angle to measure
   * against, and whether the twist threshold has been crossed yet.
   */
  let pinch: { anchor: Point; dist: number; zoom: number; angle: number; rotation: number; turning: boolean } | undefined;

  const moved = (): void => w.onView?.();

  /**
   * Tell the camera what it is looking at and through what.
   *
   * Before every gesture, not once at attach: the glass resizes, the desk grows, and a camera
   * clamping against last week's numbers holds the view somewhere that no longer exists.
   */
  const sync = (): void => {
    const v = w.host.viewport();
    w.camera.setScreen(v.width, v.height);
    w.camera.setContent(w.content(), w.unit?.() ?? w.host.unit());
  };

  const spanOf = (): Span => {
    const [a, b] = [...pointers.values()];
    return {
      mid: { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 },
      dist: Math.max(1, Math.hypot(a!.x - b!.x, a!.y - b!.y)),
      angle: (Math.atan2(b!.y - a!.y, b!.x - a!.x) * 180) / Math.PI,
    };
  };

  const startPinch = (): void => {
    sync();
    const s = spanOf();
    pinch = {
      anchor: w.camera.toContent(s.mid.x, s.mid.y),
      dist: s.dist,
      zoom: w.camera.zoom,
      angle: s.angle,
      rotation: w.camera.rotation,
      turning: false,
    };
    gesture = "pinch";
    w.camera.grab();
  };

  const startPan = (at: Point): void => {
    gesture = "pan";
    panLast = at;
    w.camera.grab();
  };

  const onDown = (e: PointerEvent): void => {
    const g = glassOf(view, e);
    pointers.set(e.pointerId, g);
    // A GESTURE ALREADY GIVEN AWAY IS NOT TAKEN BACK. `client2` cancelled the piece and pinched;
    // it could, because one router owned every finger on the glass. Here the element's own wiring
    // owns its pointer, and nothing can tell it to let go — so a second finger arriving mid-drag
    // would move the desk out from under a card that is still following the first.
    if (gesture === "given") return;
    const may = w.camera.input;
    if (pointers.size >= 2) {
      // A pinch is worth starting if ANY of the three is open — with only `rotate` left it is
      // still a twist, and with only `zoom` it is still a zoom about the middle of the glass.
      if (may.pan || may.zoom || may.rotate) startPinch();
      return;
    }
    sync();
    // The arbitration, in one line: over an element the camera stands down for the whole gesture.
    if (w.claims && pick(w.host, w.host.root, g, w.claims, w.camera.transform())) {
      gesture = "given";
      return;
    }
    // A view that may not be panned takes no finger at all — and says so by staying at rest, so a
    // second finger arriving can still open a pinch.
    if (!may.pan) return;
    startPan(g);
    try {
      view.setPointerCapture(e.pointerId);
    } catch {
      /* a pointer the browser no longer considers active; the pan carries on without capture */
    }
  };

  const onMove = (e: PointerEvent): void => {
    if (!pointers.has(e.pointerId)) return;
    const g = glassOf(view, e);
    pointers.set(e.pointerId, g);
    if (gesture === "pinch" && pinch && pointers.size >= 2) {
      sync();
      const s = spanOf();
      const may = w.camera.input;
      if (may.rotate) {
        // The threshold is crossed once and then SUBTRACTED, so the desk starts turning from where
        // it stood rather than snapping by twelve degrees the instant it is allowed to.
        const swung = turnOf(s.angle - pinch.angle);
        if (!pinch.turning && Math.abs(swung) >= TWIST) pinch.turning = true;
        if (pinch.turning) w.camera.turnTo(pinch.rotation + swung - Math.sign(swung) * TWIST);
      }
      const want = may.zoom ? (pinch.zoom * s.dist) / pinch.dist : w.camera.zoom;
      // The anchor taken at the start, pinned to where the middle is NOW: the spot between the
      // fingers stays between the fingers, so the pinch pans, zooms and turns as one motion. With
      // panning closed there is nothing to pin to, and the zoom goes about the middle of the glass.
      if (may.pan) w.camera.holdAt(pinch.anchor, s.mid.x, s.mid.y, want);
      else w.camera.setZoom(want);
      moved();
      return;
    }
    if (gesture !== "pan") return;
    const dx = g.x - panLast.x;
    const dy = g.y - panLast.y;
    panLast = g;
    sync();
    // The time comes off the EVENT, never off a clock this file is not allowed to have. It is also
    // the more honest number: coalesced moves carry the stamp of when the hand was there.
    w.camera.trackPan(dx, dy, e.timeStamp / 1000);
    w.camera.panBy(dx, dy);
    moved();
  };

  const onUp = (e: PointerEvent): void => {
    const wasPan = gesture === "pan";
    pointers.delete(e.pointerId);
    try {
      view.releasePointerCapture(e.pointerId);
    } catch {
      /* never captured, or already released */
    }
    if (pointers.size === 1 && gesture === "pinch") {
      // One finger left of two: carry on panning from where it is, rather than ending the gesture
      // under a hand that never lifted.
      startPan([...pointers.values()][0]!);
      return;
    }
    if (pointers.size > 0) return;
    pinch = undefined;
    gesture = "none";
    // Only a PAN throws. A pinch ends where the fingers left it — a two-finger flick is a zoom
    // that happened to travel, and coasting out of it is not what any hand asked for.
    if (!wasPan) return;
    w.camera.release();
    // AND THE CONSUMER IS TOLD, or the throw never runs at all: `onView` is the one channel there
    // is, and the whole of a fling happens after the last event this file will ever hear. A loop
    // that sleeps until something moves never learns that something is about to.
    if (w.camera.flinging) moved();
  };

  const onWheel = (e: WheelEvent): void => {
    sync();
    const may = w.camera.input;
    const zoom = (e.ctrlKey || e.metaKey) && may.zoom;
    // A view the hand may not move is a view with nothing to scroll, as far as the page is
    // concerned: a locked desk that ate the wheel would freeze the article it sits in.
    const canPan = may.pan && (w.camera.overflowX || w.camera.overflowY);
    if (!wheelGoesToCamera({ zoom, canPan, inDocument: w.inDocument === true })) {
      return; // not ours: the page keeps its scroll, and nothing is prevented
    }
    e.preventDefault();
    const v = w.host.viewport();
    const dy = wheelPixels(e.deltaY, e.deltaMode, v.height);
    if (zoom) {
      const g = glassOf(view, e);
      w.camera.zoomAround(g.x, g.y, wheelZoomFactor(dy, w.sensitivity ?? ZOOM_SENS));
    } else {
      // A trackpad's two fingers are a pan, and the sign is the one the page uses: content follows
      // the fingers, so a downward wheel moves the desk up.
      w.camera.stopFling();
      w.camera.panBy(-wheelPixels(e.deltaX, e.deltaMode, v.width), -dy);
    }
    moved();
  };

  view.addEventListener("pointerdown", onDown);
  view.addEventListener("pointermove", onMove);
  view.addEventListener("pointerup", onUp);
  view.addEventListener("pointercancel", onUp);
  view.addEventListener("wheel", onWheel, { passive: false });

  sync();
  w.camera.clamp();

  return {
    refresh() {
      sync();
      w.camera.clamp();
      moved();
    },
    step(dtSeconds) {
      // Asked BEFORE the step, so the frame that ENDS the throw is drawn too: `stepFling` returns
      // false on the step that brings it to rest, and that step moved the view like any other.
      const was = w.camera.flinging;
      const going = w.camera.stepFling(dtSeconds);
      if (was) moved();
      return going;
    },
    gesture: () => gesture,
    stop() {
      pointers.clear();
      gesture = "none";
      pinch = undefined;
      w.camera.stopFling();
      view.removeEventListener("pointerdown", onDown);
      view.removeEventListener("pointermove", onMove);
      view.removeEventListener("pointerup", onUp);
      view.removeEventListener("pointercancel", onUp);
      view.removeEventListener("wheel", onWheel);
    },
  };
}
