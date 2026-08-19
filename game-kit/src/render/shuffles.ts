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
// WHAT A REORDER MUST NOT LOOK LIKE: a piece changing its face. Nothing is ever swapped — every
// node keeps its identity from the first frame to the last — so the eye must be given the same
// story: a piece leaves, and comes back to SOMEONE ELSE'S place. What gave the lie away was a
// packet parked as a tight PILE: a pile shows only its top piece, and the reorder changes which
// piece that is, so the swap reads as a face changing in the hand.
//
// Two ways out, and a recipe that parts a pack offers BOTH as `reach`:
//   • `group` — the DEFAULT, and the one a player should see: the packet stays in the picture and
//     is FANNED, every piece standing clear of its neighbours. With no pile there is no top to
//     change, and the whole shuffle is watchable from the first frame to the last.
//   • `glass` — the packet carries clean off `ctx.glass` and the order turns over out of sight.
//     For a pack too deep to fan (a fifty-two card deck), where a fan is a pile again.
//
// The kit registers nothing on import; a consumer calls `installStockShuffles()`, as with surfaces.

import { permutation, seededRng } from "../core/rng.js";
import { apply, compose, move, pose, type Transform, type Vec } from "../core/transform.js";

/** A box in root units — where the seats are, or what the onlooker can see. */
export interface ShuffleBox {
  /** The smallest corner. */
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** What a recipe knows about the group it moves: where its seats are centred and how far they spread. */
export interface ShuffleContext {
  /** The centre of the seats, root units. */
  readonly centre: Vec;
  /** The extent of the seats — width and height of their box, root units (`0` for a stack). */
  readonly spread: { readonly w: number; readonly h: number };
  /**
   * EVERY SEAT of the group, root units, in the order the shuffle started with — `seats[i]` is
   * where the `i`-th child stood. A reorder only permutes who sits where, so this is the same set
   * of places before and after the commit, which is what lets a recipe put a piece on a NEIGHBOUR'S
   * seat and still land the group truthfully. Only the scramble reads it.
   */
  readonly seats: readonly Vec[];
  /**
   * WHAT THE ONLOOKER CAN SEE, root units — the box a piece has to leave for the swap to happen out
   * of sight. It is the visible box and not the viewport: under a camera it is what that camera
   * shows, zoom and turn included, so "past the edge" means past the edge of the picture on the
   * glass. Degenerate (`w`/`h` of `0`) before the first layout, and a recipe falls back to the
   * group's own extent then — see `hideBox`.
   */
  readonly glass: ShuffleBox;
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
  return SHUFFLES.get(name) ?? STOCK;
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
const easeBoth = (t: number): number => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
const originOf = (rest: Transform): Vec => apply(rest, { x: 0, y: 0 });
/** The rest pose moved so its origin lands on `to`, keeping the seat's own turn and size. */
const seatAt = (rest: Transform, to: Vec): Transform => {
  const o = originOf(rest);
  return compose(move(to.x - o.x, to.y - o.y), rest);
};
/** The same, with a turn of its own about that point. */
const seatTurned = (rest: Transform, to: Vec, deg: number): Transform => {
  const o = originOf(rest);
  return compose(pose(to, deg), compose(move(-o.x, -o.y), rest));
};
const lerpVec = (a: Vec, b: Vec, s: number): Vec => ({ x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s });

/**
 * ONE PIECE PAST THE EDGE. The unit IS the piece by the kit's own convention (a card is about a
 * unit), so an origin a unit outside the visible box carries the whole piece out with it. A recipe
 * cannot ask how big a piece is — it moves whatever it is given — and this is the honest stand-in.
 */
const CLEAR = 1;
/**
 * How far apart pieces of one packet stand while they are out, and the most a packet may span. A
 * WHOLE piece apart where the packet is small enough to allow it — that is what "no pile" means —
 * and squeezed under that only when a deep pack would otherwise span the whole desk.
 */
const FAN = 1;
const FAN_SPAN = 4;

/** The step that keeps `m` pieces off each other without letting a big packet span the whole desk. */
const fanStep = (m: number): number => Math.min(FAN, FAN_SPAN / Math.max(m - 1, 1));

/**
 * KEEP A WATCHED PACKET IN THE PICTURE. `group` says "clear of the group", and on a small glass
 * that can still be past the edge — a shuffle nobody can see is not what the reach was asked for.
 * So the coordinate is pulled back inside the visible box, half a piece in, and a packet only ever
 * leaves the picture when it was sent out of it on purpose (or when the group itself does not fit).
 */
function inSight(v: number, lo: number, span: number, reach: ShuffleReach, glass: ShuffleBox): number {
  if (reach !== "group" || glass.w <= 0 || glass.h <= 0) return v;
  return Math.min(lo + span - CLEAR / 2, Math.max(lo + CLEAR / 2, v));
}

/** How far a parted packet goes: clear of the GROUP and still watched, or clean off the GLASS. */
export type ShuffleReach = "group" | "glass";

/**
 * The box a packet has to clear. The group's own extent for `group`; the visible box for `glass` —
 * and that one falls back to the group before the first layout (a headless scene, a view still
 * measuring itself, both of which report no glass at all), where at least the picture stays
 * coherent even though nothing can be hidden by an edge that is not there.
 */
function reachBox(ctx: ShuffleContext, reach: ShuffleReach): ShuffleBox {
  if (reach === "glass" && ctx.glass.w > 0 && ctx.glass.h > 0) return ctx.glass;
  const w = Math.max(ctx.spread.w, 1);
  const h = Math.max(ctx.spread.h, 1);
  return { x: ctx.centre.x - w / 2, y: ctx.centre.y - h / 2, w, h };
}

export interface RiffleOptions {
  /** Where the halves go: clear of the GROUP and watched (the default), or off the GLASS. */
  readonly reach?: ShuffleReach;
}

/**
 * RIFFLE — the pack splits into two halves that part to either side, FANNED so no piece hides
 * another, and zip back onto the new seats, the halves' pieces alternating in time so the merge
 * reads as teeth meshing. The half a piece belongs to is its ORIGINAL half; where it lands is
 * wherever the new order seats it — the pack goes out in one order and comes back in another,
 * which is the whole of what a reorder is, and with `reach: "group"` a player watches it happen.
 */
export function riffle({ reach = "group" }: RiffleOptions = {}): ShuffleRecipe {
  return {
    commitAt: 0.5,
    poseAt: (i, n, t, rest, ctx) => {
      if (t >= 1) return rest;
      const box = reachBox(ctx, reach);
      const half = Math.ceil(n / 2);
      const left = i < half;
      const side = left ? -1 : 1;
      const j = left ? i : i - half; // rank inside the packet
      const m = Math.max(1, left ? half : n - half);
      const step = fanStep(m);
      // The packet waits a whole piece clear of the box it was told to leave, fanned across the
      // travel so its pieces stand apart: a pile would show only its top, and its top is exactly
      // what a reorder changes.
      const out: Vec = {
        x: inSight(side < 0 ? box.x - CLEAR : box.x + box.w + CLEAR, ctx.glass.x, ctx.glass.w, reach, ctx.glass),
        y: ctx.centre.y + (j - (m - 1) / 2) * step,
      };
      if (t < 0.5) {
        const s = easeOut(clamp01(t / 0.5));
        return seatTurned(rest, lerpVec(originOf(rest), out, s), side * 12 * s);
      }
      // The zip: each piece leaves its half a hair after the one before, alternating halves.
      const rank = left ? j * 2 : j * 2 + 1;
      const stagger = n > 1 ? (rank / (n - 1)) * 0.4 : 0;
      const s = easeOut(clamp01(((t - 0.5) / 0.5 - stagger) / (1 - stagger)));
      return seatTurned(rest, lerpVec(out, originOf(rest), s), side * 12 * (1 - s));
    },
  };
}

export interface OverhandOptions {
  /** Where the packets go: clear of the GROUP and watched (the default), or off the GLASS. */
  readonly reach?: ShuffleReach;
}

/**
 * OVERHAND — the pack in three packets, each lifted in turn (a touch higher per packet) and dropped
 * back onto the new seats: the shape of a hand pulling packets off the top and letting them fall.
 * Each packet SPREADS while it is up, for the same reason the riffle's does — a packet held as a
 * pile is a swap of faces waiting to be seen.
 */
export function overhand({ reach = "group" }: OverhandOptions = {}): ShuffleRecipe {
  return {
    commitAt: 0.5,
    poseAt: (i, n, t, rest, ctx) => {
      if (t >= 1) return rest;
      const box = reachBox(ctx, reach);
      const packets = 3;
      const packet = Math.min(packets - 1, Math.floor((i / Math.max(n, 1)) * packets));
      const from = Math.ceil((packet * n) / packets);
      const m = Math.max(1, Math.ceil(((packet + 1) * n) / packets) - from);
      const j = i - from;
      const up: Vec = {
        x: ctx.centre.x + (j - (m - 1) / 2) * fanStep(m),
        y: inSight(box.y - CLEAR - packet * 0.4, ctx.glass.y, ctx.glass.h, reach, ctx.glass),
      };
      if (t < 0.5) {
        const s = easeOut(clamp01((t - packet * 0.1) / 0.3));
        return seatAt(rest, lerpVec(originOf(rest), up, s));
      }
      const s = easeIn(clamp01((t - 0.5 - packet * 0.1) / 0.35));
      return seatAt(rest, lerpVec(up, originOf(rest), s));
    },
  };
}

export interface WashOptions {
  /**
   * The ring's radius, root units. `0` — and that is the default — is AUTO: a ring that just clears
   * the group, whatever size the group turns out to be. A ring of no radius is not a ring, so zero
   * is free to mean "work it out".
   */
  readonly radius?: number;
}

/**
 * WASH — every piece scatters to a ring around the group, turning as it goes, and the ring gathers
 * back onto the new seats: the tiles-on-a-table shuffle, for pieces that have no order to riffle.
 * The pieces stand on their OWN spoke of the ring the whole way round, so nothing hides anything.
 */
export function wash({ radius = 0 }: WashOptions = {}): ShuffleRecipe {
  return {
    commitAt: 0.5,
    poseAt: (i, n, t, rest, ctx) => {
      if (t >= 1) return rest;
      const r = radius > 0 ? radius : Math.max(ctx.spread.w, ctx.spread.h) / 2 + 0.7;
      const a0 = (i / Math.max(n, 1)) * Math.PI * 2;
      const ring = (turn: number): Vec => ({
        x: ctx.centre.x + r * Math.cos(a0 + turn),
        y: ctx.centre.y + r * Math.sin(a0 + turn),
      });
      if (t < 0.5) {
        const s = easeOut(clamp01(t / 0.5));
        return seatTurned(rest, lerpVec(originOf(rest), ring(s * 1.2), s), 90 * s);
      }
      const s = easeOut(clamp01((t - 0.5) / 0.5));
      return seatTurned(rest, lerpVec(ring(1.2 + s * 1.2), originOf(rest), s), 90 * (1 - s));
    },
  };
}

export interface ShakeOptions {
  /**
   * How hard the group is shaken — `1` is the stock tremble. It moves BOTH halves of the look at
   * once, because they are one thing to a hand: a harder shake trembles wider and throws the pieces
   * onto each other's seats oftener. `0` is a group that only trembles, and never changes hands.
   */
  readonly strength?: number;
}

/** Where the swapping stops and the group starts landing on the order it will keep. */
const SCRAMBLE_END = 0.75;
/** Swaps per shuffle at `strength: 1` — the previous client's ~0.16 s beat, on the stock duration. */
const BEATS = 4;
/** How high a piece arcs while it changes seats, and how far it turns doing it. */
const HOP = 0.3;
const HOP_TURN = 14;

/**
 * SHAKE — the group trembles and, all the while it trembles, the pieces keep landing on each
 * OTHER'S seats: dice in a cup, tiles in a bag, the previous client's scramble — pieces thrown onto
 * a random permutation of the slots every beat until the real order arrives, then settling into it.
 *
 * The permutation of a beat is drawn from the BEAT NUMBER, so it is the same on every frame of that
 * beat and on every machine: this is a picture, not a truth, and it must not need an rng of its own
 * to stay still. The tree's own reorder happens under the trembling (`commitAt`), where the pose is
 * built from the seats rather than from any one piece's rest, and the last quarter carries every
 * piece home to the order it will keep.
 */
export function shake({ strength = 1 }: ShakeOptions = {}): ShuffleRecipe {
  const force = Math.max(0, strength);
  const beats = Math.max(0, Math.round(BEATS * force));
  return {
    commitAt: 0.5,
    poseAt: (i, n, t, rest, ctx) => {
      if (t >= 1) return rest;
      const home = originOf(rest);
      const seats = ctx.seats.length === n ? ctx.seats : undefined;
      // Where the `i`-th piece sits on beat `k`. Beat zero is where it started; every beat after
      // that is a permutation of the seats drawn from the beat number alone.
      const seatOn = (k: number): Vec => {
        if (!seats) return home;
        if (k <= 0) return seats[i] ?? home;
        const perm = permutation(n, seededRng(k));
        return seats[perm[i] ?? i] ?? home;
      };
      // The tremble holds while the pieces are still changing hands and dies as they land, so the
      // shiver stops with the swapping rather than fading out under it.
      const decay = t < SCRAMBLE_END ? 1 : clamp01((1 - t) / (1 - SCRAMBLE_END));
      const phase = i * 1.7;
      const shiver: Vec = {
        x: Math.sin(t * 40 + phase) * 0.12 * force * decay,
        y: Math.cos(t * 34 + phase * 1.3) * 0.12 * force * decay,
      };
      const spin = Math.sin(t * 28 + phase) * 10 * force * decay;

      if (t < SCRAMBLE_END && beats > 0) {
        const beat = (t / SCRAMBLE_END) * beats;
        const k = Math.floor(beat);
        const u = beat - k;
        const s = easeBoth(u);
        const at = lerpVec(seatOn(k), seatOn(k + 1), s);
        // The arc off the desk, so a swap reads as a piece thrown rather than slid through its
        // neighbour, and a turn that goes with it.
        const lift = Math.sin(Math.PI * u) * HOP * force;
        const turn = Math.sin(Math.PI * u) * HOP_TURN * force * (k % 2 === 0 ? 1 : -1);
        return seatTurned(rest, { x: at.x + shiver.x, y: at.y + shiver.y - lift }, spin + turn);
      }
      // The landing: from wherever the last beat left it onto the seat the tree now gives it.
      const s = easeOut(clamp01((t - SCRAMBLE_END) / (1 - SCRAMBLE_END)));
      const at = lerpVec(seatOn(beats), home, s);
      return seatTurned(rest, { x: at.x + shiver.x, y: at.y + shiver.y }, spin);
    },
  };
}

/** The fallback an unknown name plays — built once, so a miss costs nothing. */
const STOCK = riffle();

/** Register the stock recipes under the names a game and the catalog use. */
export function installStockShuffles(): void {
  registerShuffle("riffle", STOCK);
  registerShuffle("overhand", overhand());
  registerShuffle("wash", wash());
  registerShuffle("shake", shake());
}
