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
import { type Transform } from "../core/transform.js";
import { type Host } from "./host.js";
import { glassOf, pick } from "./pointer.js";
import {
  Camera,
  wheelGoesToCamera,
  wheelPixels,
  wheelZoomFactor,
  ZOOM_SENS,
  type CameraContent,
} from "./camera/index.js";

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
  /**
   * WHO ON THE SCREEN MAY WANT THIS FINGER — the same law, asked of the glass's own furniture. A
   * control, a picture of a card: over those the camera stands down. The rest of the screen — a
   * shade drawn behind a hand, a box waiting for a card — is glass, and a finger on glass drives
   * the view exactly as one on bare felt does. Absent, the whole screen claims: a desk that says
   * nothing about its screen keeps every finger off the desk under it.
   */
  readonly screenClaims?: ((n: Node) => boolean) | undefined;
  /**
   * WHERE THE PIECES CAN BE REACHED RIGHT NOW — the clock's own map (`Motions.reach`), the same one
   * the drag wiring picks through. A piece the clock is moving rests somewhere it left long ago:
   * asked of the tree alone, the camera found bare felt under a finger that the drag wiring had
   * just closed on a card, and one finger moved the card and the desk under it at once. Absent,
   * the tree is the map — a desk with no clock has nothing in flight.
   */
  readonly reach?: (() => ReadonlyMap<string, Transform> | undefined) | undefined;
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
 * HOW FAR TWO FINGERS MUST SLIDE TOGETHER before it counts as a tilt, in screen pixels.
 *
 * The map gesture: two fingers drawn up or down the glass with the span between them and the line
 * they lie on both kept. It is decided ONCE for the gesture, the way the twist is, and against the
 * same kind of noise — a pinch never spreads along a perfect line, and a slide never keeps a perfect
 * span. So a hand that spread first (`TILT_SPREAD`) or twisted first (`TWIST`) is zooming or turning
 * and never tilts, and a hand that slid first is tilting and never zooms. Without the decision every
 * pinch would tilt a little and every tilt would zoom a little. Subtracted once crossed, as the
 * twist is, so the desk lays back from where it stood.
 */
export const TILT_SLOP = 12;

/** How much the span may change, as a fraction of itself, before a two-finger slide is a pinch. */
export const TILT_SPREAD = 0.1;

/**
 * HOW FAST THE DESK LAYS BACK, in degrees per screen pixel the fingers slide — up the glass for a
 * lower seat, down for straight over the desk. The stock ceiling (`MAX_PITCH`, 45°) is a little over
 * two hundred pixels of slide: about the half of a phone's glass a thumb crosses in one motion.
 * Held apart from the threshold because it is the number that gets tuned against a finger.
 */
export const TILT_PER_PX = 0.2;

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
  /** Where the fingers of a finished pinch last were — what a zoom or a turn coasts about. */
  let lastMid: Point | undefined;
  /**
   * Where the pinch began: the desk point between the fingers, the span and the angle to measure
   * against, and whether the twist threshold has been crossed yet.
   */
  let pinch:
    | {
        anchor: Point;
        dist: number;
        zoom: number;
        angle: number;
        rotation: number;
        turning: boolean;
        mid: Point;
        /** Where the two fingers began, and the pitch they began at — what a tilt is measured against. */
        from: Point;
        pitch: number;
        /**
         * WHAT THE TWO FINGERS TURNED OUT TO BE DOING — undecided until either the span or the line
         * moved past its threshold (a pinch) or the pair slid together past `TILT_SLOP` (a tilt).
         */
        doing: "pinch" | "tilt" | undefined;
      }
    | undefined;

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
      mid: s.mid,
      from: s.mid,
      pitch: w.camera.pitch,
      doing: undefined,
    };
    gesture = "pinch";
    w.camera.grab();
  };

  /**
   * `carrying` is the hand-over out of a pinch: the gesture continues under the finger that stayed,
   * so what the two were carrying is kept rather than wiped. A fresh landing is the other case, and
   * there whatever the view was doing stops under the hand.
   */
  const startPan = (at: Point, carrying = false): void => {
    gesture = "pan";
    panLast = at;
    if (carrying) w.camera.handOver();
    else w.camera.grab();
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
    //
    // THE GLASS'S OWN FURNITURE IS AN ELEMENT TOO, and it is asked first because it stands over the
    // desk: a control, a hand pinned to the foot of the screen. A press on a button that also panned
    // the desk under it, or a card taken off the picture of a hand that took the whole table with
    // it, is one finger doing two things. Asked with the SCREEN'S OWN LAW (`screenClaims`), so what
    // is merely drawn on the glass — a shade behind the hand — is not a wall the view stops at.
    if (w.host.hudRoot && pick(w.host, w.host.hudRoot, g, w.screenClaims ?? (() => true))) {
      gesture = "given";
      return;
    }
    if (w.claims && pick(w.host, w.host.root, g, w.claims, w.camera.transform(), w.reach?.())) {
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
      // THE DECISION, made once: a span or a line that moved past its threshold is a pinch, and a
      // pair that slid together past the slop is a tilt. Until it is made the pair is a pinch —
      // the zoom has no threshold of its own and is not given one here, because a spread is meant
      // from its first pixel — and what the undecided pixels zoom is the noise in them. With the
      // tilt closed there is nothing to decide: the pair is a pinch, as it always was, and the
      // slide pans.
      if (pinch.doing === undefined && may.tilt) {
        const spread = Math.abs(s.dist - pinch.dist) / pinch.dist;
        const swung = Math.abs(turnOf(s.angle - pinch.angle));
        if (spread >= TILT_SPREAD || swung >= TWIST) pinch.doing = "pinch";
        else if (Math.abs(s.mid.y - pinch.from.y) >= TILT_SLOP) pinch.doing = "tilt";
      }
      if (pinch.doing === "tilt") {
        // Up the glass lays the desk back; the slop is taken off so it starts from where it stood.
        const slid = pinch.from.y - s.mid.y;
        const past = Math.max(0, Math.abs(slid) - TILT_SLOP) * Math.sign(slid);
        w.camera.tiltTo(pinch.pitch + past * TILT_PER_PX);
        pinch.mid = s.mid;
        moved();
        return;
      }
      const turnedFrom = w.camera.rotation;
      if (may.rotate) {
        // The threshold is crossed once and then SUBTRACTED, so the desk starts turning from where
        // it stood rather than snapping by twelve degrees the instant it is allowed to.
        const swung = turnOf(s.angle - pinch.angle);
        if (!pinch.turning && Math.abs(swung) >= TWIST) pinch.turning = true;
        if (pinch.turning) w.camera.turnTo(pinch.rotation + swung - Math.sign(swung) * TWIST);
      }
      const want = may.zoom ? (pinch.zoom * s.dist) / pinch.dist : w.camera.zoom;
      // What the fingers are CARRYING, sampled off the same events — a ratio for the zoom and
      // degrees for the turn, each measured against the previous frame of this gesture, so a
      // release can throw whichever of them was moving.
      w.camera.trackPinch(want / w.camera.zoom, w.camera.rotation - turnedFrom, e.timeStamp / 1000);
      // The anchor taken at the start, pinned to where the middle is NOW: the spot between the
      // fingers stays between the fingers, so the pinch pans, zooms and turns as one motion. With
      // panning closed there is nothing to pin to, and the zoom goes about the middle of the glass.
      if (may.pan) w.camera.holdAt(pinch.anchor, s.mid.x, s.mid.y, want);
      else w.camera.setZoom(want);
      pinch.mid = s.mid; // where a coast, if there is one, will hold the desk still
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
    const wasPinch = gesture === "pinch";
    pointers.delete(e.pointerId);
    try {
      view.releasePointerCapture(e.pointerId);
    } catch {
      /* never captured, or already released */
    }
    if (pointers.size === 1 && gesture === "pinch") {
      // One finger left of two: carry on panning from where it is, rather than ending the gesture
      // under a hand that never lifted — and KEEP what the pinch was carrying, or the zoom would
      // coast only on the day two fingers left the glass in the same millisecond.
      lastMid = pinch?.mid;
      startPan([...pointers.values()][0]!, true);
      return;
    }
    if (pointers.size > 0) return;
    const held = pinch?.mid ?? lastMid;
    lastMid = undefined;
    pinch = undefined;
    gesture = "none";
    if (!wasPan && !wasPinch) return;
    // EACH AXIS THROWS WITH THE SPEED IT WAS CARRYING, and no rule is needed to keep a pinch from
    // sliding the desk: a gesture that only zoomed never fed a pan velocity, so there is none to
    // throw. A coasting zoom or turn keeps the point between the fingers still.
    w.camera.release(held);
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
