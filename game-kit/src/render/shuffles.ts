// THE SHUFFLES REGISTRY — how a reorder LOOKS while it happens. A shuffle's truth is `reorder` on
// the tree (the same children in a new order — the seed or the server decides which); a recipe here
// is only the picture of the group between the old seats and the new. It never sees the rng, and
// the reorder never sees the recipe: swap either and the other does not notice.
//
// A recipe is a pure function of (index, count, progress, rest pose, group extent) → in-flight pose,
// stepped by the one clock (`animator.shuffle`), and it obeys three laws the runtime relies on:
//   • at `t = 1` it returns `rest` exactly — the node is at its (new) seat and no settle has to fix
//     it up; a recipe that ends anywhere else makes every shuffle finish with a jerk;
//   • at `commitAt` its pose does not depend on `rest` — that is the frame the tree reorders and
//     every rest changes under it, so a pose still built on the seat would jump there;
//   • it is ENTITY-AGNOSTIC: children by index, cards or tiles or dice — a fan of a hand is the
//     cards preset's business, this only moves what it is given.
//
// The kit registers nothing on import; a consumer calls `installStockShuffles()`, as with surfaces.

import { apply, compose, move, pose, type Transform, type Vec } from "../core/transform.js";

/** What a recipe knows about the group it moves: where its seats are centred and how far they spread. */
export interface ShuffleContext {
  /** The centre of the seats, root units. */
  readonly centre: Vec;
  /** The extent of the seats — width and height of their box, root units (`0` for a stack). */
  readonly spread: { readonly w: number; readonly h: number };
}

/** The pose of the `i`-th child (of `n`, in the order the shuffle STARTED with) at progress `t`. */
export type ShufflePose = (i: number, n: number, t: number, rest: Transform, ctx: ShuffleContext) => Transform;

export interface ShuffleRecipe {
  readonly poseAt: ShufflePose;
  /** The progress at which the tree reorders — the group should be off its seats here. */
  readonly commitAt: number;
}

const SHUFFLES = new Map<string, ShuffleRecipe>();

export function registerShuffle(name: string, recipe: ShuffleRecipe): void {
  SHUFFLES.set(name, recipe);
}

/** The named recipe, or `riffle` when unknown — an unknown look never throws, it just looks stock. */
export function shuffleRecipe(name: string): ShuffleRecipe {
  return SHUFFLES.get(name) ?? riffle;
}

export function shuffleNames(): readonly string[] {
  return [...SHUFFLES.keys()];
}

/** Test seam only — the registry is process-wide and suites must not leak into each other. */
export function resetShuffles(): void {
  SHUFFLES.clear();
}

const clamp01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t);
const easeOut = (t: number): number => 1 - (1 - t) ** 3;
const easeIn = (t: number): number => t ** 3;
const originOf = (rest: Transform): Vec => apply(rest, { x: 0, y: 0 });
/** The rest pose moved so its origin lands on `to`, keeping the seat's own turn and size. */
const seatAt = (rest: Transform, to: Vec): Transform => {
  const o = originOf(rest);
  return compose(move(to.x - o.x, to.y - o.y), rest);
};
const lerpVec = (a: Vec, b: Vec, s: number): Vec => ({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s });

/**
 * RIFFLE — the pack splits into two halves that part to either side, then zip back together, the
 * halves' cards alternating in time so the merge reads as teeth meshing. The half a card belongs to
 * is its ORIGINAL half; where it lands is wherever the new order seats it.
 */
export const riffle: ShuffleRecipe = {
  commitAt: 0.5,
  poseAt: (i, n, t, rest, ctx) => {
    const side = i < n / 2 ? -1 : 1;
    const reach = Math.max(ctx.spread.w, 1) / 2 + 0.6;
    const split: Vec = { x: ctx.centre.x + side * reach, y: ctx.centre.y + (i - (n - 1) / 2) * 0.03 };
    if (t < 0.5) {
      const s = easeOut(clamp01(t / 0.5));
      const at = lerpVec(originOf(rest), split, s);
      return compose(pose(at, side * 12 * s), compose(move(-originOf(rest).x, -originOf(rest).y), rest));
    }
    // The zip: each card leaves its half a hair after the one before, alternating halves.
    const rank = i < n / 2 ? i * 2 : (i - Math.ceil(n / 2)) * 2 + 1;
    const stagger = n > 1 ? (rank / (n - 1)) * 0.4 : 0;
    const s = easeOut(clamp01(((t - 0.5) / 0.5 - stagger) / (1 - stagger)));
    if (t >= 1) return rest;
    const at = lerpVec(split, originOf(rest), s);
    return compose(pose(at, side * 12 * (1 - s)), compose(move(-originOf(rest).x, -originOf(rest).y), rest));
  },
};

/**
 * OVERHAND — the pack in three packets, each lifted off the desk in turn (up the screen, a touch
 * higher per packet) and dropped back onto the new seats: the shape of a hand pulling packets off
 * the top and letting them fall.
 */
export const overhand: ShuffleRecipe = {
  commitAt: 0.5,
  poseAt: (i, n, t, rest, ctx) => {
    const packet = Math.min(2, Math.floor((i / Math.max(n, 1)) * 3));
    const up: Vec = { x: ctx.centre.x + (packet - 1) * 0.35, y: ctx.centre.y - 0.5 - packet * 0.25 };
    if (t < 0.5) {
      const s = easeOut(clamp01((t - packet * 0.1) / 0.3));
      return seatAt(rest, lerpVec(originOf(rest), up, s));
    }
    if (t >= 1) return rest;
    const s = easeIn(clamp01(((t - 0.5) - packet * 0.1) / 0.35));
    return seatAt(rest, lerpVec(up, originOf(rest), s));
  },
};

/**
 * WASH — every piece scatters to a ring around the group, turning as it goes, and the ring gathers
 * back onto the new seats: the tiles-on-a-table shuffle, for pieces that have no order to riffle.
 */
export const wash: ShuffleRecipe = {
  commitAt: 0.5,
  poseAt: (i, n, t, rest, ctx) => {
    const radius = Math.max(ctx.spread.w, ctx.spread.h) / 2 + 0.7;
    const a0 = (i / Math.max(n, 1)) * Math.PI * 2;
    const ring = (turn: number): Vec => ({ x: ctx.centre.x + radius * Math.cos(a0 + turn), y: ctx.centre.y + radius * Math.sin(a0 + turn) });
    if (t < 0.5) {
      const s = easeOut(clamp01(t / 0.5));
      return compose(pose(lerpVec(originOf(rest), ring(s * 1.2), s), 90 * s), compose(move(-originOf(rest).x, -originOf(rest).y), rest));
    }
    if (t >= 1) return rest;
    const s = easeOut(clamp01((t - 0.5) / 0.5));
    return compose(pose(lerpVec(ring(1.2 + s * 1.2), originOf(rest), s), 90 * (1 - s)), compose(move(-originOf(rest).x, -originOf(rest).y), rest));
  },
};

/**
 * SHAKE — the group trembles in place, each piece on its own phase, the shiver dying out by the end:
 * dice in a cup, tiles in a bag. Nothing leaves its seat far; the reorder happens under the blur.
 */
export const shake: ShuffleRecipe = {
  commitAt: 0.5,
  poseAt: (i, _n, t, rest) => {
    if (t >= 1) return rest;
    const decay = 1 - t;
    const phase = i * 1.7;
    const dx = Math.sin(t * 40 + phase) * 0.12 * decay;
    const dy = Math.cos(t * 34 + phase * 1.3) * 0.12 * decay;
    const turn = Math.sin(t * 28 + phase) * 10 * decay;
    const o = originOf(rest);
    return compose(pose({ x: o.x + dx, y: o.y + dy }, turn), compose(move(-o.x, -o.y), rest));
  },
};

/** Register the stock recipes under the names a game and the catalog use. */
export function installStockShuffles(): void {
  registerShuffle("riffle", riffle);
  registerShuffle("overhand", overhand);
  registerShuffle("wash", wash);
  registerShuffle("shake", shake);
}
