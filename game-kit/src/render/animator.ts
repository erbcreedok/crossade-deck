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
// they carry the "feel": the finger moves a TARGET and a spring per axis CHASES it, so the run trails
// the finger (lag) and leans into its motion (`carry` style + `lean`); a lift spring pops it up. The
// run's per-card poses are a `CarryStyle` (rigid = one plank about the pivot, loose = per-card) fed the
// springed anchor each frame. `release(id)` hands the node back, and because the tree never moved, the
// next reconcile eases it home from exactly where the finger left it — the lean and lift unwind on the
// way. (`hold(id)` is the older, tree-driven gesture the same `release` closes.)

import { byId, type Node, type NodeId } from "../core/node.js";
import { easing, flipScale, sample, tune, type CarryTuning, type Motion, type MotionTuning, type TuningPatch } from "../core/motion.js";
import { springAt, springSettled, stepSpring, type SpringConfig, type SpringState } from "../core/spring.js";
import { carry, lean, type CarryStyle } from "../core/atoms/carry.js";
import { bodyAt, slideRests, stepFall, stepSlide, velocityOf, type Body, type Walls } from "../core/ballistic.js";
import { apply, compose, move, pose, rotate, scale, type Transform, type Vec } from "../core/transform.js";
import { type Host } from "./host.js";
import { type Painter } from "./painter.js";
import { renderFrame } from "./stage.js";
import { transformsOf } from "./scenePlan.js";
import { shuffleRecipe, type ShuffleContext } from "./shuffles.js";

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
};

/** One node in a carried run, with its base layout offset from the grab pivot (root units). */
export interface CarryItem {
  readonly id: NodeId;
  readonly offset: Vec;
}

/** How a carry feels — the anchor, and any of the carry fields of the tuning as a per-gesture patch. */
export type CarryOptions = {
  /** The grab pivot in root units — where the finger is now. Seeds the springs, so nothing jumps. */
  readonly anchor: Vec;
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
  /** Runs once the body has left the glass; the override is gone and the node is at its rest again. */
  readonly onDone?: (() => void) | undefined;
} & { readonly gravity?: number | undefined; readonly bounce?: number | undefined };

/** A throw across the DESK: friction bleeds speed and spin, walls reflect, it stops where it stops. */
export type SlideOptions = {
  readonly speed: number;
  readonly angle: number;
  /** Turn rate, degrees/s. Default 0. */
  readonly spin?: number | undefined;
  /** The tray, root units. Default: the whole desk, endless. */
  readonly walls?: Walls | undefined;
  readonly delayMs?: number | undefined;
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
  /** Stop following the host and cancel any running loop. */
  stop(): void;
}

const EPSILON = 1e-6;
/** A frame's dt is clamped here (seconds) for the INTEGRATORS: a resumed background tab must not fling the springs. */
const MAX_DT = 0.05;
/** "Close enough" for a carry to stop the loop — root units for a position, a fraction for the scale. */
const CARRY_EPS = 1e-3;
/** "Stopped" for a slide — units/s and degrees/s. */
const SLIDE_EPS = 0.02;
const SPIN_EPS = 2;
/** How far past the glass edge a launched body is "gone", root units. */
const OFF_GLASS = 1;

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
  readonly liftTo: number;
  readonly follow: SpringConfig;
  readonly liftCfg: SpringConfig;
  readonly tiltFactor: number;
  readonly tiltMax: number;
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
  readonly angle0: number;
  readonly done: ((rest: { readonly at: Vec; readonly angle: number }) => void) | undefined;
}

/**
 * Attach the motion runtime to a host + painter — use this INSTEAD of `attachPainter` on a scene
 * that should animate. It paints the first frame, then repaints on every tree change, easing any
 * node whose rest pose moved.
 */
export function attachMotion(host: Host, painter: Painter, options: MotionOptions = {}): Motions {
  const tuning: MotionTuning = tune(options);
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
    // A flying body's pose is its own: where the physics put it, turned as it spins, at the rest's size.
    for (const [id, f] of flights) {
      const rest = displayed.get(id);
      if (rest) map.set(id, f.started ? seatAt(rest, f.body.pos, f.body.angle) : rest);
    }
    return map;
  };

  /**
   * The nodes in FLIGHT this frame — settling, finger-owned, choreographed, thrown — handed to the
   * plan as its paint-order lift: a moving card rides above whatever it crosses, however tall the
   * pile (`PlanInput.raised`). The finger set is `held`, which contains every carried node too.
   */
  const raised = (): ReadonlySet<NodeId> | undefined => {
    if (active.size === 0 && held.size === 0 && choreos.size === 0 && flights.size === 0) return undefined;
    return new Set<NodeId>([...active.keys(), ...held, ...choreographed(), ...flights.keys()]);
  };

  const draw = (): void =>
    renderFrame(host, painter, {
      overrides: overrides(),
      raised: raised(),
      retain: retaining,
      ...(options.bake ? { bake: options.bake } : {}),
    });

  /** True once a carry's springs have all but arrived and stopped — the gate the loop sleeps on. */
  const carrySettled = (cy: Carry): boolean =>
    springSettled(cy.sx, cy.target.x, CARRY_EPS) &&
    springSettled(cy.sy, cy.target.y, CARRY_EPS) &&
    springSettled(cy.sl, cy.liftTo, CARRY_EPS);

  /** Lay the carried run out from the springed anchor this frame, writing each node's override pose. */
  const layCarry = (cy: Carry): void => {
    const leanDeg = lean(cy.sx.vel, cy.tiltFactor, cy.tiltMax);
    const anchor = { x: cy.sx.pos, y: cy.sy.pos };
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
      if (held.has(id) || posed.has(id) || flights.has(id)) {
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
      } else {
        cy.sx = stepSpring(cy.sx, cy.target.x, cy.follow, dt);
        cy.sy = stepSpring(cy.sy, cy.target.y, cy.follow, dt);
        cy.sl = stepSpring(cy.sl, cy.liftTo, cy.liftCfg, dt);
      }
      layCarry(cy);
    }
    // Advance the flights: a stagger holds a body at rest until its turn; then the physics.
    for (const [id, f] of [...flights]) {
      if (!f.started) {
        if (instant || warped >= f.goMs) f.started = true;
        else continue;
      }
      f.body = instant ? f.halt(f.body) : f.step(f.body, dt);
      if (f.over(f.body)) land(id, f);
    }
    // Advance the choreographies: commit once, at the phase; drop each when it lands. Commits first
    // and a reconcile after them while the nodes are STILL choreographed — so the rest a commit
    // changes is snapped, not flown — and only then are the finished ones let go.
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

  const beginFlight = (id: NodeId, f: Flight): void => {
    flights.set(id, f);
    held.delete(id);
    carried.delete(id);
    active.delete(id);
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
        liftTo: t.lift,
        follow: { stiffness: t.followStiffness, damping: t.followDamping },
        liftCfg: { stiffness: t.liftStiffness, damping: t.liftDamping },
        tiltFactor: t.leanFactor,
        tiltMax: t.leanMaxDeg,
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
        poseAt: (_i, _n, t, rest) => compose(rest, hscale(flipScale(ease(t)))),
      });
      ensureLoop();
    },
    shuffle(containerId, commit, opts = {}) {
      const holder = byId(host.root, containerId);
      const ids = holder ? holder.children.map((c) => c.id) : [];
      const recipe = shuffleRecipe(opts.recipe ?? "riffle");
      const ctx = groupContext(ids.map((id) => restOf(id)).filter((r): r is Transform => !!r));
      choreos.set(containerId, {
        ids,
        startMs: warped,
        durMs: opts.shuffleMs ?? tuning.shuffleMs,
        commitAt: recipe.commitAt,
        commit,
        committed: false,
        poseAt: (i, n, t, rest) => recipe.poseAt(i, n, t, rest, ctx),
      });
      ensureLoop();
    },
    roll(id, commit, opts = {}) {
      const turns = opts.turns ?? 2;
      const hop = opts.hop ?? 1.25;
      choreos.set(id, {
        ids: [id],
        startMs: warped,
        durMs: opts.rollMs ?? tuning.rollMs,
        // The face is committed on the way down from the hop's top, when the piece is turning slowest.
        commitAt: 0.7,
        commit,
        committed: false,
        poseAt: (_i, _n, t, rest) => {
          if (t >= 1) return rest;
          const eased = 1 - (1 - t) ** 3;
          const size = 1 + (hop - 1) * Math.sin(Math.PI * t);
          return compose(rest, compose(rotate(turns * 360 * eased), scale(size)));
        },
      });
      ensureLoop();
    },
    launch(id, opts) {
      const rest = restOf(id);
      if (!rest) return;
      const { halfW, halfH } = glass();
      const cfg = { gravity: opts.gravity ?? tuning.gravity, bounce: opts.bounce ?? tuning.bounce, floor: opts.floor ?? halfH };
      const offGlass = (b: Body): boolean => Math.abs(b.pos.x) > halfW + OFF_GLASS || b.pos.y > halfH + OFF_GLASS;
      beginFlight(id, {
        body: { ...bodyAt(apply(rest, { x: 0, y: 0 })), vel: velocityOf(opts.speed, opts.angle), spin: opts.spin ?? 0 },
        goMs: warped + (opts.delayMs ?? 0),
        started: false,
        angle0: turnOf(rest),
        step: (b, dt) => stepFall(b, cfg, dt),
        over: offGlass,
        // No animation: a fall is simply gone.
        halt: (b) => ({ ...b, pos: { x: halfW + OFF_GLASS + 1, y: b.pos.y }, vel: { x: 0, y: 0 }, spin: 0 }),
        done: opts.onDone ? () => opts.onDone!() : undefined,
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
      };
      beginFlight(id, {
        body: { ...bodyAt(apply(rest, { x: 0, y: 0 })), vel: velocityOf(opts.speed, opts.angle), spin: opts.spin ?? 0 },
        goMs: warped + (opts.delayMs ?? 0),
        started: false,
        angle0: turnOf(rest),
        step: (b, dt) => stepSlide(b, cfg, dt),
        over: (b) => slideRests(b, SLIDE_EPS, SPIN_EPS),
        // No animation: a slide stops where it stands.
        halt: (b) => ({ ...b, vel: { x: 0, y: 0 }, spin: 0 }),
        done: opts.onDone,
      });
    },
    retain(on) {
      if (retaining === on) return;
      retaining = on;
      draw();
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
function groupContext(rests: readonly Transform[]): ShuffleContext {
  if (rests.length === 0) return { centre: { x: 0, y: 0 }, spread: { w: 0, h: 0 } };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rests) {
    const o = apply(r, { x: 0, y: 0 });
    x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y); x1 = Math.max(x1, o.x); y1 = Math.max(y1, o.y);
  }
  return { centre: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 }, spread: { w: x1 - x0, h: y1 - y0 } };
}
