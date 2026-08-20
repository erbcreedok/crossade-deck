// THE MOTION RUNTIME — the ONE clock. It watches the host's tree: when a node's resting pose moves,
// the node keeps its identity and a spring plays it there instead of teleporting. Everything else
// that moves on the desk rides the same clock: a turn-over, a shuffle, a die's tumble (all
// CHOREOGRAPHIES — a pose per node per progress, with one commit at a phase), a card let go on a
// spring carry, a thrown body in FLIGHT (`launch` down the screen, `slide` across the desk).
//
// This is the only file in the kit that holds a frame loop (`guard.one-clock`). A settling scene runs
// the loop; a still one does not touch it (the idle-gate the canon asks of any continuous animation).
// The clock is injectable so a plain test can step frames without a browser — the same seam the scene
// shell uses for its painter.
//
// EVERY NUMBER OF FEEL COMES FROM THE TUNING (`core/motion.ts: MotionTuning`): the kit's defaults, a
// game's record handed in as options, a per-call patch — and the onlooker's `motionSpeed` on top,
// read off the viewer plane on EVERY frame. The runtime keeps a WARPED clock: `warped` advances by
// `dt · speed`, every flight is measured against it, every spring and body is stepped by `dt · speed`,
// so a speed change mid-flight is smooth (progress kept, pace changed) and `0` is "no animation":
// whatever is in flight finishes on the next frame — a settle lands, a turn is over, a carry sits under
// the finger, a thrown body stops where it stands.
//
// GESTURE vs SETTLE, the joint the whole thing turns on (docs/design/transaction.md): while a finger
// owns nodes it must NOT ease from the tree — its pose is the finger's, an OVERRIDE, never a tree
// write, so a pointer-move costs one paint and no reconcile. `grab`/`dragTo` are that gesture, and
// they carry the "feel": the run rides the finger 1:1 (no position lag — a held thing does not trail
// the hand), and a spring per axis CHASES the same target beside it, purely to READ the finger's speed:
// that speed asks for a lean (`lean`), a THIRD spring banks the run toward it (`carry` style), and
// the same speed is what a throw inherits. A lift spring pops the run up on the way in. The run's per-card poses are a
// `CarryStyle` (rigid = one plank about the pivot, loose = per-card) fed the finger's anchor each
// frame. `release(id)` hands the node back, and because the tree never moved, the
// next reconcile eases it home from exactly where the finger left it — the lean and lift unwind on the
// way. (`hold(id)` is the older, tree-driven gesture the same `release` closes.)

import { byId, type Node, type NodeId } from "../core/node.js";
import { easing, flipScale, sample, tune, type CarryTuning, type Motion, type MotionTuning, type TuningPatch } from "../core/motion.js";
import { springAt, springSettled, stepSpring, type SpringConfig, type SpringState } from "../core/spring.js";
import { carry, lean, type CarryStyle } from "../core/atoms/carry.js";
import { bodyAt, slideRests, stepFall, stepSlide, velocityOf, type Body, type Walls } from "../core/ballistic.js";
import { apply, compose, invert, move, pose, rotate, scale, type Transform, type Vec } from "../core/transform.js";
import { type Host } from "./host.js";
import { type Painter } from "./painter.js";
import { renderFrame } from "./stage.js";
import { type TextMeasure } from "./textMetrics.js";
import { transformsOf, viewTransform } from "./scenePlan.js";
import { shuffleRecipe, type ShuffleBox, type ShuffleContext } from "./shuffles.js";

/** The one clock, injectable. `frame` schedules a single callback and returns its canceller. */
export interface Clock {
  now(): number;
  frame(cb: () => void): () => void;
}

const rafClock: Clock = {
  now: () => performance.now(),
  frame: (cb) => {
    const id = requestAnimationFrame(cb);
    return () => cancelAnimationFrame(id);
  },
};

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

/** A throw across the DESK: friction bleeds speed and spin, walls reflect, it stops where it stops. */
export type SlideOptions = {
  readonly speed: number;
  readonly angle: number;
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
} & { readonly friction?: number | undefined; readonly spinFriction?: number | undefined; readonly bounce?: number | undefined };

/** A shuffle's look: the recipe name (`installStockShuffles`), and a duration patch. */
export interface ShuffleOptions {
  readonly recipe?: string | undefined;
  readonly shuffleMs?: number | undefined;
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
  /** Tumble one node in place — turns and a hop — with `commit` (the new face) at the top of the last turn. */
  roll(id: NodeId, commit: () => void, opts?: RollOptions): void;
  /** Throw a node down the screen — see `LaunchOptions`. Its pose is an override until it leaves the glass. */
  launch(id: NodeId, opts: LaunchOptions): void;
  /** Throw a node across the desk — see `SlideOptions`. Its pose is an override until it rests. */
  slide(id: NodeId, opts: SlideOptions): void;
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
  /** The tuning in force right now — the defaults, the game's record and every `retune` folded in. */
  tuning(): MotionTuning;
  /** Stop following the host and cancel any running loop. */
  stop(): void;
}

const EPSILON = 1e-6;
/** A frame's dt is clamped here (seconds) for the INTEGRATORS: a resumed background tab must not fling the springs. */
const MAX_DT = 0.05;
/** "Close enough" for a carry to stop the loop — root units for a position, a fraction for the scale. */
const CARRY_EPS = 1e-3;
/**
 * The same, for the lean — DEGREES, and its own number because the channel's units are its own: a
 * twentieth of a degree moves a card's corner by a fraction of a pixel, while the position's `1e-3`
 * would hold the loop awake for a second after the hand has stopped, for nothing anyone can see.
 */
const BANK_EPS = 0.05;
/** "Stopped" for a slide — units/s and degrees/s. */
const SLIDE_EPS = 0.02;
const SPIN_EPS = 2;
/** How far past the glass edge a launched body is "gone", root units. */
const OFF_GLASS = 1;
/**
 * HOW OFTEN A TUMBLING PIECE SHOWS SOMETHING NEW — a turn of this many degrees, or a slide of
 * `UNITS_PER_FACE` root units.
 *
 * A die does not pick its face at the end: it shows a new one every time it goes over an edge, so
 * the cadence is the piece's OWN motion and needs no clock of its own — it thins out exactly as the
 * piece slows, because the piece is what is counted. Nothing here knows what a face IS: the runtime
 * says WHEN, the game says what to show.
 */
const TURN_PER_FACE = 60;
const UNITS_PER_FACE = 0.5;
/**
 * How much of that last step is still to come AFTER the result is shown, as a fraction of one.
 *
 * The result has to land on a piece that is still moving. A picture that changes on a piece
 * standing still is the one thing the eye reads as a SWAP — the same defect a shuffle has when its
 * packets hover over each other at the commit.
 */
const TUMBLE_TAIL = 0.5;
/**
 * How much a body GROWS per unit of height off the desk — the whole of "it is up in the air" as far
 * as a flat desk seen from above can say it. The shadow answers with the same number the other way:
 * it falls further, so the gap between a piece and its shadow IS the height.
 */
const RISE = 0.5;

/** A tumble's turn against its progress: most of it early, and a long slow end. */
const tumbleEase = (t: number): number => 1 - (1 - t) ** 3;
/**
 * The inverse — at what progress the piece has turned this FRACTION of the whole. It is what places
 * the beats, and it must stay the inverse of `tumbleEase`, or the faces would be counted off a
 * curve the piece is not turning on.
 */
const tumbleAt = (turned: number): number => 1 - Math.cbrt(1 - turned);

/**
 * How many faces' worth of motion a sliding body still has in it. Friction takes a fixed amount of
 * speed per second, so what is left of a slide is `v²/2f`, and of a spin the same. Walls only ever
 * eat more of it, so this over-estimates — and it errs the safe way: the result is shown a touch
 * early rather than on a body that has already stopped.
 */
const facesLeft =
  (cfg: { readonly friction: number; readonly spinFriction: number }) =>
  (b: Body): number => {
    const speed = Math.hypot(b.vel.x, b.vel.y);
    const spin = Math.abs(b.spin);
    const path = speed <= 0 ? 0 : cfg.friction > 0 ? (speed * speed) / (2 * cfg.friction) : Infinity;
    const turn = spin <= 0 ? 0 : cfg.spinFriction > 0 ? (spin * spin) / (2 * cfg.spinFriction) : Infinity;
    return path / UNITS_PER_FACE + turn / TURN_PER_FACE;
  };

/** One step's worth of tumbling: what the body just travelled, counted in faces and paid out in cues. */
const tumbleStep = (t: Tumbling, was: Body, now: Body): void => {
  if (t.ended) return;
  // The last face is the RESULT's. It is shown as soon as the body no longer has a whole face's
  // worth of motion left to give — while it is still moving, which is the whole point of the cue.
  if (t.left(now) < 1) {
    t.ended = true;
    t.on(++t.count, true);
    return;
  }
  t.carried +=
    Math.hypot(now.pos.x - was.pos.x, now.pos.y - was.pos.y) / UNITS_PER_FACE + Math.abs(now.angle - was.angle) / TURN_PER_FACE;
  // Room for THIS face and for the result after it: without the second face's worth the two land a
  // frame apart at the end, and the pace that has been slowing all the way blinks twice instead.
  while (t.carried >= 1 && t.left(now) >= 2) {
    t.carried -= 1;
    t.on(++t.count, false);
  }
};

/** A horizontal-only scale — the width of a card as it turns. The reflection's SIGN stays in the pose. */
function hscale(k: number): Transform {
  return { a: k, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

function same(a: Transform, b: Transform): boolean {
  return (
    Math.abs(a.a - b.a) < EPSILON &&
    Math.abs(a.b - b.b) < EPSILON &&
    Math.abs(a.c - b.c) < EPSILON &&
    Math.abs(a.d - b.d) < EPSILON &&
    Math.abs(a.e - b.e) < EPSILON &&
    Math.abs(a.f - b.f) < EPSILON
  );
}

/** The rest pose moved so its origin lands on `at` and turned by `deg` about it, keeping its own size and turn. */
function seatAt(rest: Transform, at: Vec, deg: number, size = 1): Transform {
  const o = apply(rest, { x: 0, y: 0 });
  return compose(pose(at, deg, size), compose(move(-o.x, -o.y), rest));
}

/** The live state of a spring carry — the springs, the target, and the style + tune to play them. */
interface Carry {
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
interface Choreo {
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
}

/**
 * A body in flight — a fall down the screen or a slide across the desk. The two differ in what a
 * step DOES and when the flight is OVER, and both are carried as functions: the runtime steps and
 * asks, it never reads which sort of flight this is.
 */
interface Flight {
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
 * A FLIGHT'S OWN FACE-COUNTER. A choreography knows its whole schedule up front and lists its beats;
 * a body does not — how far it still has to go is the physics' answer, asked every frame. So the
 * count is carried instead: travel accumulates in faces, and `left` says when the one being shown
 * is the last (the result's own, still in motion).
 */
interface Tumbling {
  /** Faces' worth of motion the body has LEFT. Under one, whatever it shows next it shows to the end. */
  readonly left: (b: Body) => number;
  readonly on: (count: number, last: boolean) => void;
  /** Faces' worth of motion since the last one was shown. */
  carried: number;
  count: number;
  ended: boolean;
}

/**
 * Attach the motion runtime to a host + painter — use this INSTEAD of `attachPainter` on a scene
 * that should animate. It paints the first frame, then repaints on every tree change, easing any
 * node whose rest pose moved.
 */
export function attachMotion(host: Host, painter: Painter, options: MotionOptions = {}): Motions {
  let tuning: MotionTuning = tune(options);
  const clock = options.clock ?? rafClock;

  const displayed = new Map<NodeId, Transform>(); // what is on the glass now, root-unit space
  const active = new Map<NodeId, Motion>(); // nodes mid-settle
  const held = new Set<NodeId>(); // nodes a gesture owns — no easing
  // Nodes a finger is dragging: their pose is the FINGER's, an override, not the tree's. A drag never
  // touches the tree — the carry step only writes here — so a pointer-move costs one paint, not a reconcile.
  const carried = new Set<NodeId>();
  let carrying: Carry | null = null;
  // Choreographies keyed by their subject — a node for a turn or a tumble, a container for a shuffle —
  // so a second call on the same subject replaces the first: the latest word wins, as everywhere here.
  const choreos = new Map<NodeId, Choreo>();
  const flights = new Map<NodeId, Flight>();
  let retaining = false;
  let cancelFrame: (() => void) | null = null;

  // THE WARPED CLOCK. `warped` is what every flight is measured against; it advances by real time
  // times the viewer's speed. `lastMs` is the real reading of the previous step, so a loop resumed
  // from idle does not count the idle as flight time.
  let warped = 0;
  let lastMs = clock.now();
  const speedNow = (): number => {
    const s = host.viewer().motionSpeed;
    return s === undefined || !Number.isFinite(s) || s < 0 ? 1 : s;
  };

  /** Where a choreography is, 0..1, on the warped clock. */
  const progressOf = (ch: Choreo): number => {
    if (ch.durMs <= 0) return 1;
    const t = (warped - ch.startMs) / ch.durMs;
    return t <= 0 ? 0 : t >= 1 ? 1 : t;
  };

  /** Every node some choreography is posing right now. */
  const choreographed = (): Set<NodeId> => {
    const out = new Set<NodeId>();
    for (const ch of choreos.values()) for (const id of ch.ids) out.add(id);
    return out;
  };

  /** The pose overrides to hand the plan this frame: everything not at its rest, at where it is now. */
  const overrides = (): ReadonlyMap<NodeId, Transform> | undefined => {
    if (active.size === 0 && choreos.size === 0 && carried.size === 0 && flights.size === 0) return undefined;
    const map = new Map<NodeId, Transform>();
    for (const id of active.keys()) {
      const at = displayed.get(id);
      if (at) map.set(id, at);
    }
    // A dragged node sits under the finger — its live pose is in `displayed`, put there by the carry step.
    for (const id of carried) {
      const at = displayed.get(id);
      if (at) map.set(id, at);
    }
    // A choreographed node keeps its resting pose (which carries e.g. a flip's reflection) and wears
    // the recipe's pose on top — the recipe is handed the rest and returns the frame's pose.
    for (const ch of choreos.values()) {
      const t = progressOf(ch);
      ch.ids.forEach((id, i) => {
        const rest = displayed.get(id);
        if (rest) map.set(id, ch.poseAt(i, ch.ids.length, t, rest));
      });
    }
    // A flying body's pose is its own: where the physics put it, turned as it spins, at the rest's
    // size. A flight still WAITING its turn is not here — until it goes, the node is whatever it
    // was (at rest, or mid-settle), so a stagger never freezes a card in the air.
    for (const [id, f] of flights) {
      if (!f.started) continue;
      const rest = displayed.get(id);
      if (rest) map.set(id, seatAt(rest, f.body.pos, f.body.angle, 1 + f.body.up * RISE));
    }
    return map;
  };

  /**
   * The nodes in FLIGHT this frame — settling, finger-owned, choreographed, thrown — handed to the
   * plan as its paint-order lift: a moving card rides above whatever it crosses, however tall the
   * pile (`PlanInput.raised`). The finger set is `held`, which contains every carried node too.
   */
  const flying = (): NodeId[] => [...flights].filter(([, f]) => f.started).map(([id]) => id);
  /**
   * The bodies travelling ON the desk, with their height — a slide, which is on the felt the whole
   * way. A fall is not here: it is in the air over the glass on its way out of the scene, and its
   * shadow keeps the law that a flight's shadow waits at the seat.
   */
  const grounded = (): ReadonlyMap<NodeId, number> | undefined => {
    const out = new Map<NodeId, number>();
    for (const [id, f] of flights) if (f.started && f.onDesk) out.set(id, f.body.up);
    return out.size > 0 ? out : undefined;
  };
  const raised = (): ReadonlySet<NodeId> | undefined => {
    if (active.size === 0 && held.size === 0 && choreos.size === 0 && flights.size === 0) return undefined;
    return new Set<NodeId>([...active.keys(), ...held, ...choreographed(), ...flying()]);
  };

  const draw = (): void =>
    renderFrame(host, painter, {
      overrides: overrides(),
      raised: raised(),
      // The finger's own set, apart from `raised`: what a HAND holds is off the desk, and only that
      // takes its shadow along (`PlanInput.carried`). A node the clock is flying is on its way to a
      // seat, not standing at a new one.
      carried: carried.size > 0 ? carried : undefined,
      grounded: grounded(),
      retain: retaining,
      measure: options.measure,
      ...(options.view ? { view: options.view } : {}),
      ...(options.pitch ? { pitch: options.pitch } : {}),
      ...(options.bake ? { bake: options.bake } : {}),
    });

  /** The bank this frame's speed is ASKING for — what the lean spring chases, degrees. */
  const wantLean = (cy: Carry): number => lean(cy.sx.vel, cy.tiltFactor, cy.tiltMax);

  /**
   * True once a carry's springs have all but arrived and stopped — the gate the loop sleeps on.
   *
   * The bank is one of them: it outlives the speed that raised it, and a loop that slept on the
   * other three would leave the card standing at whatever angle the last frame caught it at.
   */
  const carrySettled = (cy: Carry): boolean =>
    springSettled(cy.sx, cy.target.x, CARRY_EPS) &&
    springSettled(cy.sy, cy.target.y, CARRY_EPS) &&
    springSettled(cy.sl, cy.liftTo, CARRY_EPS) &&
    springSettled(cy.sa, wantLean(cy), BANK_EPS);

  /**
   * Lay the carried run out UNDER THE FINGER this frame, writing each node's override pose.
   *
   * The anchor is the finger's own target, 1:1 — a thing a hand is holding does not trail behind
   * the hand, and a position lag reads as sluggishness, not as weight. The chase spring runs
   * BESIDE the pose, never under it: its velocity is the finger's speed, smoothed by the spring's
   * own time constant, and that is what the lean is drawn from and what a throw on release
   * inherits. So the liveliness sits where it belongs — the bank into the motion, the lift's
   * overshoot on the way in, the settle on the way out — and never in the position.
   *
   * The lean drawn here is the BANK SPRING's position, not that speed's lean: a card has weight in
   * its turn as much as in its travel, and the raw lean cannot show it — it saturates, so an
   * ordinary drag pins it, and a hand that turns round trades one pin for the other in four frames.
   */
  /** The finger's point as the run is allowed to have it: inside the tray, if the gesture has one. */
  const heldAt = (cy: Carry): Vec => {
    const w = cy.walls;
    if (!w) return cy.target;
    return { x: Math.min(w.x1, Math.max(w.x0, cy.target.x)), y: Math.min(w.y1, Math.max(w.y0, cy.target.y)) };
  };

  /**
   * The gesture is over without a release: the run comes off the finger WHERE IT STANDS.
   *
   * The reconcile is the whole of "where it stands". Dropped from the finger's set and left alone,
   * a piece has no override at all and the very next frame paints it back at its seat — a teleport,
   * and one that would happen behind the game's back. Reconciled, it is a settle from the wall like
   * any other, and a game that means it to stay writes the seat in its callback: the reconcile that
   * write brings simply retargets a motion that is already under way.
   */
  const letGo = (cy: Carry): void => {
    for (const it of cy.items) {
      carried.delete(it.id);
      held.delete(it.id);
    }
    if (carrying === cy) carrying = null;
    reconcile();
  };

  /**
   * THE BORDER, WHILE THE HAND IS STILL ON THE RUN. The clamp in `layCarry` has already stopped the
   * run at the wall; what is left is whether the gesture survives being pressed against one.
   *
   * Two ways it does not. SHOVED in at `wallSpeed` or more, the wall wins: the run comes off the
   * hand with the bounce it earned, and what happens next is the game's (a die throws itself back
   * across the tray). PULLED on past `leash`, the hold breaks instead: a hand that keeps dragging a
   * piece which cannot follow is not holding it any more. Anything gentler is a run straining after
   * a finger it cannot reach, which is what a piece in a box does.
   */
  const wallCheck = (cy: Carry): void => {
    const at = heldAt(cy);
    const outX = cy.target.x - at.x;
    const outY = cy.target.y - at.y;
    const out = Math.hypot(outX, outY);
    if (out <= EPSILON) return; // not against it at all
    // The outward normal of whatever the finger is past — a corner gives the diagonal, which is
    // the honest answer for a piece shoved into one.
    const nx = outX / out;
    const ny = outY / out;
    const into = cy.sx.vel * nx + cy.sy.vel * ny;
    const ids = cy.items.map((it) => it.id);
    if (into >= cy.wallSpeed) {
      const hit: WallHit = {
        ids,
        at,
        speed: into,
        velocity: { x: (cy.sx.vel - 2 * into * nx) * cy.wallBounce, y: (cy.sy.vel - 2 * into * ny) * cy.wallBounce },
      };
      letGo(cy);
      cy.onWall?.(hit);
      return;
    }
    if (out > cy.leash) {
      letGo(cy);
      cy.onSnap?.(ids, at);
    }
  };

  const layCarry = (cy: Carry): void => {
    const leanDeg = cy.sa.pos;
    const anchor = heldAt(cy);
    const n = cy.items.length;
    cy.items.forEach((it, i) => {
      displayed.set(it.id, cy.style({ anchor, offset: it.offset, leanDeg, lift: cy.sl.pos, i, n }));
    });
  };

  /** Read the tree's new rest poses and start a spring for every node whose pose moved. */
  const reconcile = (): void => {
    const target = transformsOf(host.root);
    const posed = choreographed();
    for (const [id, to] of target) {
      if (held.has(id) || posed.has(id) || flights.get(id)?.started) {
        // Finger-owned, choreographed or thrown: sit exactly where the tree says, no easing. A flip's
        // `commit` changes this node's rest pose (the reflection flips sign) — snapping it here is what
        // keeps that change from starting a second flight that would race the turn. A CARRIED node is
        // the exception: its pose is the finger's, not the tree's, so a stray reconcile must not snap it.
        if (!carried.has(id)) displayed.set(id, to);
        active.delete(id);
        continue;
      }
      const from = displayed.get(id);
      if (!from) {
        displayed.set(id, to); // a new node appears at rest — it did not fly in from nowhere
      } else if (!same(from, to)) {
        active.set(id, { from, to, startMs: warped, durMs: tuning.settleMs, ease: tuning.settleEase });
      }
    }
    // Forget nodes that left the tree, in flight or not.
    for (const id of [...displayed.keys()]) if (!target.has(id)) displayed.delete(id);
    for (const id of [...active.keys()]) if (!target.has(id)) active.delete(id);
    for (const id of [...flights.keys()]) if (!target.has(id)) flights.delete(id);
    if (active.size > 0) ensureLoop();
  };

  /** The glass in root units — the floor a launch bounces off and the edge it is gone past. */
  const glass = (): { halfW: number; halfH: number } => {
    const v = host.viewport();
    const u = host.unit();
    return u > 0 ? { halfW: v.width / u / 2, halfH: v.height / u / 2 } : { halfW: 0, halfH: 0 };
  };

  /**
   * End a flight: the override goes and the game hears where it stopped. What is on the glass is
   * recorded as the node's displayed pose FIRST — so a game that writes the landing into the tree
   * gets no second flight (from = to), and one that does not gets an honest settle home from
   * where the body lies, not a jump back to the old seat and a glide from there.
   */
  const land = (id: NodeId, f: Flight): void => {
    flights.delete(id);
    const rest = displayed.get(id);
    if (rest) displayed.set(id, seatAt(rest, f.body.pos, f.body.angle));
    f.done?.({ at: f.body.pos, angle: f.angle0 + f.body.angle });
    // Read the tree NOW, in the same frame: a landing the game wrote in place is found equal and
    // nothing flies; one it did not write starts the settle home from here — never a frame at the
    // old seat in between.
    reconcile();
  };

  const step = (): void => {
    cancelFrame = null;
    const now = clock.now();
    const realDt = Math.max(0, (now - lastMs) / 1000);
    lastMs = now;
    const speed = speedNow();
    const instant = speed <= 0;
    // Flights are measured against the warped clock UNCLAMPED (a hidden tab's flight is over when it
    // returns); the integrators get the clamped dt (a hidden tab must not fling a spring).
    warped += realDt * 1000 * speed;
    const dt = Math.min(realDt, MAX_DT) * speed;

    for (const [id, m] of active) {
      const s = instant ? { transform: m.to, done: true } : sample(m, warped);
      displayed.set(id, s.transform);
      if (s.done) active.delete(id);
    }
    // Advance the carry springs: chase the finger, pop the lift, and lay the run out from where the
    // springs now are — the lag and the lean both fall out of the spring state, no separate tween.
    if (carrying) {
      const cy = carrying;
      if (instant) {
        cy.sx = springAt(cy.target.x);
        cy.sy = springAt(cy.target.y);
        cy.sl = springAt(cy.liftTo);
        cy.sa = springAt(wantLean(cy));
      } else {
        cy.sx = stepSpring(cy.sx, cy.target.x, cy.follow, dt);
        cy.sy = stepSpring(cy.sy, cy.target.y, cy.follow, dt);
        cy.sl = stepSpring(cy.sl, cy.liftTo, cy.liftCfg, dt);
        // The bank chases AFTER the chase spring moved: within one frame the lean is answering the
        // speed this frame has, one step behind it and never a step ahead.
        cy.sa = stepSpring(cy.sa, wantLean(cy), cy.bankCfg, dt);
      }
      layCarry(cy);
      if (cy.walls) wallCheck(cy);
    }
    // Advance the flights: a stagger holds a body at rest until its turn; then the physics.
    for (const [id, f] of [...flights]) {
      if (!f.started) {
        if (!instant && warped < f.goMs) continue;
        // It goes NOW, from wherever it is drawn at this moment — the seat it rests on, or the
        // point of a settle it was still riding — and that settle ends here: the body owns the pose.
        f.started = true;
        active.delete(id);
        const at = displayed.get(id);
        if (at) {
          f.body = { ...f.body, pos: apply(at, { x: 0, y: 0 }) };
          f.angle0 = turnOf(at);
        }
      }
      const was = f.body;
      f.body = instant ? f.halt(f.body) : f.step(f.body, dt);
      // What it shows as it goes. At speed 0 there is no going: the body is already where it stops,
      // and the only face anyone sees is the one the landing writes.
      if (f.tumble) {
        if (instant) f.tumble.ended = true;
        else tumbleStep(f.tumble, was, f.body);
      }
      if (f.over(f.body)) land(id, f);
    }
    // Advance the choreographies: commit once, at the phase; drop each when it lands. Commits first
    // and a reconcile after them while the nodes are STILL choreographed — so the rest a commit
    // changes is snapped, not flown — and only then are the finished ones let go.
    // What a choreography SHOWS as it plays, before what it commits: a tumble's faces are paid out
    // here, and its last one falls on the same step as the commit — that is what puts the result on
    // a piece still turning instead of on one that has stopped.
    for (const ch of choreos.values()) {
      if (!ch.onBeat || ch.beaten >= ch.beats.length) continue;
      if (instant) {
        ch.beaten = ch.beats.length; // no motion to count faces off, and only the last would be seen
        continue;
      }
      const t = progressOf(ch);
      while (ch.beaten < ch.beats.length && t >= ch.beats[ch.beaten]!) {
        const count = ++ch.beaten;
        ch.onBeat(count, count === ch.beats.length);
      }
    }
    let committed = false;
    for (const ch of choreos.values()) {
      const t = instant ? 1 : progressOf(ch);
      if (t >= ch.commitAt && !ch.committed) {
        ch.committed = true;
        ch.commit();
        committed = true;
      }
    }
    if (committed) reconcile();
    for (const [key, ch] of [...choreos]) if (instant || progressOf(ch) >= 1) choreos.delete(key);
    draw();
    if (active.size > 0 || choreos.size > 0 || flights.size > 0 || (carrying && !carrySettled(carrying))) ensureLoop();
  };

  const ensureLoop = (): void => {
    if (cancelFrame) return; // a frame is already scheduled — one clock, not two
    // The loop is alive from NOW: an idle stretch before this is not flight time, or the first
    // frame after a long rest would find every new flight already over.
    lastMs = clock.now();
    cancelFrame = clock.frame(step);
  };

  const unsubscribe = host.onChange(() => {
    reconcile();
    draw();
  });

  // First frame: every node is new, so nothing flies — it just paints where things rest.
  reconcile();
  draw();

  /** The rest pose of a node as it stands on the glass now — where a throw or a tumble starts from. */
  const restOf = (id: NodeId): Transform | undefined => displayed.get(id) ?? transformsOf(host.root).get(id);

  /**
   * WHAT THE ONLOOKER CAN SEE, root units — handed to a shuffle recipe so it can carry a packet off
   * the glass and turn the order over out of sight.
   *
   * Taken through the VIEW rather than from the viewport: with a camera in front, what is visible is
   * whatever her matrix shows, and the honest answer is the glass's four corners brought back into
   * root space, boxed. Degenerate before the first layout (a host still measuring itself reports a
   * viewport of nothing, and a unit of zero has no inverse) — the recipes take that for the absence
   * it is and fall back to the group's own extent.
   */
  const visibleBox = (): ShuffleBox => {
    const v = host.viewport();
    const view = options.view?.() ?? viewTransform(host.unit(), v.width, v.height);
    const back = invert(view);
    if (!back || v.width <= 0 || v.height <= 0) return { x: 0, y: 0, w: 0, h: 0 };
    const corners = [
      { x: 0, y: 0 },
      { x: v.width, y: 0 },
      { x: v.width, y: v.height },
      { x: 0, y: v.height },
    ].map((p) => apply(back, p));
    const xs = corners.map((p) => p.x);
    const ys = corners.map((p) => p.y);
    const x0 = Math.min(...xs), y0 = Math.min(...ys);
    return { x: x0, y: y0, w: Math.max(...xs) - x0, h: Math.max(...ys) - y0 };
  };

  /** A flight is filed; the finger lets go of the node at once, and a settle it may be riding runs on until the flight goes. */
  const beginFlight = (id: NodeId, f: Flight): void => {
    flights.set(id, f);
    held.delete(id);
    carried.delete(id);
    if (carrying && carrying.items.every((it) => !carried.has(it.id))) carrying = null;
    ensureLoop();
  };

  return {
    hold(id) {
      held.add(id);
      active.delete(id);
    },
    release(id) {
      held.delete(id);
      carried.delete(id);
      // The run empties one node at a time (the scene releases per card). When the last is gone the
      // carry is over — the springs and target go with it, and the next reconcile eases the nodes home.
      if (carrying && carrying.items.every((it) => !carried.has(it.id))) carrying = null;
    },
    grab(items, opts) {
      const t = tune({ ...tuning, ...opts });
      const anchor = opts.anchor;
      carrying = {
        items,
        style: carry(t.carry),
        target: anchor,
        sx: springAt(anchor.x),
        sy: springAt(anchor.y),
        sl: springAt(1),
        // Flat: a card is picked up level, whatever the hand was doing before it closed.
        sa: springAt(0),
        liftTo: t.lift,
        follow: { stiffness: t.followStiffness, damping: t.followDamping },
        liftCfg: { stiffness: t.liftStiffness, damping: t.liftDamping },
        bankCfg: { stiffness: t.leanStiffness, damping: t.leanDamping },
        tiltFactor: t.leanFactor,
        tiltMax: t.leanMaxDeg,
        walls: opts.walls,
        wallSpeed: t.wallSpeed,
        wallBounce: t.wallBounce,
        leash: t.leash,
        onWall: opts.onWall,
        onSnap: opts.onSnap,
      };
      for (const it of items) {
        carried.add(it.id);
        held.add(it.id);
        active.delete(it.id);
      }
      layCarry(carrying); // paint the run under the finger at once
      draw();
      if (!carrySettled(carrying)) ensureLoop(); // a pop or an off-anchor seat needs the loop; a bare grab does not
    },
    dragTo(anchor) {
      if (!carrying) return;
      carrying.target = anchor;
      ensureLoop();
    },
    velocity() {
      return carrying ? { x: carrying.sx.vel, y: carrying.sy.vel } : undefined;
    },
    flip(id, commit) {
      const ease = easing(tuning.flipEase);
      choreos.set(id, {
        ids: [id],
        startMs: warped,
        durMs: tuning.flipMs,
        commitAt: 0.5,
        commit,
        committed: false,
        beats: [],
        onBeat: undefined,
        beaten: 0,
        poseAt: (_i, _n, t, rest) => compose(rest, hscale(flipScale(ease(t)))),
      });
      ensureLoop();
    },
    shuffle(containerId, commit, opts = {}) {
      const holder = byId(host.root, containerId);
      const ids = holder ? holder.children.map((c) => c.id) : [];
      const recipe = shuffleRecipe(opts.recipe ?? "riffle");
      const ctx = groupContext(ids.map((id) => restOf(id)), visibleBox());
      choreos.set(containerId, {
        ids,
        startMs: warped,
        durMs: opts.shuffleMs ?? tuning.shuffleMs,
        commitAt: recipe.commitAt,
        commit,
        committed: false,
        beats: [],
        onBeat: undefined,
        beaten: 0,
        poseAt: (i, n, t, rest) => recipe.poseAt(i, n, t, rest, ctx),
      });
      ensureLoop();
    },
    roll(id, commit, opts = {}) {
      const turns = opts.turns ?? 2;
      const hop = opts.hop ?? 1.25;
      // HOW MANY FACES THIS TUMBLE SHOWS — one per `TURN_PER_FACE` of turning, the result being the
      // LAST of them. The beats are placed by the inverse of the tumble's own ease, so they are a
      // face apart in TURNING and therefore further and further apart in time: the piece slows, and
      // the faces slow with it because they are counted off the same turn.
      const faces = Math.max(1, Math.round((Math.abs(turns) * 360) / TURN_PER_FACE));
      const beats = Array.from({ length: faces }, (_, k) => tumbleAt((k + 1) / (faces + TUMBLE_TAIL)));
      choreos.set(id, {
        ids: [id],
        startMs: warped,
        durMs: opts.rollMs ?? tuning.rollMs,
        // The result is the tumble's LAST FACE, not a phase of its own: it lands while the piece is
        // still turning (`TUMBLE_TAIL` of a face is still to come), and nothing after it redraws.
        commitAt: beats[beats.length - 1]!,
        commit,
        committed: false,
        beats,
        onBeat: opts.onTumble,
        beaten: 0,
        poseAt: (_i, _n, t, rest) => {
          if (t >= 1) return rest;
          const size = 1 + (hop - 1) * Math.sin(Math.PI * t);
          return compose(rest, compose(rotate(turns * 360 * tumbleEase(t)), scale(size)));
        },
      });
      ensureLoop();
    },
    launch(id, opts) {
      const rest = restOf(id);
      if (!rest) return;
      // The glass is read at EVERY step, not captured here: a launch asked before the page has laid
      // the view out (a celebration on load) sees a zero glass, and a zero glass must mean "not yet",
      // never "already gone".
      const gravity = opts.gravity ?? tuning.gravity;
      const bounce = opts.bounce ?? tuning.bounce;
      const floorOf = (): number => opts.floor ?? glass().halfH;
      let bounces = 0;
      const offGlass = (b: Body): boolean => {
        const { halfW, halfH } = glass();
        if (halfW <= 0) return !Number.isFinite(b.pos.x);
        return Math.abs(b.pos.x) > halfW + OFF_GLASS || b.pos.y > halfH + OFF_GLASS;
      };
      beginFlight(id, {
        body: { ...bodyAt(apply(rest, { x: 0, y: 0 })), vel: velocityOf(opts.speed, opts.angle), spin: opts.spin ?? 0 },
        goMs: warped + (opts.delayMs ?? 0),
        started: false,
        angle0: turnOf(rest),
        step: (b, dt) => {
          const next = stepFall(b, { gravity, bounce, floor: floorOf() }, dt);
          // Falling before, rising after: the floor just gave it back — a bounce.
          if (b.vel.y > 0 && next.vel.y < 0) opts.onBounce?.(++bounces);
          return next;
        },
        over: offGlass,
        // No animation: a fall is simply gone.
        halt: (b) => ({ ...b, pos: { x: Infinity, y: b.pos.y }, vel: { x: 0, y: 0 }, spin: 0 }),
        done: opts.onDone ? () => opts.onDone!() : undefined,
        tumble: undefined,
        onDesk: false, // a fall is in the AIR over the glass, on its way out of the scene
      });
    },
    slide(id, opts) {
      const rest = restOf(id);
      if (!rest) return;
      const cfg = {
        friction: opts.friction ?? tuning.friction,
        spinFriction: opts.spinFriction ?? tuning.spinFriction,
        bounce: opts.bounce ?? tuning.bounce,
        walls: opts.walls,
        gravity: tuning.gravity,
      };
      beginFlight(id, {
        body: { ...bodyAt(apply(rest, { x: 0, y: 0 })), vel: velocityOf(opts.speed, opts.angle), spin: opts.spin ?? 0, upVel: opts.hop ?? 0 },
        goMs: warped + (opts.delayMs ?? 0),
        started: false,
        angle0: turnOf(rest),
        step: (b, dt) => stepSlide(b, cfg, dt),
        over: (b) => slideRests(b, SLIDE_EPS, SPIN_EPS),
        // No animation: a slide stops where it stands.
        halt: (b) => ({ ...b, vel: { x: 0, y: 0 }, spin: 0 }),
        done: opts.onDone,
        tumble: opts.onTumble ? { left: facesLeft(cfg), on: opts.onTumble, carried: 0, count: 0, ended: false } : undefined,
        onDesk: true,
      });
    },
    retain(on) {
      if (retaining === on) return;
      retaining = on;
      draw();
    },
    redraw: () => draw(),
    retune(patch) {
      tuning = tune({ ...tuning, ...patch });
    },
    tuning() {
      return tuning;
    },
    stop() {
      unsubscribe();
      cancelFrame?.();
      cancelFrame = null;
      active.clear();
      choreos.clear();
      flights.clear();
      carried.clear();
      carrying = null;
    },
  };
}

/** The turn a pose carries, degrees — what a thrown body's own spin adds to. */
function turnOf(t: Transform): number {
  return (Math.atan2(t.b, t.a) * 180) / Math.PI;
}

/** The centre and extent of a group of rest poses' origins — what a shuffle recipe is told about the seats. */
function groupContext(rests: readonly (Transform | undefined)[], glass: ShuffleBox): ShuffleContext {
  const seats = rests.map((r) => (r ? apply(r, { x: 0, y: 0 }) : undefined));
  const known = seats.filter((s): s is Vec => !!s);
  if (known.length === 0) return { centre: { x: 0, y: 0 }, spread: { w: 0, h: 0 }, seats: [], glass };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of known) {
    x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y); x1 = Math.max(x1, o.x); y1 = Math.max(y1, o.y);
  }
  // A seat per CHILD, index for index — a recipe reads `seats[i]` for the piece it was handed, so
  // a node whose rest could not be read holds its place with the group's middle rather than
  // shortening the list and sliding every seat after it onto the wrong piece.
  const centre = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  return { centre, spread: { w: x1 - x0, h: y1 - y0 }, seats: seats.map((s) => s ?? centre), glass };
}
