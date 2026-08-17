// THE BUILDER AND THE THROWS — a die as a node, and the three doors a game throws it through.
//
// `die()` hands back one node: `Bounded` (the kind's silhouette), `Surfaced` (the classic face of the
// value it shows), `Valued` (`{ kind, face }` — what a rule reads), `Rollable` (how many faces),
// `Draggable`, `Transformable` (its seat, and the turn it rests at) and `ShadowCaster`. The nodes
// REFERENCE surface names; those are the classic skin's, so by default `die()` installs it.
//
// A throw is TWO separate things and the add-on keeps them apart on purpose:
//   • the RESULT — where the face comes from. `Outcome` is a number (the server said, the test says,
//     the cheat says), a seed (every client draws the same), or an rng (the solo game's chance).
//     Resolved ONCE, up front, by `outcomeOf`; the animation only ever shows it.
//   • the LOOK — the engine's runtime plays it: `rollDie` tumbles the die in place (a choreography),
//     `throwDie` slides it across the desk on the ballistics (walls of a tray, spin, friction) and
//     writes where it stopped into the tree, `throwFromCarry` is the same throw with the finger's own
//     speed — a drag let go with inertia. All three commit the face through `showFace`.
//
// A game with a menu calls the kit's stock verb instead: `perform("roll", die)` (Math.random, no
// animation) — the atom's door, when nothing on the desk needs to move.

import {
  apply,
  Bounded,
  compose,
  Draggable,
  fieldsOf,
  IDENTITY,
  invert,
  node,
  polar,
  Rollable,
  rollDie as drawFace,
  seededRng,
  setFace,
  ShadowCaster,
  sidesOf,
  Surfaced,
  Transformable,
  transformsOf,
  Valued,
  type Motions,
  type Node,
  type Rng,
  type RollOptions,
  type SlideOptions,
  type TransformableFields,
  type ValuedFields,
  type Vec,
  type Walls,
} from "game-kit";
import { dieSpec, type DieKind } from "./kinds.js";
import { faceSurface, installDiceSkin } from "./skin.classic.js";

export interface DieOptions {
  readonly kind: DieKind;
  /** Where it sits, in its owner's units. Default the origin. */
  readonly at?: Vec;
  /** The face it shows to begin with. Default 1. */
  readonly face?: number;
  /** Install the classic skin first, so faces resolve. Default true — pass false to skin it yourself. */
  readonly install?: boolean;
}

/** One die as a node — see the header for what it carries. */
export function die(id: string, opts: DieOptions): Node {
  if (opts.install ?? true) installDiceSkin();
  const spec = dieSpec(opts.kind);
  const face = opts.face ?? 1;
  return node(
    id,
    Bounded({ bounds: spec.shape }),
    Transformable({ at: opts.at ?? { x: 0, y: 0 } }),
    Surfaced({ surface: faceSurface(opts.kind, face) }),
    Valued({ values: { kind: opts.kind, face } }),
    Rollable({ sides: spec.sides }),
    Draggable(),
    ShadowCaster({ from: "silhouette" }),
  );
}

/** The kind a die node was built as — off its values, so a rule and a skin agree on it. */
export function kindOf(n: Node): DieKind | undefined {
  const kind = fieldsOf<ValuedFields>(n, "Valued")?.values["kind"];
  return kind === "d4" || kind === "d6" || kind === "d20" ? kind : undefined;
}

/**
 * Show a face: the TRUTH (`values.face`, through the kit's `setFace`) and the PICTURE (the skin's
 * surface for it), written together so a die never says one thing and shows another.
 */
export function showFace(n: Node, face: number): void {
  const kind = kindOf(n);
  if (!kind) return;
  setFace(n, face);
  compose(n, Surfaced({ surface: faceSurface(kind, face) }));
}

/**
 * Where a result comes from — the whole of the add-on's adaptivity in one type:
 *   a NUMBER   — the face is given: the server decided, the test pins it, the cheat wants it;
 *   `{ seed }` — every client draws the same face from the same seed (the kit's rng);
 *   `{ rng }`  — the game's own source of chance (`Math.random` for a solo desk).
 */
export type Outcome = number | { readonly seed: number } | { readonly rng: Rng };

/** Resolve an outcome to a face of a `sides`-sided die — refusing a given number the die has not. */
export function outcomeOf(sides: number, outcome: Outcome): number {
  if (typeof outcome === "number") {
    if (!Number.isInteger(outcome) || outcome < 1 || outcome > sides) throw new Error(`face ${outcome} is not on a ${sides}-sided die`);
    return outcome;
  }
  const rng = "seed" in outcome ? seededRng(outcome.seed) : outcome.rng;
  return drawFace(sides, rng);
}

export type RollDieOptions = RollOptions & {
  readonly outcome: Outcome;
  /** Runs when the face is committed. */
  readonly onFace?: ((face: number) => void) | undefined;
};

/**
 * Tumble a die IN PLACE — turns and a hop on the one clock — and commit the face late in the tumble.
 * The face is decided now and returned; the picture catches up when the runtime says.
 */
export function rollDie(motions: Motions, d: Node, opts: RollDieOptions): number {
  const face = outcomeOf(sidesOf(d) ?? 6, opts.outcome);
  motions.roll(
    d.id,
    () => {
      showFace(d, face);
      opts.onFace?.(face);
    },
    opts,
  );
  return face;
}

export type ThrowDieOptions = Omit<SlideOptions, "onDone"> & {
  readonly outcome: Outcome;
  /** Runs when the die has stopped and the face is shown, with the face. */
  readonly onRest?: ((face: number) => void) | undefined;
};

/**
 * Throw a die ACROSS THE DESK: it slides on the engine's ballistics — spinning, slowing, bouncing off
 * `walls` if a tray is given — and when it stops, its seat and turn are written into the tree
 * (`Transformable.at`/`angle`, in its owner's units, so it stays where it landed) and the face is
 * shown. `root` is the desk the die is under — the runtime reports the landing in root units and
 * the die's owner may sit anywhere on it.
 */
export function throwDie(motions: Motions, root: Node, d: Node, opts: ThrowDieOptions): number {
  const face = outcomeOf(sidesOf(d) ?? 6, opts.outcome);
  const { outcome: _outcome, onRest, ...slide } = opts;
  motions.slide(d.id, {
    ...slide,
    onDone: (rest) => {
      const own = fieldsOf<TransformableFields>(d, "Transformable");
      const ownerPose = d.parent ? transformsOf(root).get(d.parent.id) ?? IDENTITY : IDENTITY;
      const local = apply(invert(ownerPose) ?? IDENTITY, rest.at);
      const ownerTurn = (Math.atan2(ownerPose.b, ownerPose.a) * 180) / Math.PI;
      compose(d, Transformable({ ...(own ?? { z: 0, scale: 1 }), at: local, angle: rest.angle - ownerTurn }));
      showFace(d, face);
      onRest?.(face);
    },
  });
  return face;
}

export type ThrowFromCarryOptions = Omit<ThrowDieOptions, "speed" | "angle"> & {
  /** Multiplies the finger's speed into the throw's. Default 1. */
  readonly gain?: number | undefined;
  /** Below this speed (units/s) the release is a DROP, not a throw: the die stays put. Default 0.5. */
  readonly minSpeed?: number | undefined;
};

/**
 * Let a carried die go WITH ITS MOMENTUM: the carry spring's speed at release becomes the throw's.
 * Returns the face when it flew, `undefined` when it was only set down (the game then releases it as
 * an ordinary drop — its rest is wherever the layout seats it).
 */
export function throwFromCarry(motions: Motions, root: Node, d: Node, opts: ThrowFromCarryOptions): number | undefined {
  const v = motions.velocity();
  if (!v) return undefined;
  const { speed, angle } = polar(v);
  const gained = speed * (opts.gain ?? 1);
  if (gained < (opts.minSpeed ?? 0.5)) return undefined;
  const { gain: _gain, minSpeed: _min, ...rest } = opts;
  return throwDie(motions, root, d, { ...rest, speed: gained, angle });
}

/** The walls of a tray node — its footprint's box in root units — for `throwDie`'s `walls`. */
export function wallsOf(root: Node, tray: Node, inset = 0): Walls | undefined {
  const pose = transformsOf(root).get(tray.id);
  const box = fieldsOf<{ bounds: { start: Vec; segments: ReadonlyArray<{ to: Vec }> } }>(tray, "Bounded")?.bounds;
  if (!pose || !box) return undefined;
  const pts = [box.start, ...box.segments.map((s) => s.to)].map((p) => apply(pose, p));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return { x0: Math.min(...xs) + inset, y0: Math.min(...ys) + inset, x1: Math.max(...xs) - inset, y1: Math.max(...ys) - inset };
}
