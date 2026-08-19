// THE CAMERA — how the desk is LOOKED AT, as pure arithmetic with no renderer in it.
//
// Ported, not invented: this is `client2/src/game/engine/viewport.ts` moved onto the kit's terms,
// numbers and all. Those numbers were settled by hand against a real finger — the fling cap, the
// threshold that tells a flick from a tremble, the decay, the wheel's zoom sensitivity — and a
// second set guessed here would feel like a different product for no reason. The turn is the one
// thing `client2` never had: it comes from the design (`docs/design/camera.md`), where a seat at
// the desk is a camera preset and nothing else.
//
// It holds NUMBERS ONLY and draws nothing. The plan asks it for a transform; the painter never
// hears of it. That is what keeps everything below the camera checkable headless: a desk, its
// pieces, their rules and the composition of `z` and angles are data and mathematics, and rendering
// begins only here.
//
// The camera is LOCAL and never part of a game's state. A view is not a truth, so there is nothing
// to synchronise: one desk may be looked at by many cameras at once — a seat, a minimap, a watcher.

import { apply, chain, compose, invert, move, rotate, scale, type Transform } from "../core/transform.js";
import { type Point } from "../core/atoms/bounded.js";

/** Keep a number inside a range. */
const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * HOW HARD THE WHEEL ZOOMS. The factor is `exp(-delta * this)`, so a notch is a RATIO rather than
 * an addition — zooming out and back in returns exactly where it started, at any zoom.
 */
export const ZOOM_SENS = 0.0015;

/** What a fling is made of. Every number here came off a real finger; see the file header. */
export interface Fling {
  /** Fastest a throw may be, in screen px per second. A flick of the wrist can otherwise send the desk into the next county. */
  readonly cap: number;
  /** Below this speed there is no throw — that is a hand coming to rest, not a flick. Also where a fling stops. */
  readonly floor: number;
  /** How fast it dies. The step is `exp(-decay * dt)`, so the slide is the same at 60 and at 120 Hz. */
  readonly decay: number;
  /** How much of the newest sample a velocity estimate takes. Half, so one jittery frame cannot become the throw. */
  readonly smoothing: number;
  /** The longest gap between two moves that still counts as one motion, in seconds. */
  readonly maxGap: number;
}

/** The stock feel — `client2`'s numbers verbatim. */
export const FLING: Fling = { cap: 4000, floor: 40, decay: 5, smoothing: 0.5, maxGap: 0.1 };

/** A fling that never happens: the view stops dead with the finger. Data, so "no inertia" is a setting. */
export const NO_FLING: Fling = { cap: 0, floor: Infinity, decay: Infinity, smoothing: 0.5, maxGap: 0.1 };

/**
 * WHAT THE PLAYER MAY DO TO THE VIEW — three fields of data, not a mode with a name.
 *
 * `free`, `fit` and `locked` stay presets somebody writes down; they are never things the engine
 * knows. The moment they are an enum, "locked, but you may still zoom out to see the whole board"
 * needs a fourth name, and the next combination needs a fifth. Three switches answer all eight.
 *
 * They are read at GESTURE TIME, so a rule may close one mid-game — a puzzle that pins the view for
 * its last move, a tutorial that will not let the desk turn until it has said why — and nothing is
 * rebuilt: `camera.retune({ input: { ...FREE_INPUT, rotate: false } })`, and the next twist does
 * nothing. What this never governs is the camera's own methods: a game that moves the view is the
 * game deciding, and these say only what the HAND may do.
 */
export interface CameraInput {
  readonly pan: boolean;
  readonly zoom: boolean;
  readonly rotate: boolean;
}

/** The hand may do everything — what a desk with nothing to hide starts as. */
export const FREE_INPUT: CameraInput = { pan: true, zoom: true, rotate: true };
/** Look, do not touch: every gesture refused, while the game still moves the view itself. */
export const LOCKED_INPUT: CameraInput = { pan: false, zoom: false, rotate: false };

/**
 * WHAT THERE IS TO LOOK AT — the stretch of desk the view is held inside, in units.
 *
 * A RECT and not a size, because a desk is laid out AROUND its origin: a table spanning -1000 to
 * 1000 is 2000 wide and its left edge is at -1000, and a camera told only "2000 wide" holds the
 * view inside one quarter of it while every clamp and every scrollbar reads perfectly correct.
 */
export interface CameraContent {
  /** The desk's smallest corner, in units. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface CameraLimits {
  /** How far out the desk may be pushed. */
  readonly minZoom: number;
  /** How far in. */
  readonly maxZoom: number;
  /** The inertia this camera throws with. Absent, the stock feel. */
  readonly fling?: Fling;
  /** What the player's hand may do. Absent, everything — see `CameraInput`. */
  readonly input?: CameraInput;
}

/** What the view is worth right now — enough to draw a scrollbar without asking anything else. */
export interface CameraState {
  readonly zoom: number;
  /** Degrees, clockwise on screen. */
  readonly rotation: number;
  /** 0…1 along each axis, and how much of the whole is on screen. `0` when there is nothing to scroll. */
  readonly scrollX: number;
  readonly scrollY: number;
  readonly thumbX: number;
  readonly thumbY: number;
  readonly scrollableX: boolean;
  readonly scrollableY: boolean;
}

/** A rectangle on the glass, in screen pixels. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * THE CAMERA. Its state is `{ target, zoom, rotation }` and nothing else: `target` is the point of
 * the DESK that sits in the middle of the glass, and a turn goes AROUND it.
 *
 * Not `{ x, y, zoom }`, and the difference is not bookkeeping. With a target, "seat this player at
 * 45° facing the middle" is a literal of data — `{ target: middle, rotation: seatAngle }` — rather
 * than a mechanism of its own: the desk is the same desk, and only the point of view differs. `x`
 * and `y` survive as READINGS of where the desk's origin landed, because a scrollbar and a test
 * still want them, but nothing is stored there.
 *
 * The bounds are told to it rather than discovered: a camera knows the size of the SCREEN and the
 * rect of the CONTENT, and everything else — where the view may go, whether an axis can scroll at
 * all, where a fling has to stop — follows from those two. Nothing here reads a node.
 */
export class Camera {
  /** The desk point in the middle of the glass. */
  target: Point = { x: 0, y: 0 };
  zoom = 1;
  /** Degrees, clockwise on screen. The whole desk turns; nothing on it learns that it did. */
  rotation = 0;

  private screenW = 1;
  private screenH = 1;
  /** The content's rect in UNITS — the same units a node's box is in, corner included. */
  private content: CameraContent = { x: 0, y: 0, w: 1, h: 1 };
  /** Screen pixels per unit at zoom 1 — the fit the viewer settled on. */
  private unit = 1;

  private vx = 0;
  private vy = 0;
  /** Whether a throw is still running. Read by the clock to know if there is another frame to draw. */
  flinging = false;

  constructor(private limits: CameraLimits) {
    this.zoom = clamp(1, limits.minZoom, limits.maxZoom);
  }

  /**
   * NEW NUMBERS UNDER A STANDING VIEW — a settings screen, or a rule closing a gesture mid-game.
   *
   * A PATCH, merged over what is there, so `retune({ input })` need not restate limits it does not
   * care about. The zoom is put back through its own door afterwards, so a view already outside a
   * new range is brought inside it instead of sitting there until the next gesture happens to
   * notice.
   */
  retune(patch: Partial<CameraLimits>): void {
    this.limits = { ...this.limits, ...patch };
    this.setZoom(this.zoom);
  }

  /** What the hand may do right now. */
  get input(): CameraInput {
    return this.limits.input ?? FREE_INPUT;
  }

  private get fling(): Fling {
    return this.limits.fling ?? FLING;
  }

  /** How big the glass is, in screen pixels. */
  setScreen(width: number, height: number): void {
    this.screenW = width;
    this.screenH = height;
  }

  /** Where the desk is and how big, in units, and what a unit is worth in pixels before zoom. */
  setContent(area: CameraContent, unit: number): void {
    this.content = area;
    this.unit = unit;
  }

  /** Screen pixels per unit right now — the only scale anything is allowed to read. */
  private get k(): number {
    return this.unit * this.zoom;
  }

  /** Where the desk's origin landed on the glass. A READING of the transform, never the state. */
  get x(): number {
    return this.transform().e;
  }
  get y(): number {
    return this.transform().f;
  }

  /**
   * THE DESK'S BOX ON THE GLASS — its four corners mapped through the view, then bounded.
   *
   * A BOUNDING box, and under a turn that is a decision rather than a shortcut: a desk at 45° cannot
   * be pushed until its own corner touches the glass's, because what is held inside the glass is the
   * upright box around the turned desk (`docs/design/camera.md`). Predictable beats maximal — the
   * alternative reaches further in one direction and stops sooner in another, for a reason no player
   * could guess from looking.
   */
  private screenBox(): Box {
    const t = this.transform();
    const { x, y, w, h } = this.content;
    const corners = [
      apply(t, { x, y }),
      apply(t, { x: x + w, y }),
      apply(t, { x: x + w, y: y + h }),
      apply(t, { x, y: y + h }),
    ];
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const minX = Math.min(...xs);
    const minY = Math.min(...ys);
    return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
  }

  /**
   * IS THERE ANYWHERE TO GO on this axis — is the desk, at this zoom, bigger than the glass?
   *
   * The wheel needs it. A scene that swallows the wheel while having nothing to scroll leaves the
   * page under it frozen, and from the outside that reads as a hung site rather than as a desk
   * declining to move.
   */
  get overflowX(): boolean {
    return this.screenBox().w > this.screenW + 0.5;
  }
  get overflowY(): boolean {
    return this.screenBox().h > this.screenH + 0.5;
  }

  /**
   * MOVE THE VIEW BY A SCREEN DELTA — the one place a screen offset becomes a target offset.
   *
   * The target lives in the DESK's coordinates, so a hand that dragged the glass ten pixels right
   * moved the target ten pixels left, TURNED BACK through the camera's own angle and divided by its
   * scale. Written anywhere else, the day the camera learned to turn every one of those places
   * would have been wrong in a different way.
   */
  private shift(dx: number, dy: number): void {
    const inv = invert(compose(rotate(this.rotation), scale(this.k)));
    if (!inv) return; // a zero scale: nothing to move, and nothing to divide by
    const d = apply(inv, { x: dx, y: dy });
    this.target = { x: this.target.x - d.x, y: this.target.y - d.y };
  }

  /**
   * HOLD THE VIEW INSIDE ITS BOUNDS. An axis with room to spare is CENTRED rather than clamped —
   * a desk smaller than the glass has no meaningful edge to be pinned against, and pinning it makes
   * the whole layout jump sideways the moment the window changes width.
   */
  clamp(): void {
    const box = this.screenBox();
    const dx =
      box.w <= this.screenW ? (this.screenW - box.w) / 2 - box.x : clamp(0, this.screenW - box.w - box.x, -box.x);
    const dy =
      box.h <= this.screenH ? (this.screenH - box.h) / 2 - box.y : clamp(0, this.screenH - box.h - box.y, -box.y);
    if (dx !== 0 || dy !== 0) this.shift(dx, dy);
  }

  /** A point on the glass, in the desk's units. The inverse of what `transform()` builds. */
  toContent(sx: number, sy: number): Point {
    const inv = invert(this.transform());
    return inv ? apply(inv, { x: sx, y: sy }) : { x: sx, y: sy };
  }

  /** Move the view by a screen-pixel delta. */
  panBy(dx: number, dy: number): void {
    this.shift(dx, dy);
    this.clamp();
  }

  /**
   * ZOOM ABOUT A POINT ON THE GLASS — and that point does not move.
   *
   * The whole world scales, so the ratio between a piece and its shadow is untouched: height is `z`
   * and never a consequence of how close the camera is (`docs/design/camera.md`).
   */
  zoomAround(sx: number, sy: number, factor: number): void {
    this.holdAt(this.toContent(sx, sy), sx, sy, this.zoom * factor);
  }

  /**
   * PUT A POINT OF THE DESK UNDER A POINT OF THE GLASS, at a zoom — what two fingers do, and what
   * every other move here turns out to be.
   *
   * A pinch is not "zoom about the midpoint": the midpoint TRAVELS, and what the hand expects is
   * that the spot it grabbed stays between the fingers wherever they carry it. So the anchor is
   * taken once, at the start, and pinned to wherever the middle is now — zooming and panning at
   * once, out of one statement rather than two that have to agree. A turn mid-gesture then needs no
   * special case at all: set the rotation, pin the anchor again, and the desk swings about the
   * fingers instead of about the middle of the glass.
   */
  holdAt(p: Point, sx: number, sy: number, zoom: number): void {
    this.zoom = clamp(zoom, this.limits.minZoom, this.limits.maxZoom);
    const now = apply(this.transform(), p);
    this.shift(sx - now.x, sy - now.y);
    this.clamp();
  }

  /** Set the zoom outright, about the middle of the glass. */
  setZoom(z: number): void {
    this.zoom = clamp(z, this.limits.minZoom, this.limits.maxZoom);
    this.clamp();
  }

  /**
   * TURN THE VIEW, about the target — which is what makes a seat a literal: the angle of a place at
   * the desk is the angle of its camera, so that player's own hand reads upright with no billboard
   * and no special case (`docs/design/camera.md`).
   */
  turnTo(deg: number): void {
    this.rotation = deg;
    this.clamp();
  }

  /** Put a point of the DESK in the middle of the glass — what "the camera looks at X" means. */
  lookAt(p: Point): void {
    this.target = p;
    this.clamp();
  }

  /**
   * The zoom at which the whole desk is on the glass, inside the limits.
   *
   * Measured on the TURNED box: a desk seen at an angle needs more room than one seen square, and a
   * fit that ignored the turn would push the corners off the glass at every angle but zero.
   */
  fitZoom(padding = 0): number {
    const w = Math.max(1, this.screenW - padding * 2);
    const h = Math.max(1, this.screenH - padding * 2);
    // Measured at zoom 1 with the turn folded in. The box scales with the zoom, so one measurement
    // answers for all of them.
    const t = compose(rotate(this.rotation), scale(this.unit));
    const corners = [
      apply(t, { x: 0, y: 0 }),
      apply(t, { x: this.content.w, y: 0 }),
      apply(t, { x: this.content.w, y: this.content.h }),
      apply(t, { x: 0, y: this.content.h }),
    ];
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const wide = Math.max(...xs) - Math.min(...xs);
    const tall = Math.max(...ys) - Math.min(...ys);
    const want = Math.min(wide > 0 ? w / wide : 1, tall > 0 ? h / tall : 1);
    return clamp(want, this.limits.minZoom, this.limits.maxZoom);
  }

  // ---- the throw --------------------------------------------------------------------------

  /**
   * The velocity a moving finger is carrying, smoothed. Fed every move; read once, at the release.
   *
   * Smoothed because one late frame produces an enormous instantaneous speed, and a desk that
   * occasionally rockets away on release is worse than one that never coasts at all.
   */
  private lastAt = 0;
  trackPan(dx: number, dy: number, nowSeconds: number): void {
    const f = this.fling;
    if (this.lastAt) {
      const dt = Math.min(f.maxGap, nowSeconds - this.lastAt);
      if (dt > 0) {
        this.vx = (1 - f.smoothing) * this.vx + f.smoothing * (dx / dt);
        this.vy = (1 - f.smoothing) * this.vy + f.smoothing * (dy / dt);
      }
    }
    this.lastAt = nowSeconds;
  }

  /** A finger has landed: whatever the view was doing, it stops under the hand. */
  grab(): void {
    this.stopFling();
    this.lastAt = 0;
  }

  /** The finger left. Throw the view with the speed it was carrying — if that was a throw at all. */
  release(): void {
    const f = this.fling;
    this.vx = clamp(this.vx, -f.cap, f.cap);
    this.vy = clamp(this.vy, -f.cap, f.cap);
    this.flinging = Math.hypot(this.vx, this.vy) > f.floor;
    this.lastAt = 0;
  }

  stopFling(): void {
    this.flinging = false;
    this.vx = 0;
    this.vy = 0;
  }

  /**
   * One step of the throw. Returns whether there is another.
   *
   * An axis that has run into its edge is killed rather than left pressing against it: a view that
   * keeps "arriving" at a wall it already reached goes on asking for frames with nothing to show.
   * Which axis stopped is read off the GLASS, because that is the space the speed is in — under a
   * turn it is not the axis the target moved along.
   */
  stepFling(dtSeconds: number): boolean {
    if (!this.flinging) return false;
    const f = this.fling;
    const was = this.transform();
    this.shift(this.vx * dtSeconds, this.vy * dtSeconds);
    this.clamp();
    const now = this.transform();
    if (now.e === was.e) this.vx = 0;
    if (now.f === was.f) this.vy = 0;
    // Frame-rate independent: the same slide at 60 Hz and at 120.
    const decay = Math.exp(-f.decay * dtSeconds);
    this.vx *= decay;
    this.vy *= decay;
    if (Math.hypot(this.vx, this.vy) < f.floor) this.flinging = false;
    return this.flinging;
  }

  // ---- what it is worth -------------------------------------------------------------------

  /** The view as numbers — everything a scrollbar or a readout needs, and nothing about nodes. */
  state(): CameraState {
    const box = this.screenBox();
    const overX = Math.max(0, box.w - this.screenW);
    const overY = Math.max(0, box.h - this.screenH);
    return {
      zoom: this.zoom,
      rotation: this.rotation,
      // Measured from the box's own corner, so a desk laid out around zero reads 0 at its left edge
      // and 1 at its right, exactly as one starting at zero does.
      scrollX: overX > 0 ? -box.x / overX : 0,
      scrollY: overY > 0 ? -box.y / overY : 0,
      thumbX: box.w > 0 ? Math.min(1, this.screenW / box.w) : 1,
      thumbY: box.h > 0 ? Math.min(1, this.screenH / box.h) : 1,
      scrollableX: overX > 1,
      scrollableY: overY > 1,
    };
  }

  /**
   * THE ONE DOOR INTO COORDINATES. Everything that turns a unit into a pixel goes through this
   * transform — nothing reads the stage's own scale or adds offsets by hand.
   *
   * Read outwards: take the desk to its target, scale it, turn it, and drop it in the middle of the
   * glass. Any other order turns "twice as big" into "twice as far away".
   */
  transform(): Transform {
    return chain([
      move(this.screenW / 2, this.screenH / 2),
      rotate(this.rotation),
      scale(this.k),
      move(-this.target.x, -this.target.y),
    ]);
  }
}

/**
 * WHO GETS THE WHEEL — the desk or the page.
 *
 * One rule: never take the wheel when taking it would stop the page being read. Zoom with a
 * modifier always means zoom. Panning is claimed only where the desk IS the page; on a page holding
 * several desks with prose between them, a canvas eating the wheel reads as a hung site rather than
 * as a desk that will not scroll.
 */
export function wheelGoesToCamera(o: { zoom: boolean; canPan: boolean; inDocument: boolean }): boolean {
  if (o.zoom) return true;
  if (o.inDocument) return false;
  return o.canPan;
}

/** A wheel delta in pixels, whatever unit the browser reported it in. */
export function wheelPixels(deltaY: number, deltaMode: number, screenHeight: number): number {
  return deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * screenHeight : deltaY;
}

/** The zoom factor a wheel notch is worth. A ratio, so out-and-back lands exactly where it began. */
export const wheelZoomFactor = (pixels: number, sensitivity = ZOOM_SENS): number => Math.exp(-pixels * sensitivity);
