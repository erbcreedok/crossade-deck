// WHAT A CAMERA IS TOLD AND WHAT IT REPORTS — the vocabulary, and the stock numbers.
//
// The numbers are PORTED, not invented: they were settled by hand against a real finger in
// `client2/src/game/engine/viewport.ts` — the fling cap, the threshold that tells a flick from a
// tremble, the decay, the wheel's sensitivity — and a second set guessed here would feel like a
// different product for no reason. They are apart from the machine that uses them because they are
// read far more often than it is: a game picks limits, it does not read the integrator.


/** Keep a number inside a range. */
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

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

/** The pan's stock feel — `client2`'s numbers verbatim, in screen pixels per second. */
export const FLING: Fling = { cap: 4000, floor: 40, decay: 5, smoothing: 0.5, maxGap: 0.1 };

/**
 * THE ZOOM'S, in NATURAL LOGARITHMS of the zoom per second — `1` is "e times bigger every second".
 *
 * Log space and not a ratio, because zoom is multiplicative: in log space a decay is symmetric, so
 * coasting outwards dies exactly as coasting inwards does. Measured any other way, letting go while
 * zooming out feels like a different mechanism from letting go while zooming in.
 *
 * These numbers are NOT `client2`'s — it had no zoom inertia to take them from. They are the pan's
 * shape with values in this quantity's own units, which is precisely why every one of them is on
 * the panel: they are a starting point to be tuned against a finger, not a settled fact.
 */
export const ZOOM_FLING: Fling = { cap: 5, floor: 0.2, decay: 6, smoothing: 0.5, maxGap: 0.1 };

/**
 * THE TURN'S, in degrees per second. Same provenance as the zoom's — chosen here, not ported.
 *
 * A coast runs for about `speed / decay` degrees, so the cap and the decay together say how far a
 * hard flick may carry: a quarter turn past the fingers. Measured on a real one, 720 with a decay
 * of five spun the desk almost half a circle after the hand had stopped, which reads as the board
 * getting away from the player rather than as momentum.
 */
export const TURN_FLING: Fling = { cap: 540, floor: 20, decay: 6, smoothing: 0.5, maxGap: 0.1 };

/**
 * HOW FAR BACK A DESK GOES BY DEFAULT, in degrees — the owner's number: a view laid back by
 * forty-five reads as the isometric look, and past it the squash (`Camera.pitch`) stops reading as
 * a desk seen from a seat and starts reading as a desk drawn wrong. Zero is straight down.
 */
export const MAX_PITCH = 45;

/** A fling that never happens: the axis stops dead with the finger. Data, so "no inertia" is a setting. */
export const NO_FLING: Fling = { cap: 0, floor: Infinity, decay: Infinity, smoothing: 0.5, maxGap: 0.1 };

/**
 * INERTIA IS PER AXIS, because the three are three different feels in three different units — and
 * because a game that wants a desk to coast under the hand may still want the zoom to stop dead.
 * One switch for all three would make that unsayable.
 */
export interface Inertia {
  readonly pan: Fling;
  readonly zoom: Fling;
  readonly turn: Fling;
}

/** All three at their stock feel. */
export const INERTIA: Inertia = { pan: FLING, zoom: ZOOM_FLING, turn: TURN_FLING };

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
  /** Two fingers drawn up or down the glass TOGETHER lay the desk back and set it flat again. */
  readonly tilt: boolean;
}

/** The hand may do everything — what a desk with nothing to hide starts as. */
export const FREE_INPUT: CameraInput = { pan: true, zoom: true, rotate: true, tilt: true };
/** Look, do not touch: every gesture refused, while the game still moves the view itself. */
export const LOCKED_INPUT: CameraInput = { pan: false, zoom: false, rotate: false, tilt: false };

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
  /** How each axis coasts. Any subset — what is not named keeps the stock feel. */
  readonly inertia?: Partial<Inertia>;
  /** What the player's hand may do. Absent, everything — see `CameraInput`. */
  readonly input?: CameraInput;
  /**
   * HOW FAR THE DESK MAY BE LAID BACK, in degrees. Absent, the stock `MAX_PITCH`. Zero is straight
   * down, and the floor is always zero: a camera does not look at a desk from underneath.
   */
  readonly maxPitch?: number;
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
export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
