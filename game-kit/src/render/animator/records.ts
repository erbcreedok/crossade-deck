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
  items: readonly CarryItem[];
  readonly style: CarryStyle;
  target: Vec;
  sx: SpringState;
  sy: SpringState;
  sl: SpringState;
  /** The BANK — the lean actually drawn, chasing the lean the speed asks for. Degrees. */
  sa: SpringState;
  /** The orient spring, chasing `targetOrient` — the run's base world angle. Degrees. */
  so: SpringState;
  targetOrient: number;
  /** The lift the spring chases — the tuning's, unless the run is HOISTED over something (`Motions.hoist`). */
  liftTo: number;
  /**
   * THE STAND — how far the run has come up out of a laid-back desk, 0…1, chasing one on the lift's
   * own spring (`PlanInput.stood`). What a hand holds is level to the eye; it gets there as it is
   * lifted, and lies back down on the settle's road once it is let go (`standDown` in the runtime).
   */
  ss: SpringState;
  readonly follow: SpringConfig;
  readonly liftCfg: SpringConfig;
  readonly bankCfg: SpringConfig;
  readonly tiltFactor: number;
  readonly tiltMax: number;
  /**
   * Is the run framed to the VIEWER (`Oriented: "viewer"`) — a chess piece, never a card lying flat
   * on the desk? Decided once, at the grab, from the pieces actually picked up: it says whether the
   * bank is read off the desk's own `x` (`lean`) or off the ONLOOKER's screen `x` (`screenLean`),
   * which only differ once a camera has turned.
   */
  readonly viewerFramed: boolean;
  /**
   * EACH PIECE'S OWN RESTING POSE, captured when the hand closed on it.
   *
   * A style builds a carried pose from nothing — a point, a lean, a lift — which is right for where
   * the piece goes and wrong for what it IS: a face-down card's mirror lives in its resting pose,
   * and a pose built from scratch has no mirror in it. The card was drawn face-up in the hand and
   * eased back through its own edge on release, which reads as a turn nobody asked for.
   */
  readonly bases: ReadonlyMap<NodeId, Transform>;
  /** The tray, if the gesture has one, and what to say when the border ends it. */
  readonly walls: Walls | undefined;
  readonly wallSpeed: number;
  readonly wallBounce: number;
  readonly leash: number;
  readonly onWall: ((hit: WallHit) => void) | undefined;
  readonly onSnap: ((ids: readonly NodeId[], at: Vec) => void) | undefined;
  /**
   * HOW FAR EACH PIECE AFTER THE FIRST FALLS BEHIND — `0` (the default) is a run carried as one
   * plank, and everything above it stretches the run out behind the hand and lets it close up again
   * when the hand stops.
   *
   * The first item is never late: it is the thing the hand actually has hold of, and a handle that
   * lagged the finger would be a control moving away from the hand holding it. What trails is what
   * is hanging off it.
   */
  readonly trail: number;
  /** Each item's own chase, when the run trails. Index 0 is unused — it rides the anchor exactly. */
  tails: readonly { x: SpringState; y: SpringState }[];
  /**
   * HOW FAR EACH PIECE STILL IS FROM WHERE THE RUN SAYS IT BELONGS — the gap between where the hand
   * found it and the seat its offset gives it, decaying to nothing on the settle's own road.
   *
   * Zero for every ordinary drag, where a run keeps the shape it was lying in and the offsets ARE
   * where the pieces are. It is not zero when the run is ARRANGED as it is lifted — a heap pulled
   * into a stack by its handle — and then this is the difference between the pieces falling into
   * line and snapping into it. A hand closing on a heap gathers it; it does not teleport it.
   */
  gaps: readonly Vec[];
  /** Warped ms the gathering began. */
  gatheredMs: number;
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
  readonly rides?: boolean | undefined;
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
  /**
   * THE HAND'S BANK, still on the piece at take-off — degrees between the turn it was DRAWN at and
   * the turn it RESTS at, and it unwinds to nothing over `settleMs` while the body flies.
   *
   * A carried piece leans into the direction it is being carried, and that lean belongs to the hand
   * and not to the piece. Let go, a piece with no flight simply settles home and the bank comes off
   * on the way — that is the ordinary reconcile. A flight replaces the whole pose, so without this
   * the bank has nowhere to go: it either vanishes on the frame the body takes off, or is held rigid
   * for the entire fall and snaps upright on landing. Both are the same defect wearing two faces.
   */
  lean: number;
  /**
   * How much of that bank is STILL ON, 0..1 — and it only ever falls.
   *
   * Only ever, because the road home is the body's own DESCENT and a bounce sends the body back up:
   * read straight off the height every frame, a piece would re-bank each time the desk threw it up.
   */
  leanLeft: number;
  /** The height it took off at, root units — what its descent is measured against. */
  up0: number;
  /** Warped ms the bank began coming off — take-off, not the moment the flight was filed. */
  leanFromMs: number;
  /** What the body shows as it goes, if it shows anything — absent for a fall, which only falls. */
  readonly tumble: Tumbling | undefined;
  /** True for a body travelling ACROSS the desk: it is on the felt, so its shadow goes with it. */
  readonly onDesk: boolean;
  /**
   * How much room this body takes from another one, root units, and `0` for one that takes none.
   *
   * Zero is the default and means "alone on the desk": a card lands on a card and that is what a
   * desk is for. Two bodies that BOTH state a girth are kept out of each other's way while they
   * travel — see `separate`.
   */
  readonly girth: number;
  /** What it gives back off another body, 0..1. */
  readonly bodyBounce: number;
  /** The world it is solid in — see `SlideOptions.solid`. Bodies of different worlds never meet. */
  readonly solid: string;
  /** It holds its place: solid to its world, moved by none of it — see `SlideOptions.anchored`. */
  readonly anchored: boolean;
  readonly done: ((rest: { readonly at: Vec; readonly angle: number }) => void) | undefined;
}


/**
 * Attach the motion runtime to a host + painter — use this INSTEAD of `attachPainter` on a scene
 * that should animate. It paints the first frame, then repaints on every tree change, easing any
 * node whose rest pose moved.
 */
