// THE MOTION RUNTIME — the ONE clock. It watches the host's tree: when a node's resting pose moves,
// the node keeps its identity and a spring plays it there instead of teleporting. Position and angle
// only, for now — a flip is a `side` change and rides its own slice.
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
import { sample, type Motion } from "../core/motion.js";
import { type Transform } from "../core/transform.js";
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
  /** Stop following the host and cancel any running loop. */
  stop(): void;
}

const EPSILON = 1e-6;

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
  let cancelFrame: (() => void) | null = null;

  /** The pose overrides to hand the plan this frame: the in-flight nodes, at where they are now. */
  const overrides = (): ReadonlyMap<NodeId, Transform> | undefined => {
    if (active.size === 0) return undefined;
    const map = new Map<NodeId, Transform>();
    for (const id of active.keys()) {
      const at = displayed.get(id);
      if (at) map.set(id, at);
    }
    return map;
  };

  const draw = (): void => renderFrame(host, painter, { overrides: overrides(), ...(options.bake ? { bake: options.bake } : {}) });

  /** Read the tree's new rest poses and start a spring for every node whose pose moved. */
  const reconcile = (): void => {
    const target = transformsOf(host.root);
    for (const [id, to] of target) {
      if (held.has(id)) {
        // The finger owns it: sit exactly where the tree says, cancel any leftover flight.
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
    draw();
    if (active.size > 0) ensureLoop();
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
    stop() {
      unsubscribe();
      cancelFrame?.();
      cancelFrame = null;
      active.clear();
    },
  };
}
