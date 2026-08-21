// THE CHOREOGRAPHIES — a turn-over, a shuffle, a shiver, a bounce, a tumble.
//
// What they have in common is the whole reason they are together: each one is a POSE OVER TIME that
// ENDS WHERE THE TREE SAYS. Nothing here integrates anything; there is no body and no gravity. A
// span, a curve, and at most one `commit` on the way through — that is a choreography, and a throw
// (`throws.ts`) is the other kind entirely.

import { byId } from "../../core/node.js";
import { easing, flipScale } from "../../core/motion.js";
import { compose, move, rotate, scale } from "../../core/transform.js";
import { shuffleRecipe } from "../shuffles.js";
import {
  BOUNCE_BY,
  BOUNCE_COUNT,
  BOUNCE_MS,
  SHIVER_BY,
  SHIVER_CYCLES,
  SHIVER_MS,
  type Motions,
} from "./motions.js";
import { TUMBLE_TAIL, TURN_PER_FACE, tumbleAt, tumbleEase } from "./physics.js";
import { hscale } from "./poses.js";
import { groupContext } from "./groups.js";
import { type Runtime } from "./runtime.js";

type Choreographies = Pick<Motions, "flip" | "shuffle" | "shiver" | "bounce" | "roll">;

export function choreographies(rt: Runtime): Choreographies {
  return {
    flip(id, commit) {
      const ease = easing(rt.tuning.flipEase);
      rt.choreos.set(id, {
        ids: [id],
        startMs: rt.warped,
        durMs: rt.tuning.flipMs,
        commitAt: 0.5,
        commit,
        committed: false,
        beats: [],
        onBeat: undefined,
        beaten: 0,
        poseAt: (_i, _n, t, rest) => compose(rest, hscale(flipScale(ease(t)))),
      });
      rt.ensureLoop();
    },
    shuffle(containerId, commit, opts = {}) {
      const holder = byId(rt.host.root, containerId);
      const ids = holder ? holder.children.map((c) => c.id) : [];
      const recipe = shuffleRecipe(opts.recipe ?? "riffle");
      const ctx = groupContext(ids.map((id) => rt.restOf(id)), rt.visibleBox());
      rt.choreos.set(containerId, {
        ids,
        startMs: rt.warped,
        durMs: opts.shuffleMs ?? rt.tuning.shuffleMs,
        commitAt: recipe.commitAt,
        commit,
        committed: false,
        beats: [],
        onBeat: undefined,
        beaten: 0,
        poseAt: (i, n, t, rest) => recipe.poseAt(i, n, t, rest, ctx),
      });
      rt.ensureLoop();
    },
    shiver(id, opts = {}) {
      const durMs = opts.shiverMs ?? SHIVER_MS;
      const by = opts.by ?? SHIVER_BY;
      const cycles = opts.cycles ?? SHIVER_CYCLES;
      rt.choreos.set(id, {
        ids: [id],
        startMs: rt.warped,
        durMs,
        // Nothing to commit: a shiver says something, it does not change anything. `1` keeps the
        // no-op out of the middle of the span, where a reader would look for a meaning it has not.
        commitAt: 1,
        commit: () => {},
        committed: false,
        beats: [],
        onBeat: undefined,
        beaten: 0,
        // DECAYING, AND ZERO AT BOTH ENDS. `sin` starts at zero, and the `(1 - t)` envelope brings
        // the last swing to nothing exactly as the span closes — so the piece is on its rest pose
        // at the first frame and on the same one at the last, with no correction step between.
        poseAt: (_i, _n, t, rest) => compose(rest, move(Math.sin(t * cycles * 2 * Math.PI) * by * (1 - t), 0)),
      });
      rt.ensureLoop();
    },
    bounce(id, opts = {}) {
      const durMs = opts.bounceMs ?? BOUNCE_MS;
      const by = opts.by ?? BOUNCE_BY;
      const bounces = opts.bounces ?? BOUNCE_COUNT;
      rt.choreos.set(id, {
        ids: [id],
        startMs: rt.warped,
        durMs,
        // Nothing to commit, exactly as a shiver: the piece ends on the seat it started from.
        commitAt: 1,
        commit: () => {},
        committed: false,
        beats: [],
        onBeat: undefined,
        beaten: 0,
        // ARCS, DECAYING, AND ZERO AT BOTH ENDS. `|sin|` is one hump per half-turn, so `bounces`
        // of them fill the span and each touches down between; `(1 - t)` makes every landing lower
        // than the last. NEGATIVE y, because up the screen is where y gets smaller.
        poseAt: (_i, _n, t, rest) =>
          compose(rest, move(0, -Math.abs(Math.sin(t * bounces * Math.PI)) * by * (1 - t))),
        // It never leaves the felt, so the shadow goes with it — see `Choreo.rides`. This is the
        // whole visible difference from a `slide`'s `hop`, which leaves the desk and drops its
        // shadow away behind it.
        rides: true,
      });
      rt.ensureLoop();
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
      rt.choreos.set(id, {
        ids: [id],
        startMs: rt.warped,
        durMs: opts.rollMs ?? rt.tuning.rollMs,
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
      rt.ensureLoop();
    },
  };
}
