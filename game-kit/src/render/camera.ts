// THE CAMERA — how the desk is LOOKED AT, as pure arithmetic with no renderer in it.
//
// Ported, not invented: this is `client2/src/game/engine/viewport.ts` moved onto the kit's terms,
// numbers and all. Those numbers were settled by hand against a real finger — the fling cap, the
// threshold that tells a flick from a tremble, the decay, the wheel's zoom sensitivity — and a
// second set guessed here would feel like a different product for no reason.
//
// It holds NUMBERS ONLY and draws nothing. The plan asks it for a transform; the painter never
// hears of it. That is what keeps everything below the camera checkable headless: a desk, its
// pieces, their rules and the composition of `z` and angles are data and mathematics, and rendering
// begins only here (`docs/design/camera.md`).
//
// The camera is LOCAL and never part of a game's state. A view is not a truth, so there is nothing
// to synchronise: one desk may be looked at by many cameras at once — a seat, a minimap, a watcher.

import { compose, move, scale, type Transform } from "../core/transform.js";
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

export interface CameraLimits {
  /** How far out the desk may be pushed. */
  readonly minZoom: number;
  /** How far in. */
  readonly maxZoom: number;
  /** The inertia this camera throws with. Absent, the stock feel. */
  readonly fling?: Fling;
}

/** What the view is worth right now — enough to draw a scrollbar without asking anything else. */
export interface CameraState {
  readonly zoom: number;
  /** 0…1 along each axis, and how much of the whole is on screen. `0` when there is nothing to scroll. */
  readonly scrollX: number;
  readonly scrollY: number;
  readonly thumbX: number;
  readonly thumbY: number;
  readonly scrollableX: boolean;
  readonly scrollableY: boolean;
}

/**
 * THE CAMERA. `x`/`y` are the desk's offset on the glass in screen pixels and `zoom` multiplies the
 * unit; the pair is exactly what the view transform is built from.
 *
 * The bounds are told to it rather than discovered: a camera knows the size of the SCREEN and the
 * size of the CONTENT, and everything else — where the view may go, whether an axis can scroll at
 * all, where a fling has to stop — follows from those two. Nothing here reads a node.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  private screenW = 1;
  private screenH = 1;
  /** The content's extent in UNITS — the same units a node's box is in. */
  private contentW = 1;
  private contentH = 1;
  /** Screen pixels per unit at zoom 1 — the fit the viewer settled on. */
  private unit = 1;

  private vx = 0;
  private vy = 0;
  /** Whether a throw is still running. Read by the clock to know if there is another frame to draw. */
  flinging = false;

  constructor(readonly limits: CameraLimits) {
    this.zoom = clamp(1, limits.minZoom, limits.maxZoom);
  }

  private get fling(): Fling {
    return this.limits.fling ?? FLING;
  }

  /** How big the glass is, in screen pixels. */
  setScreen(width: number, height: number): void {
    this.screenW = width;
    this.screenH = height;
  }

  /** How big the desk is, in units, and what a unit is worth in pixels before zoom. */
  setContent(width: number, height: number, unit: number): void {
    this.contentW = width;
    this.contentH = height;
    this.unit = unit;
  }

  /** The content's size on the glass right now — extent × unit × zoom. */
  private get shownW(): number {
    return this.contentW * this.unit * this.zoom;
  }
  private get shownH(): number {
    return this.contentH * this.unit * this.zoom;
  }

  /**
   * IS THERE ANYWHERE TO GO on this axis — is the desk, at this zoom, bigger than the glass?
   *
   * The wheel needs it. A scene that swallows the wheel while having nothing to scroll leaves the
   * page under it frozen, and from the outside that reads as a hung site rather than as a desk
   * declining to move.
   */
  get overflowX(): boolean {
    return this.shownW > this.screenW + 0.5;
  }
  get overflowY(): boolean {
    return this.shownH > this.screenH + 0.5;
  }

  /**
   * HOLD THE VIEW INSIDE ITS BOUNDS. An axis with room to spare is CENTRED rather than clamped —
   * a desk smaller than the glass has no meaningful edge to be pinned against, and pinning it makes
   * the whole layout jump sideways the moment the window changes width.
   */
  clamp(): void {
    const w = this.shownW;
    const h = this.shownH;
    this.x = w <= this.screenW ? (this.screenW - w) / 2 : clamp(this.x, this.screenW - w, 0);
    this.y = h <= this.screenH ? (this.screenH - h) / 2 : clamp(this.y, this.screenH - h, 0);
  }

  /** A point on the glass, in the desk's units. The inverse of what `transform()` builds. */
  toContent(sx: number, sy: number): Point {
    const k = this.unit * this.zoom;
    return { x: (sx - this.x) / k, y: (sy - this.y) / k };
  }

  /** Move the view by a screen-pixel delta. */
  panBy(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
    this.clamp();
  }

  /**
   * ZOOM ABOUT A POINT ON THE GLASS — and that point does not move.
   *
   * The whole world scales, so the ratio between a piece and its shadow is untouched: height is `z`
   * and never a consequence of how close the camera is (`docs/design/camera.md`).
   */
  zoomAround(sx: number, sy: number, factor: number): void {
    const held = this.toContent(sx, sy);
    this.zoom = clamp(this.zoom * factor, this.limits.minZoom, this.limits.maxZoom);
    const k = this.unit * this.zoom;
    this.x = sx - held.x * k;
    this.y = sy - held.y * k;
    this.clamp();
  }

  /** Set the zoom outright, about the middle of the glass. */
  setZoom(z: number): void {
    const want = clamp(z, this.limits.minZoom, this.limits.maxZoom);
    this.zoomAround(this.screenW / 2, this.screenH / 2, want / this.zoom);
  }

  /** Put a point of the DESK in the middle of the glass — what "the camera looks at X" means. */
  lookAt(p: Point): void {
    const k = this.unit * this.zoom;
    this.x = this.screenW / 2 - p.x * k;
    this.y = this.screenH / 2 - p.y * k;
    this.clamp();
  }

  /** The zoom at which the whole desk is on the glass, inside the limits. */
  fitZoom(padding = 0): number {
    const w = Math.max(1, this.screenW - padding * 2);
    const h = Math.max(1, this.screenH - padding * 2);
    const wide = this.contentW * this.unit;
    const tall = this.contentH * this.unit;
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
   */
  stepFling(dtSeconds: number): boolean {
    if (!this.flinging) return false;
    const f = this.fling;
    const wasX = this.x;
    const wasY = this.y;
    this.x += this.vx * dtSeconds;
    this.y += this.vy * dtSeconds;
    this.clamp();
    if (this.x === wasX) this.vx = 0;
    if (this.y === wasY) this.vy = 0;
    // Frame-rate independent: the same slide at 60 Hz and at 120.
    const k = Math.exp(-f.decay * dtSeconds);
    this.vx *= k;
    this.vy *= k;
    if (Math.hypot(this.vx, this.vy) < f.floor) this.flinging = false;
    return this.flinging;
  }

  // ---- what it is worth -------------------------------------------------------------------

  /** The view as numbers — everything a scrollbar or a readout needs, and nothing about nodes. */
  state(): CameraState {
    const w = this.shownW;
    const h = this.shownH;
    const overX = Math.max(0, w - this.screenW);
    const overY = Math.max(0, h - this.screenH);
    return {
      zoom: this.zoom,
      scrollX: overX > 0 ? -this.x / overX : 0,
      scrollY: overY > 0 ? -this.y / overY : 0,
      thumbX: w > 0 ? Math.min(1, this.screenW / w) : 1,
      thumbY: h > 0 ? Math.min(1, this.screenH / h) : 1,
      scrollableX: overX > 1,
      scrollableY: overY > 1,
    };
  }

  /**
   * THE ONE DOOR INTO COORDINATES. Everything that turns a unit into a pixel goes through this
   * transform — nothing reads the stage's own scale or adds offsets by hand.
   */
  transform(): Transform {
    return compose(move(this.x, this.y), scale(this.unit * this.zoom));
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
