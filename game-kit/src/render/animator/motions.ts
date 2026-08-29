// THE RUNTIME'S PUBLIC WORD — the clock it runs on, the options every verb takes, and the closed
// list of verbs itself. Nothing here does anything: it is what a game reads before it calls, and
// keeping it apart from the machinery is what lets that reading happen without scrolling past 700
// lines of springs.

import { type Node, type NodeId } from "../../core/node.js";
import { type TuningPatch, type MotionTuning } from "../../core/motion.js";
import { type CarryTuning } from "../../core/motion.js";
import { type Body, type Walls } from "../../core/ballistic.js";
import { type GlideLaw } from "../../core/glide.js";
import { type Transform, type Vec } from "../../core/transform.js";
import { type TextMeasure } from "../textMetrics.js";
import { type MotionRecipe } from "../motions.js";

/** The one clock, injectable. `frame` schedules a single callback and returns its canceller. */
export interface Clock {
  now(): number;
  frame(cb: () => void): () => void;
}

/** The runtime's options: the game's tuning (any subset), plus the clock and the bake predicate. */
export type MotionOptions = TuningPatch & {
  /** The clock. Default a `requestAnimationFrame` one; tests inject a fake. */
  readonly clock?: Clock;
  /** Which nodes bake — passed straight to the frame, same meaning as `attachPainter`. */
  readonly bake?: (node: Node) => boolean;
  /** The ruler captions lay out against — passed straight to the frame, as `attachPainter` takes it. */
  readonly measure?: TextMeasure | undefined;
  /**
   * The view every frame is drawn through — a camera's `transform()`, as `attachPainter` takes it.
   *
   * A getter, and for a sharper reason here than there: this runtime draws frames of its own accord,
   * so a view captured once would freeze the desk at the moment the clock started while the springs
   * carried on moving inside it.
   */
  readonly view?: (() => Transform) | undefined;
  /** How far the camera is laid back, beside the view — passed straight to the frame. */
  readonly pitch?: (() => number) | undefined;
};

/** One node in a carried run, with its base layout offset from the grab pivot (root units). */
export interface CarryItem {
  readonly id: NodeId;
  readonly offset: Vec;
}

/**
 * WHAT THE WALL DID TO A CARRIED RUN — the run was shoved into the tray's border hard enough that
 * the border won. The gesture is already over when this arrives: the run is off the finger, standing
 * at the wall, and what flies back is the game's word (a die throws itself, a card may just lie).
 */
export interface WallHit {
  /** The run that was on the finger, in the order it was grabbed. */
  readonly ids: readonly NodeId[];
  /** Where the run stands now — the anchor, on the wall, root units. */
  readonly at: Vec;
  /** How fast it went INTO the wall, units/s — always positive, and at least the tuning's `wallSpeed`. */
  readonly speed: number;
  /** What it comes off with: the finger's velocity reflected off the wall, `wallBounce` of it left. */
  readonly velocity: Vec;
}

/** How a carry feels — the anchor, and any of the carry fields of the tuning as a per-gesture patch. */
export type CarryOptions = {
  /** The grab pivot in root units — where the finger is now. Seeds the springs, so nothing jumps. */
  readonly anchor: Vec;
  /**
   * THE TRAY THE RUN MAY NOT LEAVE, root units — the box the ANCHOR is held inside, which is the
   * same thing a `slide` bounces off (inset it by the piece's own half: `wallsOf(root, tray, half)`).
   *
   * Without it a finger carries a piece anywhere and lets it go there. With it the border is real
   * while the hand is on the piece: the run stops at the wall and goes on straining after the
   * finger, and the gesture can end there in two ways — shoved in hard, the wall knocks the run off
   * the hand (`onWall`); pulled on past `leash`, the hold simply breaks (`onSnap`).
   */
  readonly walls?: Walls | undefined;
  /** The wall won: the run is off the finger at the border, with the bounce it earned. */
  readonly onWall?: ((hit: WallHit) => void) | undefined;
  /**
   * The hold broke: the finger went too far past a wall the run could not follow it through, and
   * the run is left standing at `at` — where the game decides whether that is its new seat.
   */
  readonly onSnap?: ((ids: readonly NodeId[], at: Vec) => void) | undefined;
} & { readonly [K in keyof CarryTuning]?: CarryTuning[K] | undefined };

/** A throw down the SCREEN: gravity pulls, a floor bounces, the body leaves the glass sideways. */
export type LaunchOptions = {
  /** Initial speed, root units per second. */
  readonly speed: number;
  /** Heading, degrees clockwise from +x — `270` is straight up the screen. */
  readonly angle: number;
  /** Turn rate while flying, degrees/s. Default 0. */
  readonly spin?: number | undefined;
  /** The y (root units) it bounces off. Default: the bottom edge of the glass. */
  readonly floor?: number | undefined;
  /** Wait this long (ms, on the warped clock) before it goes — a cascade's stagger. */
  readonly delayMs?: number | undefined;
  /**
   * Runs at every bounce off the floor, with the count so far (1 on the first). The cue a cascade
   * chains on: the next card goes when this one has touched down once.
   */
  readonly onBounce?: ((count: number) => void) | undefined;
  /** Runs once the body has left the glass; the override is gone and the node is at its rest again. */
  readonly onDone?: (() => void) | undefined;
} & { readonly gravity?: number | undefined; readonly bounce?: number | undefined };

/** A throw across the DESK: a glide law bleeds speed and spin, walls reflect, it stops where it stops. */
export type SlideOptions = {
  readonly speed: number;
  readonly angle: number;
  /**
   * HOW HIGH IT STARTS, root units above the desk — a card that leaves a raised hand rather than
   * skating off the felt. It falls under the tuning's `gravity` from there, and the flight grows its
   * apparent size by the height it is at, so "loses height and size" is one thing and not two.
   * Default `0`: a body on the desk.
   */
  readonly up?: number | undefined;
  /** Turn rate, degrees/s. Default 0. */
  readonly spin?: number | undefined;
  /**
   * HOW HARD IT COMES OFF THE DESK, units/s of rise. A thrown die does not skate — it bounces, and
   * each landing turns its run a little, so it wanders instead of running a line. `0` (the default)
   * is a puck: flat all the way. It falls under the tuning's `gravity` and gives back `bounce` of
   * every landing, and a wall throws it higher than the hop it was already on.
   */
  readonly hop?: number | undefined;
  /** The tray, root units. Default: the whole desk, endless. */
  readonly walls?: Walls | undefined;
  readonly delayMs?: number | undefined;
  /**
   * The piece has travelled far enough to be SHOWING something new — a die going over an edge. See
   * `TURN_PER_FACE`: the cue is the body's own motion, so it thins out exactly as the body slows.
   * `last` is the one the result belongs on: the body is still moving, and nothing after it changes
   * the picture.
   */
  readonly onTumble?: ((count: number, last: boolean) => void) | undefined;
  /**
   * Runs when the body rests, with WHERE it rests (root units) and how it is turned. The override is
   * gone the same frame — a game that wants the piece to stay writes this pose into the tree.
   */
  readonly onDone?: ((rest: { readonly at: Vec; readonly angle: number }) => void) | undefined;
} & {
  /** The run-out law for this throw — a registry name, or one built on the spot (`decayGlide`). */
  readonly glide?: string | GlideLaw | undefined;
  /** The same for the turn. */
  readonly spinGlide?: string | GlideLaw | undefined;
  readonly bounce?: number | undefined;
};

/**
 * A THROW THAT IS AIMED — `UISnapBehavior`: the body keeps whatever momentum it has while a spring
 * draws it to a place the game has already chosen. A piece arriving fast is caught at speed, one
 * arriving a little off is tugged the last hair, and neither is a case anybody writes.
 *
 * It is the answer to "the zone catches it", and to a card that found nobody and comes home: the
 * two differ only in `to` and `toUp`. Because the target is known before the body moves, a snap has
 * no correction at the end — and a correction at the end of a flight is exactly the jerk.
 */
export type SnapOptions = {
  /** Where it is pulled, root units. */
  readonly to: Vec;
  /**
   * The height it is pulled TO, root units above the desk. `0` (the default) is the desk itself —
   * a dealt card coming down. Above it is a body that comes home through the air without ever
   * touching the felt.
   */
  readonly toUp?: number | undefined;
  /** The height it STARTS at — a card leaving a raised hand rather than skating off the felt. */
  readonly up?: number | undefined;
  /** How fast it is already going when the snap takes over, root units/s. Default 0. */
  readonly speed?: number | undefined;
  /** Which way that speed points, degrees clockwise from +x. */
  readonly angle?: number | undefined;
  /** Turn rate, degrees/s. NOT aimed anywhere: it runs out, and where it stops is where it lies. */
  readonly spin?: number | undefined;
  /** The period of one full swing, seconds — SwiftUI's `response`. Default the tuning's. */
  readonly response?: number | undefined;
  /** The fraction of critical damping — `1` arrives without overshoot. Default the tuning's. */
  readonly damping?: number | undefined;
  /** What bleeds the turn. Default the tuning's `spinGlide`. */
  readonly spinGlide?: string | GlideLaw | undefined;
  readonly delayMs?: number | undefined;
  /** Runs when it has arrived and stopped turning, with the pose it came to rest in. */
  readonly onDone?: ((rest: { readonly at: Vec; readonly angle: number }) => void) | undefined;
};

/** A shuffle's look: the recipe name (`installStockShuffles`), and a duration patch. */
export interface ShuffleOptions {
  readonly recipe?: string | undefined;
  readonly shuffleMs?: number | undefined;
}

/**
 * A SHIVER — the small, fast tremble that says "this is no longer a tap".
 *
 * It exists for the moment a long press is recognised: the finger has been down half a second, the
 * gesture has just changed meaning, and nothing on the glass has said so yet. A player who gets no
 * answer lifts their finger to check, which cancels the very gesture they were making.
 *
 * Defaults live here rather than in `MotionTuning` for the same reason a roll's `turns` does: they
 * are the SHAPE of one choreography, not a setting a game tunes across all of them.
 */
export interface ShiverOptions {
  /** How long the tremble lasts, ms. Default `SHIVER_MS`. */
  readonly shiverMs?: number | undefined;
  /** How far it swings at its widest, in root units. Default `SHIVER_BY`. */
  readonly by?: number | undefined;
  /** How many there-and-back swings fit in the span. Default `SHIVER_CYCLES`. */
  readonly cycles?: number | undefined;
}

/**
 * A BOUNCE — the piece jumps UP THE SCREEN and comes back to the same seat.
 *
 * It is the flat cousin of a `slide`'s `hop`, and the pair is worth having both of: a hop leaves the
 * DESK, so its shadow falls away and the piece reads as lifted; a bounce stays on the felt and only
 * travels, so the shadow rides under it the whole way. One says "picked up", the other says "look at
 * me" — and a game that used the wrong one is telling the player something it did not mean.
 *
 * A CHOREOGRAPHY and not a flight, for the same reason a shiver is: it ends exactly where it began,
 * and a body under gravity only does that by accident. Zero at both ends of the span, no correction
 * step, nothing committed — a bounce says something, it changes nothing.
 */
export interface BounceOptions {
  /** How long the whole jump lasts, ms. Default `BOUNCE_MS`. */
  readonly bounceMs?: number | undefined;
  /** How high the FIRST arc reaches, in root units. Default `BOUNCE_BY`. */
  readonly by?: number | undefined;
  /** How many arcs fit in the span; each is smaller than the last. Default `BOUNCE_COUNT`. */
  readonly bounces?: number | undefined;
}

/** A tumble's look: whole turns and the hop (a scale peak), and a duration patch. */
export interface RollOptions {
  /** Whole turns about the piece's own centre over the tumble. Default 2. */
  readonly turns?: number | undefined;
  /** How much it grows at the top of the hop, as a scale (1 = flat). Default 1.25. */
  readonly hop?: number | undefined;
  readonly rollMs?: number | undefined;
  /**
   * The piece has turned far enough to be SHOWING something new — a die going over an edge. Fires
   * on every face of the tumble, `last` on the one the `commit` lands with; see `TURN_PER_FACE`.
   */
  readonly onTumble?: ((count: number, last: boolean) => void) | undefined;
}

/**
 * WHAT A NAMED LOOK IS PLAYED WITH — the levers that belong to the CALL rather than to the recipe.
 *
 * `durMs` and `rate` are both here and they are not the same lever, which is the whole point of
 * having two. `durMs` is an ABSOLUTE span: "this play lasts 300 ms", and it replaces whatever the
 * recipe was written with. `rate` is RELATIVE: "half again as fast as whatever it is", and it
 * multiplies on top — so a scene can slow every motion it plays without knowing how long any of
 * them is. Give both and they compose: the span is `durMs`, played at `rate`.
 */
export interface AnimateOptions {
  /** Replace the recipe's own span, ms. */
  readonly durMs?: number | undefined;
  /** Multiply the speed — `2` plays it twice as fast, `0.5` half. Applies on top of `durMs`. */
  readonly rate?: number | undefined;
  /**
   * What changes at the recipe's `commitAt`. Most looks change nothing and leave this off; a recipe
   * that DOES carry a phase (a keyframe motion with a `commitAt`) gets the same contract a turn-over
   * has — the tree changes hands once, at the frame the recipe chose.
   */
  readonly commit?: (() => void) | undefined;
  /** The look underneath changes hands — fires on each of the recipe's `beats`. */
  readonly onBeat?: ((count: number, last: boolean) => void) | undefined;
}

export interface Motions {
  /** A finger now owns this node: track its tree pose 1:1, do not ease it. */
  hold(id: NodeId): void;
  /** Hand the node back: the next tree change eases it from here to its rest pose. */
  release(id: NodeId): void;
  /**
   * Begin a spring carry of a RUN of nodes. Their poses become the finger's — an OVERRIDE, never a
   * tree write — laid out each frame by the `CarryStyle` from the springed anchor. The springs are
   * seeded at `anchor`, so the run does not jump; the lift spring pops from 1 to `lift`. Follow with
   * `dragTo` on every pointer-move and `release` on each node when the gesture ends.
   */
  grab(items: readonly CarryItem[], opts: CarryOptions): void;
  /** Move the finger: retarget the chase springs. The run trails to the new anchor and leans en route. */
  dragTo(anchor: Vec): void;
  /** The carry's speed right now (root units/s) — what a throw on release inherits. `undefined` when nothing is carried. */
  velocity(): Vec | undefined;
  /**
   * Turn a node over on the clock. It squeezes to an edge and back — `|cos|` of a half-turn — and
   * `commit` runs at the EDGE, where the card has no width to show the swap. `commit` is the actual
   * `side` change (e.g. `setFacing`): the geometry (the reflection) rides the resting pose the swap
   * produces, so the far face grows un-mirrored. The normal settle is suppressed for the node while
   * it turns, so the resting change `commit` makes does not race a second flight.
   */
  flip(id: NodeId, commit: () => void): void;
  /**
   * Play a shuffle over the CHILDREN of `containerId`: the recipe poses them off their seats, `commit`
   * runs at the recipe's phase (the game's `reorder` — its truth), and the recipe brings every child
   * onto its NEW seat by the end. The runtime never learns the order; the recipe never learns the rng.
   */
  shuffle(containerId: NodeId, commit: () => void, opts?: ShuffleOptions): void;
  /**
   * Shiver one node in place: a small decaying tremble that ENDS EXACTLY WHERE IT BEGAN.
   *
   * The answer to a gesture that has just changed meaning — a long press recognised, a refused drop.
   * It moves nothing and commits nothing; a feedback animation that left the piece displaced would
   * be a bug wearing an animation's clothes, and the maths is written so it cannot: the swing is
   * zero at both ends of the span.
   */
  shiver(id: NodeId, opts?: ShiverOptions): void;
  /**
   * Jump UP THE SCREEN and come back to the same seat — see `BounceOptions`. Stays on the desk, so
   * the shadow rides under it; a `slide`'s `hop` is the one that leaves the felt.
   */
  bounce(id: NodeId, opts?: BounceOptions): void;
  /** Tumble one node in place — turns and a hop — with `commit` (the new face) at the top of the last turn. */
  roll(id: NodeId, commit: () => void, opts?: RollOptions): void;
  /**
   * PLAY A NAMED LOOK on one node — the open door beside the closed list of verbs above.
   *
   * Every verb here is a mechanic the kit knows the meaning of: a turn-over commits a side, a
   * shuffle commits an order, a throw ends where the physics says. A LOOK has no meaning of its
   * own — it says "over here", "no", "well done" — and there is no closed list of those, because
   * they are the designer's vocabulary and not the kit's. So they are a registry
   * (`registerMotion`), and this is how one is played: by name, or by a recipe built on the spot.
   *
   * An unregistered name plays NOTHING. There is no stock look for a typo — see `motionRecipe`.
   */
  animate(id: NodeId, motion: string | MotionRecipe, opts?: AnimateOptions): void;
  /** Throw a node down the screen — see `LaunchOptions`. Its pose is an override until it leaves the glass. */
  launch(id: NodeId, opts: LaunchOptions): void;
  /** Throw a node across the desk — see `SlideOptions`. Its pose is an override until it rests. */
  slide(id: NodeId, opts: SlideOptions): void;
  /**
   * Throw a node AT A PLACE — see `SnapOptions`. The body keeps its momentum and a spring pulls it
   * in, so where it ends was decided before it moved and nothing corrects it when it gets there.
   */
  snap(id: NodeId, opts: SnapOptions): void;
  /**
   * Keep what the glass shows and paint only what flies. Nothing at rest is repainted while this
   * is on, so a thrown card leaves its trail — the old solitaire's cascade. Off again, the next
   * frame repaints everything.
   */
  retain(on: boolean): void;
  /**
   * Change the tuning of a RUNNING clock — the designer's settings screen, the catalog's sliders.
   * Whatever is in flight keeps going; the next settle, grab, throw or turn reads the new numbers.
   */
  retune(patch: TuningPatch): void;
  /**
   * PAINT A FRAME NOW — something outside the tree changed, and in practice that is the VIEW.
   *
   * The runtime draws on its own clock and on every tree change, which is everything a scene with
   * no camera can want. A camera moves neither: the desk slides and not one node did. Without a
   * word for that, a scene with both a clock and a camera can only repaint by pretending the tree
   * changed — which walks the tree, publishes it and reconciles every pose, sixty times a second.
   */
  redraw(): void;
  /**
   * WHERE EVERY MOVING PIECE IS BEING DRAWN right now — hand it to `pick` and the finger tests what
   * the eye sees. Without it a hit-test reads the tree, where a thrown die still sits on the seat it
   * left; `undefined` when nothing is moving, which is when the tree is the honest answer anyway.
   */
  poses(): ReadonlyMap<NodeId, Transform> | undefined;
  /**
   * Is the CLOCK moving this node — a flight or a choreography, the two a finger would have to
   * interrupt? A settle is not one: catching a piece on its way home is an ordinary grab.
   *
   * The kit does not decide who may interrupt what. A `grab` always wins (the finger is the latest
   * word); this is how a scene writes the rule that it should not be offered — "a die somebody else
   * threw is not yours to catch" is a gate on the pick, and it needs this to be written.
   */
  busy(id: NodeId): boolean;
  /** The tuning in force right now — the defaults, the game's record and every `retune` folded in. */
  tuning(): MotionTuning;
  /** Stop following the host and cancel any running loop. */
  stop(): void;
}
