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

import { apply, chain, compose, invert, move, rotate, scale, type Transform } from "../../core/transform.js";
import { type Point } from "../../core/atoms/bounded.js";
import {
  clamp,
  FLING,
  FREE_INPUT,
  INERTIA,
  NO_FLING,
  TURN_FLING,
  ZOOM_FLING,
  type Box,
  type CameraContent,
  type CameraInput,
  type CameraLimits,
  type CameraState,
  type Fling,
  type Inertia,
} from "./limits.js";

export * from "./limits.js";
export * from "./wheel.js";

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
  /**
   * HOW FAR THE DESK IS LAID BACK, in degrees — 0 is straight down onto it, 60 is a low seat.
   *
   * It is a SQUASH along the screen's own vertical, `cos(pitch)`, and that keeps the whole view
   * affine: the finger, the clamp, the contours and the painter go on working untouched, because
   * every one of them speaks in 2×3 matrices. A true perspective would need a divide, which a 2×3
   * cannot express and which this renderer takes no other shape for.
   *
   * So the pitch PLACES things on a tilted plane and does not converge their edges: a desk drawn as
   * one huge plate stays a rectangle rather than a trapezoid. What stands up out of that plane is
   * per element and not the camera's business at all — a node framed to the viewer
   * (`Oriented: "viewer"`) is drawn at full height where it sits, which is the poker table's look:
   * the cloth lies, the cards stand.
   */
  pitch = 0;

  private screenW = 1;
  private screenH = 1;
  /** The content's rect in UNITS — the same units a node's box is in, corner included. */
  private content: CameraContent = { x: 0, y: 0, w: 1, h: 1 };
  /** Screen pixels per unit at zoom 1 — the fit the viewer settled on. */
  private unit = 1;

  /** Screen px/s, log-zoom/s and degrees/s — one velocity per axis, each in its own units. */
  private vx = 0;
  private vy = 0;
  private vz = 0;
  private vr = 0;
  /**
   * The glass point a coasting zoom or turn keeps still, and the desk point under it — taken at the
   * release. Without it a throw that zooms would swing the desk about the middle of the screen the
   * instant the fingers left, which reads as a lurch rather than as a continuation.
   */
  private coast: { glass: Point; desk: Point } | undefined;
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
    return this.limits.inertia?.pan ?? FLING;
  }
  private get zoomFling(): Fling {
    return this.limits.inertia?.zoom ?? ZOOM_FLING;
  }
  private get turnFling(): Fling {
    return this.limits.inertia?.turn ?? TURN_FLING;
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

  /**
   * What the pitch does to a height: `cos(pitch)`, and never below a hair of one.
   *
   * A flat zero would collapse the desk onto a line — every quad zero pixels tall, every inverse
   * matrix singular, and a picture that cannot be told from a renderer that failed. Ninety degrees
   * is edge-on, and edge-on is not a view.
   */
  get squash(): number {
    return Math.max(0.02, Math.cos((this.pitch * Math.PI) / 180));
  }

  /**
   * HOW BIG THE GLASS IS — what `setScreen` was told, given back.
   *
   * A READING, like `x` and `y` below: anything that has to say where a point of the desk lands
   * relative to the EDGES of the view — a leash holding an avatar on screen, a minimap — needs the
   * rectangle, and measuring it a second time off the DOM is how two answers to one question start
   * to disagree by a frame.
   */
  get glass(): { w: number; h: number } {
    return { w: this.screenW, h: this.screenH };
  }

  /** Screen pixels per unit right now — the total, etalon and zoom together. A READING. */
  get pixelsPerUnit(): number {
    return this.k;
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
    const t = chain([scale(1, this.squash), rotate(this.rotation), scale(this.unit)]);
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

  /**
   * THE ZOOM AT WHICH THE CONTENT'S OWN WIDTH SPANS `span` GLASS-WIDTHS — `fitZoom` shrinks the
   * content to fit inside the glass, this instead lets it overflow the glass on purpose, by exactly
   * `span`. The round felt's own home (owner: table diameter = 1.5× the glass) is this at `1.5`, not
   * a fit: fit shows the whole room, rim and all, and the seat asked for is barely bigger than a coin.
   *
   * Measured at zoom 1 with the unit folded in, same as `fitZoom` — but NOT the turn: only a square
   * room ever calls this (the round table's), where a turn changes nothing about the width.
   */
  spanZoom(span: number): number {
    const w = Math.max(1, this.screenW);
    return clamp((w * span) / (this.content.w * this.unit), this.limits.minZoom, this.limits.maxZoom);
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
    const dt = this.sampleGap(f, nowSeconds);
    if (dt > 0) {
      this.vx = (1 - f.smoothing) * this.vx + f.smoothing * (dx / dt);
      this.vy = (1 - f.smoothing) * this.vy + f.smoothing * (dy / dt);
    }
  }

  /**
   * What a pinch is carrying — the zoom as a RATIO since the last sample (`1.05` for five per cent
   * bigger) and the turn in degrees. ONE call for both, because they arrive on one event and the
   * interval between samples may only be spent once: two calls and the second reads a gap of zero,
   * which is a turn that can never be thrown and a bug with nothing to see.
   *
   * The zoom is kept in log space, where a decay is symmetric — so coasting outwards dies exactly
   * as coasting inwards does, instead of feeling like two different mechanisms.
   */
  trackPinch(factor: number, deg: number, nowSeconds: number): void {
    const z = this.zoomFling;
    const dt = this.sampleGap(z, nowSeconds);
    if (dt <= 0) return;
    if (factor > 0) this.vz = (1 - z.smoothing) * this.vz + z.smoothing * (Math.log(factor) / dt);
    const r = this.turnFling;
    this.vr = (1 - r.smoothing) * this.vr + r.smoothing * (deg / dt);
  }

  /**
   * Seconds since the previous sample, or nothing at all for the first one — a gesture's first
   * event has no interval behind it, and dividing by the time since the last GESTURE would read a
   * speed of thousands from a hand that has not moved yet.
   *
   * One clock for all three axes, because they are all sampled from the same events.
   */
  private sampleGap(f: Fling, nowSeconds: number): number {
    const had = this.lastAt;
    this.lastAt = nowSeconds;
    return had ? Math.min(f.maxGap, nowSeconds - had) : 0;
  }

  /** A finger has landed: whatever the view was doing, it stops under the hand. */
  grab(): void {
    this.stopFling();
    this.lastAt = 0;
  }

  /**
   * THE SAME GESTURE, FEWER FINGERS — one of a pinch's two has lifted and the other is still down.
   *
   * Not a `grab`, and the difference is the whole reason this exists: two fingers never leave the
   * glass in the same millisecond, so treating the first departure as a fresh hand throws away
   * everything the pinch was carrying — and a zoom would then coast exactly never. What IS dropped
   * is the pan's speed, because the finger that was measuring it has gone.
   */
  handOver(): void {
    this.vx = 0;
    this.vy = 0;
    this.lastAt = 0;
  }

  /**
   * The fingers left. Each axis throws with the speed IT was carrying, or does not throw at all —
   * a gesture that only zoomed has nothing to say about panning, and its pan velocity is zero, so
   * no rule is needed to keep a pinch from sliding the desk.
   *
   * `hold` is the glass point a coasting zoom or turn keeps still — the middle of the fingers. The
   * glass centre when nothing is said, which is the right answer for a pan, whose coast ignores it.
   */
  release(hold?: Point): void {
    const glass = hold ?? { x: this.screenW / 2, y: this.screenH / 2 };
    this.coast = { glass, desk: this.toContent(glass.x, glass.y) };
    const p = this.fling;
    this.vx = clamp(this.vx, -p.cap, p.cap);
    this.vy = clamp(this.vy, -p.cap, p.cap);
    if (Math.hypot(this.vx, this.vy) <= p.floor) {
      this.vx = 0;
      this.vy = 0;
    }
    const z = this.zoomFling;
    this.vz = clamp(this.vz, -z.cap, z.cap);
    if (Math.abs(this.vz) <= z.floor) this.vz = 0;
    const r = this.turnFling;
    this.vr = clamp(this.vr, -r.cap, r.cap);
    if (Math.abs(this.vr) <= r.floor) this.vr = 0;
    this.flinging = this.vx !== 0 || this.vy !== 0 || this.vz !== 0 || this.vr !== 0;
    this.lastAt = 0;
  }

  stopFling(): void {
    this.flinging = false;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.vr = 0;
    this.coast = undefined;
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
    // THE ZOOM AND THE TURN FIRST, and both about the point the fingers left — a coast that swung
    // the desk about the middle of the glass instead would lurch at the very moment the hand let go.
    if (this.vz !== 0 || this.vr !== 0) {
      const at = this.coast ?? { glass: { x: this.screenW / 2, y: this.screenH / 2 }, desk: this.target };
      const want = this.zoom * Math.exp(this.vz * dtSeconds);
      if (this.vr !== 0) this.rotation += this.vr * dtSeconds;
      this.holdAt(at.desk, at.glass.x, at.glass.y, want);
      // A zoom that has run into its own limit is done: pressing on against it asks for frames with
      // nothing to show, exactly as an axis pressed against the edge of the desk does.
      if (this.zoom === this.limits.minZoom || this.zoom === this.limits.maxZoom) this.vz = 0;
    }
    const was = this.transform();
    if (this.vx !== 0 || this.vy !== 0) {
      this.shift(this.vx * dtSeconds, this.vy * dtSeconds);
      this.clamp();
      const now = this.transform();
      if (now.e === was.e) this.vx = 0;
      if (now.f === was.f) this.vy = 0;
    }
    // Frame-rate independent, each on its own curve: the same slide at 60 Hz and at 120.
    const pan = Math.exp(-this.fling.decay * dtSeconds);
    this.vx *= pan;
    this.vy *= pan;
    this.vz *= Math.exp(-this.zoomFling.decay * dtSeconds);
    this.vr *= Math.exp(-this.turnFling.decay * dtSeconds);
    if (Math.hypot(this.vx, this.vy) < this.fling.floor) {
      this.vx = 0;
      this.vy = 0;
    }
    if (Math.abs(this.vz) < this.zoomFling.floor) this.vz = 0;
    if (Math.abs(this.vr) < this.turnFling.floor) this.vr = 0;
    this.flinging = this.vx !== 0 || this.vy !== 0 || this.vz !== 0 || this.vr !== 0;
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
      // THE PITCH SITS OUTSIDE THE ROLL, because it belongs to the camera and not to the desk: a
      // head tilted back squashes what it sees along the SCREEN's vertical, whichever way the desk
      // happens to be turned underneath. Composed the other way round, rolling the view would
      // carry the tilt round with it, and the horizon would rotate.
      scale(1, this.squash),
      rotate(this.rotation),
      scale(this.k),
      move(-this.target.x, -this.target.y),
    ]);
  }
}
