// THE MOTIONS REGISTRY — a LOOK a piece can be asked to play, by name.
//
// A game already has verbs for the things that CHANGE something: a turn-over commits a side, a
// shuffle commits an order, a throw ends where the physics says. This registry is for the other
// half — a motion that says something and changes nothing, and which a designer should be able to
// author, name and reuse WITHOUT writing a verb. `registerMotion("cheer", bounceMotion({...}))`,
// and every scene that knows the name can play it.
//
// It is the shuffles registry again, deliberately (`shuffles.ts`): a recipe is a pure function of
// (index, count, progress, rest pose) → in-flight pose, stepped by the one clock, and the runtime
// never learns which recipe it is holding. Two laws come across with the shape:
//   • at `t = 1` it returns `rest` EXACTLY — the piece is on its seat and no settle has to fix it
//     up; a recipe that ends anywhere else makes every play finish with a jerk. Guarded.
//   • it is ENTITY-AGNOSTIC — children by index, cards or tiles or dice.
//
// ONE DEPARTURE FROM THE SHUFFLES PRECEDENT, on purpose: an unknown shuffle name falls back to
// `riffle`, because every reorder has to look like SOMETHING. An unknown motion name resolves to
// `undefined` and plays nothing. There is no stock look for "the designer typed the name wrong",
// and a shiver appearing where a cheer was asked for is a bug that hides itself.
//
// WHAT IS NOT HERE, and what it would cost. A recipe here is TIMED: it owns a span and a curve
// over it, which is what `durMs` means. The kit's other kind of motion is DRIVEN — a body under
// gravity or friction (`animator/throws.ts`), where the end is the physics' answer and a duration
// is not a lever at all. Folding the two under one name is the honest widening of this file, and
// it costs a discriminant (`kind: "timed" | "driven"`) plus `durMs` becoming conditional on it.
// Until a driven recipe exists, that discriminant would be a field with one value, so it is not
// written: every field here applies to every recipe here, which is the property worth keeping.

import { easing, lerp } from "../core/motion.js";
import { compose, move, rotate, scale, type Transform, type Vec } from "../core/transform.js";

/** The pose of the `i`-th piece (of `n`) at progress `t`, built on the seat it rests at. */
export type MotionPose = (i: number, n: number, t: number, rest: Transform) => Transform;

export interface MotionRecipe {
  readonly poseAt: MotionPose;
  /** How long one play lasts, ms — before the viewer's `motionSpeed` and any per-call override. */
  readonly durMs: number;
  /**
   * The progress at which the tree changes hands, if the caller passed a `commit`. Default `1` —
   * nothing to commit, and the no-op kept out of the middle of the span where a reader would look
   * for a meaning it has not.
   */
  readonly commitAt?: number | undefined;
  /**
   * The progresses at which the LOOK underneath changes hands — a die's face going over. Empty for
   * a motion that shows one thing throughout, which is nearly all of them.
   */
  readonly beats?: readonly number[] | undefined;
  /**
   * THE PIECE IS AT EVERY PLACE IT PASSES, rather than on its way to one — so its shadow travels
   * with it instead of waiting at the seat. See `Choreo.rides`: what earns this is a motion whose
   * whole subject is TRAVEL, not merely one that moves.
   */
  readonly rides?: boolean | undefined;
}

const MOTIONS = new Map<string, MotionRecipe>();

export function registerMotion(name: string, recipe: MotionRecipe): void {
  MOTIONS.set(name, recipe);
}

/** The named recipe, or `undefined` when the name is unregistered — see the file header on why. */
export function motionRecipe(name: string): MotionRecipe | undefined {
  return MOTIONS.get(name);
}

export function motionNames(): readonly string[] {
  return [...MOTIONS.keys()];
}

/** Test seam only — the registry is process-wide and suites must not leak into each other. */
export function resetMotions(): void {
  MOTIONS.clear();
}

// ─── the stock looks ─────────────────────────────────────────────────────────────────────────────
//
// Their numbers are the FACTORIES' DEFAULTS and not module constants any more: a default is a
// number a caller may argue with, and a constant is one nobody can reach. Every one of them was
// sized against a CARD, which is about one root unit across — that is what makes them portable.

/** Short enough to read as one event rather than an animation: a twitch, not a wobble. */
export const SHIVER_MS = 180;
/**
 * How far it swings at its widest, in root units.
 *
 * Sized against a CARD: a card is about one unit across and is drawn near a hundred pixels wide on
 * a phone, so this is a swing of some seven pixels. The first version was a third of that and could
 * not be seen at all — a 2-pixel swing lasting 180 ms is not a subtle animation, it is an absent
 * one. Big enough to read as a buzz, small enough that nobody thinks the card MOVED.
 */
export const SHIVER_BY = 0.07;
/** Three swings in 180 ms is roughly the frequency a hand reads as a buzz. */
export const SHIVER_CYCLES = 3;

/** Long enough to read as a jump rather than a twitch, short enough not to be a wait. */
export const BOUNCE_MS = 520;
/**
 * How high the first arc reaches, root units — about half a card's height, which is a jump nobody
 * can miss and still keeps the piece over the seat it belongs to.
 */
export const BOUNCE_BY = 0.75;
/** Two arcs: the jump, and the small one it lands with. A third reads as a ball, not a piece. */
export const BOUNCE_COUNT = 2;

/** Whole turns of a spin, and how much it grows at the top of its hop. */
export const SPIN_MS = 900;
export const SPIN_TURNS = 2;
export const SPIN_HOP = 1.25;

export interface ShiverMotionOptions {
  readonly durMs?: number | undefined;
  /** How far it swings at its widest, root units. */
  readonly by?: number | undefined;
  /** How many there-and-back swings fit in the span. */
  readonly cycles?: number | undefined;
}

/**
 * A DECAYING SIDEWAYS TREMBLE, zero at both ends of the span — the answer to a gesture that has
 * just changed meaning. `sin` starts at zero, and the `(1 - t)` envelope brings the last swing to
 * nothing exactly as the span closes, so the piece is on its rest pose at the first frame and on
 * the same one at the last with no correction step between.
 */
export function shiverMotion(opts: ShiverMotionOptions = {}): MotionRecipe {
  const by = opts.by ?? SHIVER_BY;
  const cycles = opts.cycles ?? SHIVER_CYCLES;
  return {
    durMs: opts.durMs ?? SHIVER_MS,
    poseAt: (_i, _n, t, rest) =>
      t >= 1 ? rest : compose(rest, move(Math.sin(t * cycles * 2 * Math.PI) * by * (1 - t), 0)),
  };
}

export interface BounceMotionOptions {
  readonly durMs?: number | undefined;
  /** How high the FIRST arc reaches, root units. */
  readonly by?: number | undefined;
  /** How many arcs fit in the span; each is smaller than the last. */
  readonly bounces?: number | undefined;
}

/**
 * ARCS UP THE SCREEN, decaying, zero at both ends. `|sin|` is one hump per half-turn, so `bounces`
 * of them fill the span and each touches down between; `(1 - t)` makes every landing lower than the
 * last. NEGATIVE y, because up the screen is where y gets smaller.
 *
 * It never leaves the felt, so `rides` is on and the shadow goes with it — the visible difference
 * from a `slide`'s `hop`, which leaves the desk and drops its shadow away behind it.
 */
export function bounceMotion(opts: BounceMotionOptions = {}): MotionRecipe {
  const by = opts.by ?? BOUNCE_BY;
  const bounces = opts.bounces ?? BOUNCE_COUNT;
  return {
    durMs: opts.durMs ?? BOUNCE_MS,
    rides: true,
    poseAt: (_i, _n, t, rest) =>
      t >= 1 ? rest : compose(rest, move(0, -Math.abs(Math.sin(t * bounces * Math.PI)) * by * (1 - t))),
  };
}

export interface SpinMotionOptions {
  readonly durMs?: number | undefined;
  /** Whole turns about the piece's own centre over the span. */
  readonly turns?: number | undefined;
  /** How much it grows at the top of the hop, as a scale (`1` is flat). */
  readonly hop?: number | undefined;
  /** Registry name of the easing over the turn. `linear` is a constant spin. */
  readonly ease?: string | undefined;
}

/**
 * A WHOLE NUMBER OF TURNS about the piece's own centre, with a swell in the middle that reads as
 * the piece rising to do it. Whole turns are what make it end on the seat: any other count would
 * leave the piece facing somewhere new, which is a move and not a look.
 */
export function spinMotion(opts: SpinMotionOptions = {}): MotionRecipe {
  const turns = opts.turns ?? SPIN_TURNS;
  const hop = opts.hop ?? SPIN_HOP;
  const ease = easing(opts.ease ?? "linear");
  return {
    durMs: opts.durMs ?? SPIN_MS,
    poseAt: (_i, _n, t, rest) => {
      if (t >= 1) return rest;
      const size = 1 + (hop - 1) * Math.sin(Math.PI * t);
      return compose(rest, compose(rotate(turns * 360 * ease(t)), scale(size)));
    },
  };
}

/**
 * ONE POSE THE DESIGNER WROTE DOWN, at one point of the span.
 *
 * Every channel is an OFFSET FROM THE SEAT and in the piece's OWN space — `move` is along the
 * piece's own width and height, `turn` and `scale` are about its own centre. That is what lets one
 * key play the same on a piece standing anywhere, at any size, under any camera.
 *
 * A PAUSE is two keys with the same values at different `at` — there is no `hold` field, because a
 * hold IS a segment that does not change, and a second word for it would be a second way to say
 * one thing.
 */
export interface MotionKey {
  /** Where in the span this key sits, `0..1`. */
  readonly at: number;
  /** Offset from the seat, root units. */
  readonly move?: Vec | undefined;
  /** Turn about the piece's own centre, degrees. */
  readonly turn?: number | undefined;
  /** Size about the piece's own centre; `1` is as it rests. */
  readonly scale?: number | undefined;
  /**
   * Registry name of the easing INTO this key from the one before — the curve of the SEGMENT that
   * ends here. Default the recipe's own `ease`, so a designer sets the feel once and overrides the
   * one segment that wants a different one.
   */
  readonly ease?: string | undefined;
}

export interface KeyframeMotionOptions {
  readonly durMs?: number | undefined;
  readonly keys: readonly MotionKey[];
  /** Registry name of the easing every segment uses unless it names its own. Default `easeOut`. */
  readonly ease?: string | undefined;
  readonly commitAt?: number | undefined;
  readonly beats?: readonly number[] | undefined;
  readonly rides?: boolean | undefined;
}

interface Key {
  readonly at: number;
  readonly x: number;
  readonly y: number;
  readonly turn: number;
  readonly scale: number;
  readonly ease: string | undefined;
}

const KEYFRAME_MS = 600;

/**
 * A MOTION THE DESIGNER AUTHORED, as data — the point of the whole registry.
 *
 * The ends are the SEAT and are put there by construction: a rest key is prepended at `0` and
 * appended at `1` unless the designer wrote one at exactly that position, and `t >= 1` returns the
 * seat itself. So the first law of a recipe cannot be broken by a table of numbers, however the
 * table was typed — which is what makes this safe to expose to somebody who is not reading the
 * runtime.
 */
export function keyframeMotion(opts: KeyframeMotionOptions): MotionRecipe {
  const ease = opts.ease ?? "easeOut";
  const written: Key[] = opts.keys
    .map((k) => ({
      at: k.at <= 0 ? 0 : k.at >= 1 ? 1 : k.at,
      x: k.move?.x ?? 0,
      y: k.move?.y ?? 0,
      turn: k.turn ?? 0,
      scale: k.scale ?? 1,
      ease: k.ease,
    }))
    .sort((a, b) => a.at - b.at);
  const seat = (at: number): Key => ({ at, x: 0, y: 0, turn: 0, scale: 1, ease: undefined });
  const keys: readonly Key[] = [
    ...(written[0]?.at === 0 ? [] : [seat(0)]),
    ...written,
    ...(written[written.length - 1]?.at === 1 ? [] : [seat(1)]),
  ];
  return {
    durMs: opts.durMs ?? KEYFRAME_MS,
    commitAt: opts.commitAt,
    beats: opts.beats,
    rides: opts.rides,
    poseAt: (_i, _n, t, rest) => {
      if (t >= 1) return rest;
      let hi = 1;
      while (hi < keys.length - 1 && keys[hi]!.at <= t) hi += 1;
      const b = keys[hi]!;
      const a = keys[hi - 1]!;
      // A ZERO-WIDTH SEGMENT is two keys written at the same `at` — a deliberate jump, and the
      // pose on the far side of it is the one that wins.
      const span = b.at - a.at;
      const s = span <= 0 ? 1 : (t - a.at) / span;
      const e = easing(b.ease ?? ease)(s <= 0 ? 0 : s >= 1 ? 1 : s);
      return compose(
        rest,
        compose(
          move(lerp(a.x, b.x, e), lerp(a.y, b.y, e)),
          compose(rotate(lerp(a.turn, b.turn, e)), scale(lerp(a.scale, b.scale, e))),
        ),
      );
    },
  };
}

/**
 * Register the stock looks under the names the kit's own catalog uses. Called by the consumer and
 * never on import, as with surfaces, easings and shuffles.
 */
export function installStockMotions(): void {
  registerMotion("shiver", shiverMotion());
  registerMotion("bounce", bounceMotion());
  registerMotion("spin", spinMotion());
}
