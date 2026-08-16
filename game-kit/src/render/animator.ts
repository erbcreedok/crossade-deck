// THE MOTION RUNTIME — the ONE clock. It watches the host's tree: when a node's resting pose moves,
// the node keeps its identity and a spring plays it there instead of teleporting. A `flip(id, commit)`
// turns a node over on the same clock: it squeezes to an edge and back and swaps the side at the edge,
// where there is no width to show the swap — the reflection rides the resting pose the swap produces.
//
// This is the only file in the kit that holds a frame loop (`guard.one-clock`). A settling scene runs
// the loop; a still one does not touch it (the idle-gate the canon asks of any continuous animation).
// The clock is injectable so a plain test can step frames without a browser — the same seam the scene
// shell uses for its painter.
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

import { type Node, type NodeId } from "../core/node.js";
import { flipScale, sample, type Motion } from "../core/motion.js";
import { springAt, springSettled, stepSpring, type SpringConfig, type SpringState } from "../core/spring.js";
import { carry, lean, type CarryStyle } from "../core/atoms/carry.js";
import { compose, type Transform, type Vec } from "../core/transform.js";
import { type Host } from "./host.js";
import { type Painter } from "./painter.js";
import { renderFrame } from "./stage.js";
import { transformsOf } from "./scenePlan.js";

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

export interface MotionOptions {
  /** How long a settle lasts, in ms. Default 180 — long enough to read, short enough not to wait. */
  readonly durationMs?: number;
  /** Registry name of the easing. Default `easeOut`. */
  readonly ease?: string;
  /** The clock. Default a `requestAnimationFrame` one; tests inject a fake. */
  readonly clock?: Clock;
  /** Which nodes bake — passed straight to the frame, same meaning as `attachPainter`. */
  readonly bake?: (node: Node) => boolean;
}

/** One node in a carried run, with its base layout offset from the grab pivot (root units). */
export interface CarryItem {
  readonly id: NodeId;
  readonly offset: Vec;
}

/** How a carry feels — every field but `anchor` optional, so a plain drag is `grab(items, {anchor})`. */
export interface CarryOptions {
  /** The grab pivot in root units — where the finger is now. Seeds the springs, so nothing jumps. */
  readonly anchor: Vec;
  /** Carry style name (`rigid`/`loose`/…). Default `rigid` — the run stays a coherent body. */
  readonly style?: string;
  /** Target lift scale while held (a small pop). Default 1 — no pop. */
  readonly lift?: number;
  /** The x/y chase spring. Default an underdamped follow (a ~120ms trail with a hair of settle). */
  readonly follow?: SpringConfig;
  /** The lift-scale spring. Default a snappier one, so the pop reads before the trail. */
  readonly liftSpring?: SpringConfig;
  /** Velocity → lean: `factor` degrees per (unit/s) of horizontal speed, saturating at `maxDeg`. */
  readonly tilt?: { readonly factor: number; readonly maxDeg: number };
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
  /**
   * Turn a node over on the clock. It squeezes to an edge and back — `|cos|` of a half-turn — and
   * `commit` runs at the EDGE, where the card has no width to show the swap. `commit` is the actual
   * `side` change (e.g. `setFacing`): the geometry (the reflection) rides the resting pose the swap
   * produces, so the far face grows un-mirrored. The normal settle is suppressed for the node while
   * it turns, so the resting change `commit` makes does not race a second flight.
   */
  flip(id: NodeId, commit: () => void): void;
  /** Stop following the host and cancel any running loop. */
  stop(): void;
}

const EPSILON = 1e-6;
/** A frame's dt is clamped here (seconds): a resumed background tab must not fling the springs. */
const MAX_DT = 0.05;
/** "Close enough" for a carry to stop the loop — root units for a position, a fraction for the scale. */
const CARRY_EPS = 1e-3;

const DEFAULT_FOLLOW: SpringConfig = { stiffness: 120, damping: 14 };
const DEFAULT_LIFT_SPRING: SpringConfig = { stiffness: 170, damping: 20 };

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
 * Attach the motion runtime to a host + painter — use this INSTEAD of `attachPainter` on a scene
 * that should animate. It paints the first frame, then repaints on every tree change, easing any
 * node whose rest pose moved.
 */
export function attachMotion(host: Host, painter: Painter, options: MotionOptions = {}): Motions {
  const durMs = options.durationMs ?? 180;
  const ease = options.ease ?? "easeOut";
  const clock = options.clock ?? rafClock;

  const displayed = new Map<NodeId, Transform>(); // what is on the glass now, root-unit space
  const active = new Map<NodeId, Motion>(); // nodes mid-flight
  const held = new Set<NodeId>(); // nodes a gesture owns — no easing
  // Nodes a finger is dragging: their pose is the FINGER's, an override, not the tree's. A drag never
  // touches the tree — the carry step only writes here — so a pointer-move costs one paint, not a reconcile.
  const carried = new Set<NodeId>();
  let carrying: Carry | null = null;
  let lastStepMs = 0;
  // Nodes mid-turn. `committed` guards the one swap at the edge; the width is `flipScale` of progress.
  const flipping = new Map<NodeId, { startMs: number; commit: () => void; committed: boolean }>();
  let cancelFrame: (() => void) | null = null;

  /** The pose overrides to hand the plan this frame: the in-flight nodes, at where they are now. */
  const overrides = (): ReadonlyMap<NodeId, Transform> | undefined => {
    if (active.size === 0 && flipping.size === 0 && carried.size === 0) return undefined;
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
    // A turning node keeps its resting pose (which carries the reflection) and wears the width of the
    // turn on top — squeezed to an edge at the midpoint, full again on the far face.
    const now = clock.now();
    for (const [id, f] of flipping) {
      const at = displayed.get(id);
      if (at) map.set(id, compose(at, hscale(flipScale((now - f.startMs) / durMs))));
    }
    return map;
  };

  /**
   * The nodes in FLIGHT this frame — settling, finger-owned, or mid-turn — handed to the plan as
   * its paint-order lift: a moving card rides above whatever it crosses, however tall the pile
   * (`PlanInput.raised`). The finger set is `held`, which contains every carried node too.
   */
  const raised = (): ReadonlySet<NodeId> | undefined =>
    active.size > 0 || held.size > 0 || flipping.size > 0
      ? new Set<NodeId>([...active.keys(), ...held, ...flipping.keys()])
      : undefined;

  const draw = (): void =>
    renderFrame(host, painter, { overrides: overrides(), raised: raised(), ...(options.bake ? { bake: options.bake } : {}) });

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
    for (const [id, to] of target) {
      if (held.has(id) || flipping.has(id)) {
        // Finger-owned or mid-turn: sit exactly where the tree says, no easing. A flip's `commit`
        // changes this node's rest pose (the reflection flips sign) — snapping it here is what keeps
        // that change from starting a second flight that would race the turn. A CARRIED node is the
        // exception: its pose is the finger's, not the tree's, so a stray reconcile must not snap it.
        if (!carried.has(id)) displayed.set(id, to);
        active.delete(id);
        continue;
      }
      const from = displayed.get(id);
      if (!from) {
        displayed.set(id, to); // a new node appears at rest — it did not fly in from nowhere
      } else if (!same(from, to)) {
        active.set(id, { from, to, startMs: clock.now(), durMs, ease });
      }
    }
    // Forget nodes that left the tree, in flight or not.
    for (const id of [...displayed.keys()]) if (!target.has(id)) displayed.delete(id);
    for (const id of [...active.keys()]) if (!target.has(id)) active.delete(id);
    if (active.size > 0) ensureLoop();
  };

  const step = (): void => {
    cancelFrame = null;
    const now = clock.now();
    for (const [id, m] of active) {
      const s = sample(m, now);
      displayed.set(id, s.transform);
      if (s.done) active.delete(id);
    }
    // Advance the carry springs: chase the finger, pop the lift, and lay the run out from where the
    // springs now are — the lag and the lean both fall out of the spring state, no separate tween.
    if (carrying) {
      let dt = (now - lastStepMs) / 1000;
      if (dt < 0) dt = 0;
      if (dt > MAX_DT) dt = MAX_DT;
      lastStepMs = now;
      const cy = carrying;
      cy.sx = stepSpring(cy.sx, cy.target.x, cy.follow, dt);
      cy.sy = stepSpring(cy.sy, cy.target.y, cy.follow, dt);
      cy.sl = stepSpring(cy.sl, cy.liftTo, cy.liftCfg, dt);
      layCarry(cy);
    }
    // Advance the turns: swap content once, at the edge; drop the turn when it lands.
    let committed = false;
    for (const [id, f] of flipping) {
      const t = durMs <= 0 ? 1 : (now - f.startMs) / durMs;
      if (t >= 0.5 && !f.committed) {
        f.committed = true;
        f.commit();
        committed = true;
      }
      if (t >= 1) flipping.delete(id);
    }
    // The swap moved a rest pose; re-read so the far face draws at its new, un-mirrored resting pose.
    if (committed) reconcile();
    draw();
    if (active.size > 0 || flipping.size > 0 || (carrying && !carrySettled(carrying))) ensureLoop();
  };

  const ensureLoop = (): void => {
    if (cancelFrame) return; // a frame is already scheduled — one clock, not two
    cancelFrame = clock.frame(step);
  };

  const unsubscribe = host.onChange(() => {
    reconcile();
    draw();
  });

  // First frame: every node is new, so nothing flies — it just paints where things rest.
  reconcile();
  draw();

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
      const anchor = opts.anchor;
      carrying = {
        items,
        style: carry(opts.style ?? "rigid"),
        target: anchor,
        sx: springAt(anchor.x),
        sy: springAt(anchor.y),
        sl: springAt(1),
        liftTo: opts.lift ?? 1,
        follow: opts.follow ?? DEFAULT_FOLLOW,
        liftCfg: opts.liftSpring ?? DEFAULT_LIFT_SPRING,
        tiltFactor: opts.tilt?.factor ?? 0,
        tiltMax: opts.tilt?.maxDeg ?? 0,
      };
      for (const it of items) {
        carried.add(it.id);
        held.add(it.id);
        active.delete(it.id);
      }
      lastStepMs = clock.now();
      layCarry(carrying); // paint the run under the finger at once
      draw();
      if (!carrySettled(carrying)) ensureLoop(); // a pop or an off-anchor seat needs the loop; a bare grab does not
    },
    dragTo(anchor) {
      if (!carrying) return;
      carrying.target = anchor;
      ensureLoop();
    },
    flip(id, commit) {
      // A turn already running for this node is replaced — the latest word wins, as everywhere here.
      flipping.set(id, { startMs: clock.now(), commit, committed: false });
      ensureLoop();
    },
    stop() {
      unsubscribe();
      cancelFrame?.();
      cancelFrame = null;
      active.clear();
      flipping.clear();
      carried.clear();
      carrying = null;
    },
  };
}
