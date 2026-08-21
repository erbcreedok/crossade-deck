// WHAT THE RUNTIME IS HOLDING — one record per kind of motion in flight. They are the runtime's
// private bookkeeping and no game ever sees one; they are apart from it because reading the loop
// means knowing what is in these maps, and that should not require reading the loop first.

import { type NodeId } from "../../core/node.js";
import { type Motion } from "../../core/motion.js";
import { type SpringConfig, type SpringState } from "../../core/spring.js";
import { type CarryStyle } from "../../core/atoms/carry.js";
import { type Body, type Walls } from "../../core/ballistic.js";
import { type Transform, type Vec } from "../../core/transform.js";
import { type CarryItem, type WallHit } from "./motions.js";
import { type Tumbling } from "./physics.js";

/** The live state of a spring carry — the springs, the target, and the style + tune to play them. */
export interface Carry {
  readonly items: readonly CarryItem[];
  readonly style: CarryStyle;
  target: Vec;
  sx: SpringState;
  sy: SpringState;
  sl: SpringState;
  /** The BANK — the lean actually drawn, chasing the lean the speed asks for. Degrees. */
  sa: SpringState;
  readonly liftTo: number;
  readonly follow: SpringConfig;
  readonly liftCfg: SpringConfig;
  readonly bankCfg: SpringConfig;
  readonly tiltFactor: number;
  readonly tiltMax: number;
  /** The tray, if the gesture has one, and what to say when the border ends it. */
  readonly walls: Walls | undefined;
  readonly wallSpeed: number;
  readonly wallBounce: number;
  readonly leash: number;
  readonly onWall: ((hit: WallHit) => void) | undefined;
  readonly onSnap: ((ids: readonly NodeId[], at: Vec) => void) | undefined;
}

/**
 * A choreography: a pose per node per progress, one commit at a phase. A turn-over is one of one
 * node; a shuffle is one over a container's children; a tumble is one of one node again. All three
 * are the same thing to the clock, which is what keeps them on the same speed and the same law
 * (a node in choreography is raised, and its settle is held until the choreography ends).
 */
export interface Choreo {
  readonly ids: readonly NodeId[];
  readonly startMs: number; // warped
  readonly durMs: number;
  readonly poseAt: (i: number, n: number, t: number, rest: Transform) => Transform;
  readonly commitAt: number;
  readonly commit: () => void;
  committed: boolean;
  /**
   * The progresses at which the LOOK underneath changes hands — a die's face going over. Empty for
   * a choreography that shows one thing throughout (a turn-over, a shuffle: there the pieces move
   * and nothing about them is redrawn).
   */
  readonly beats: readonly number[];
  readonly onBeat: ((count: number, last: boolean) => void) | undefined;
  beaten: number;
  /**
   * THE PIECE IS AT EVERY PLACE IT PASSES, rather than on its way to one — so its shadow travels
   * with it instead of waiting at the seat.
   *
   * The distinction is the shadow law itself (`PlanInput.grounded`), and it is not "does it move":
   * a settle and a turn-over move too, and their shadow rightly waits at the seat they are heading
   * for. What earns this flag is a choreography whose whole subject is TRAVEL — a bounce goes up
   * the screen and the piece is genuinely up there, and a shadow left behind would say the square
   * is in two places.
   */
  readonly rides?: boolean;
}

/**
 * A body in flight — a fall down the screen or a slide across the desk. The two differ in what a
 * step DOES and when the flight is OVER, and both are carried as functions: the runtime steps and
 * asks, it never reads which sort of flight this is.
 */
export interface Flight {
  body: Body;
  /** Warped ms at which it starts moving; before that it sits at rest (a cascade's stagger). */
  readonly goMs: number;
  started: boolean;
  /** One step of its physics, `dt` already warped by the viewer's speed. */
  readonly step: (b: Body, dt: number) => Body;
  /** True once it is over — off the glass, or resting. */
  readonly over: (b: Body) => boolean;
  /** The body as "no animation" leaves it: a fall is gone, a slide stands still. */
  readonly halt: (b: Body) => Body;
  /** The rest pose's own turn, degrees — the body's `angle` is on top of it, and the landing reports their sum. */
  angle0: number;
  /** What the body shows as it goes, if it shows anything — absent for a fall, which only falls. */
  readonly tumble: Tumbling | undefined;
  /** True for a body travelling ACROSS the desk: it is on the felt, so its shadow goes with it. */
  readonly onDesk: boolean;
  readonly done: ((rest: { readonly at: Vec; readonly angle: number }) => void) | undefined;
}


/**
 * Attach the motion runtime to a host + painter — use this INSTEAD of `attachPainter` on a scene
 * that should animate. It paints the first frame, then repaints on every tree change, easing any
 * node whose rest pose moved.
 */
