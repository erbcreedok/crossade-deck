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
// owns a node it must track the finger 1:1, NOT ease. `hold(id)` marks that; the node then jumps to
// its tree pose every frame. `release(id)` hands it back, and the next tree change eases it from where
// the finger left it to where it now rests.

import { type Node, type NodeId } from "../core/node.js";
import { flipScale, sample, type Motion } from "../core/motion.js";
import { compose, type Transform } from "../core/transform.js";
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

export interface Motions {
  /** A finger now owns this node: track its tree pose 1:1, do not ease it. */
  hold(id: NodeId): void;
  /** Hand the node back: the next tree change eases it from here to its rest pose. */
  release(id: NodeId): void;
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
  // Nodes mid-turn. `committed` guards the one swap at the edge; the width is `flipScale` of progress.
  const flipping = new Map<NodeId, { startMs: number; commit: () => void; committed: boolean }>();
  let cancelFrame: (() => void) | null = null;

  /** The pose overrides to hand the plan this frame: the in-flight nodes, at where they are now. */
  const overrides = (): ReadonlyMap<NodeId, Transform> | undefined => {
    if (active.size === 0 && flipping.size === 0) return undefined;
    const map = new Map<NodeId, Transform>();
    for (const id of active.keys()) {
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

  const draw = (): void => renderFrame(host, painter, { overrides: overrides(), ...(options.bake ? { bake: options.bake } : {}) });

  /** Read the tree's new rest poses and start a spring for every node whose pose moved. */
  const reconcile = (): void => {
    const target = transformsOf(host.root);
    for (const [id, to] of target) {
      if (held.has(id) || flipping.has(id)) {
        // Finger-owned or mid-turn: sit exactly where the tree says, no easing. A flip's `commit`
        // changes this node's rest pose (the reflection flips sign) — snapping it here is what keeps
        // that change from starting a second flight that would race the turn.
        displayed.set(id, to);
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
    if (active.size > 0 || flipping.size > 0) ensureLoop();
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
    },
  };
}
