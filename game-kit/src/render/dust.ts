// THE CENSOR'S DUST — the arithmetic of a Telegram-spoiler cloud, and not one pixel of it.
//
// The look is the owner's, carried over from the previous client generation: a hidden face is not
// greyed out, it is GROUND UP. Motes are born on the node's own silhouette, each one keeps the
// COLOUR OF WHAT IT WAS BORN ON, drifts outwards, fades in and out over its own short life, and is
// replaced by another. Six of them are noise; a thousand of them are the face, smeared.
//
// Everything here is pure, which is the whole reason the file exists apart from `pixi.ts`. The
// renderer can only hand over two things — the grid of colours it read off the glass, and the
// clock — and jsdom cannot run a line of it, so any rule decided in there is a rule nobody can
// hold down. The layout of the cloud, the levers, and where a mote is at second `t` are decided
// HERE, under a plain unit test.
//
// The one thing that is not a straight port is that a mote keeps NO STATE. In the old client a
// particle was an object that respawned itself; here `moteAt` answers "where is mote `i` at time
// `t`" from nothing but `i` and `t`, because the kit rebuilds its scene from the plan every frame
// and an object with a memory would be reseeded every time — the cloud would shiver instead of
// drift. A mote's generation is `floor(t / life)` and each generation draws its own home and
// direction from a seeded rng, so the churn is the same churn without anything to keep.

import { seededRng } from "../core/rng.js";

const TAU = Math.PI * 2;

/**
 * THE FOUR LEVERS, and their values are the OWNER'S — chosen on a live stand, not derived. They
 * survive the move verbatim; a number here that drifts is the look drifting.
 *
 * They are levers of the DANCE, not of one renderer: `block` is how coarse a mote is, `swapsPerSec`
 * how fast the cloud churns itself over, `jitterAmp` how far a mote flies from home, `jitterFreq`
 * how quickly it twinkles. Everything a mote does is derived from these four by `dustParams`.
 */
export interface DustLevers {
  /** Size of one mote, in the plan's pixels. */
  readonly block: number;
  /** Churn rate — how often the cloud replaces itself. Higher means shorter lives. */
  readonly swapsPerSec: number;
  /** Spread — how far a mote drifts from where it was born. */
  readonly jitterAmp: number;
  /** Twinkle rate, when twinkling is on at all. */
  readonly jitterFreq: number;
}

/** The owner's chosen dust: mote 5, churn 25, spread 1, twinkle 1. Do not tune without them. */
export const DUST_LEVERS: DustLevers = { block: 5, swapsPerSec: 25, jitterAmp: 1, jitterFreq: 1 };

/**
 * Twinkling is OFF by default — photosensitivity, and it simply reads calmer. The lever survives
 * because the stand it was chosen on had it; the default is the answer.
 */
export const DUST_FLICKER = false;

/**
 * The whole cloud runs at a THIRD of real time. Not a global speed knob — that would have slowed
 * every other animation in the scene with it — but a multiplier inside the dust, so the same
 * slow drift shows wherever the dust shows.
 */
export const DUST_TIME_SCALE = 1 / 3;

/** What a mote actually does, derived from the levers. The renderer reads these, never the levers. */
export interface DustParams {
  /** Side of one mote's square, in pixels. */
  readonly dot: number;
  /** Top drift speed, in pixels per (scaled) second. A mote draws its own below this. */
  readonly drift: number;
  /** Base lifetime in seconds; each mote spreads its own around this. */
  readonly life: number;
  readonly twinkleHz: number;
  readonly flicker: boolean;
  readonly timeScale: number;
}

/**
 * Levers → what a mote does. The floors are the load-bearing part: a mote under a pixel and a half
 * is invisible however many of them there are, and a life under a third of a second churns so fast
 * the cloud stops reading as motion and starts reading as static.
 */
export function dustParams(levers: DustLevers, flicker: boolean): DustParams {
  return {
    dot: Math.max(1.5, levers.block * 0.8),
    drift: levers.jitterAmp * 14,
    life: Math.max(0.35, 1.3 - levers.swapsPerSec / 120),
    twinkleHz: levers.jitterFreq * 0.4,
    flicker,
    timeScale: DUST_TIME_SCALE,
  };
}

/** One square of the sampled face: whether there was anything there, and what colour it was. */
export interface DustCell {
  readonly on: boolean;
  /** `0xRRGGBB`. Meaningless when `on` is false. */
  readonly color: number;
}

/** Where a mote is born, and the colour it inherited from that spot. */
export interface DustPoint {
  readonly x: number;
  readonly y: number;
  readonly color: number;
}

/** Below this alpha a sampled square counts as empty — a rounded corner, a gap, the ground. */
const CELL_ALPHA = 100;

/**
 * Read a sampled face into cells: one per pixel of the shrunken picture.
 *
 * THE SHRINKING IS THE AVERAGING. A face reduced to a grid of cells has already had each square
 * blended down to one colour by the sampler, which is exactly the colour a mote over that square
 * should be — nobody has to average anything by hand.
 *
 * Two things are decided here and both bite if they are not. A square too transparent to see is
 * OFF, so a rounded corner does not sprout dust past the edge. And the channels arrive
 * PREMULTIPLIED by alpha, so a half-transparent edge would come out unnaturally dark unless the
 * alpha is divided back out.
 */
export function dustCells(pixels: ArrayLike<number>, count: number): DustCell[] {
  const cells: DustCell[] = [];
  for (let i = 0; i < count; i += 1) {
    const a = pixels[i * 4 + 3] ?? 0;
    if (a <= CELL_ALPHA) {
      cells.push({ on: false, color: 0 });
      continue;
    }
    const k = 255 / a;
    const r = Math.min(255, Math.round((pixels[i * 4] ?? 0) * k));
    const g = Math.min(255, Math.round((pixels[i * 4 + 1] ?? 0) * k));
    const b = Math.min(255, Math.round((pixels[i * 4 + 2] ?? 0) * k));
    cells.push({ on: true, color: (r << 16) | (g << 8) | b });
  }
  return cells;
}

/** About this many cells across the short side of a node. Finer is mush, coarser is confetti. */
const CELLS_ACROSS = 22;

/**
 * The sampling step for a node of this size, in pixels — never below two, or the grid costs more
 * than the cloud it feeds. Measured on the SHORT side so a long node gets more cells rather than
 * coarser ones: the density of the smear should not depend on which way the node is turned.
 */
export function dustStep(width: number, height: number): number {
  const short = Math.min(Math.abs(width), Math.abs(height));
  if (!Number.isFinite(short) || short <= 0) return 2;
  return Math.max(2, Math.round(short / CELLS_ACROSS));
}

/** Motes born per lit cell. Two is the density the look was chosen at. */
export const DUST_PER_CELL = 2;

/**
 * The ceiling on one node's cloud. Not a precaution: every mote is redrawn on every frame, so the
 * cost of a cloud is linear in its size, and one ornate node must not be able to take down a scene
 * that holds six of them.
 */
export const MOTE_CAP = 900;

/**
 * Where motes are born: `perCell` of them at the centre of every lit cell, laid out around the
 * node's own origin — which is where its contour is centred, so the cloud lands on the face rather
 * than beside it.
 *
 * Cells that are off give NOTHING. That is the difference between dust that follows a silhouette
 * and dust that fills the bounding box, and on anything with a rounded corner it is visible at once.
 */
export function dustPoints(cells: readonly DustCell[], cols: number, rows: number, step: number, perCell: number): DustPoint[] {
  const offX = -(cols * step) / 2;
  const offY = -(rows * step) / 2;
  const points: DustPoint[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cell = cells[r * cols + c];
      // A short grid is skipped rather than thrown over: a sampler that came back with fewer
      // pixels than asked is a bad frame, not a reason to drop the scene.
      if (!cell || !cell.on) continue;
      const x = offX + c * step + step / 2;
      const y = offY + r * step + step / 2;
      for (let d = 0; d < perCell; d += 1) points.push({ x, y, color: cell.color });
    }
  }
  return points;
}

/** Thin a cloud down to the cap by taking every k-th point, so the shape it draws is unchanged. */
export function thinPoints(points: readonly DustPoint[], cap: number): DustPoint[] {
  if (points.length <= cap) return [...points];
  const k = points.length / cap;
  const out: DustPoint[] = [];
  for (let i = 0; i < cap; i += 1) out.push(points[Math.floor(i * k)]!);
  return out;
}

/** One mote at one instant: where it has drifted to, what colour it carries, how brightly it burns. */
export interface Mote {
  readonly x: number;
  readonly y: number;
  readonly color: number;
  /** 0…1 — the arc of its own life, times the twinkle when twinkling is on. */
  readonly alpha: number;
}

/** Odd multiplier (the golden ratio in 32 bits) — mixes an index and a generation into one seed. */
const MIX = 0x9e3779b1;

/**
 * WHERE MOTE `index` IS AT SECOND `t`. A pure function of the two, and that is the whole design.
 *
 * A mote has two layers of chance. Its OWN, drawn once from its index and never again: how long it
 * lives relative to the others, how far into a life it starts, and its twinkle phase. All three
 * exist for one reason — so the cloud does not pulse in unison, which is what a field of identical
 * lifetimes does and it looks like a fault rather than dust.
 *
 * And its GENERATION'S, redrawn every time it is reborn: which point of the cloud it comes from,
 * which way it goes, and how fast. So a mote wanders the whole silhouette over time instead of
 * pumping in and out of one spot, and the smear reads as a face being ground up rather than as a
 * grid of blinking dots.
 *
 * The birth-to-death arc is `sin(π · age/life)`: nothing at both ends, full in the middle. Motes
 * therefore never appear or vanish, they only arrive and leave.
 */
export function moteAt(points: readonly DustPoint[], index: number, params: DustParams, t: number): Mote {
  if (points.length === 0) return { x: 0, y: 0, color: 0, alpha: 0 };
  // A clock that has gone wrong dims the cloud; it never puts a NaN into a coordinate. The scene
  // one frame behind is a glitch, a NaN in a Graphics path is a node that never draws again.
  const clock = Number.isFinite(t) ? Math.max(0, t) * params.timeScale : 0;
  const own = seededRng(index + 1);
  const life = Math.max(1e-3, params.life * (0.6 + 0.8 * own()));
  const start = own();
  const twinklePhase = own() * TAU;

  const turns = clock / life + start;
  const generation = Math.floor(turns);
  const age = (turns - generation) * life;

  const born = seededRng((Math.imul(index + 1, MIX) ^ (generation + 1)) >>> 0);
  const home = points[Math.floor(born() * points.length) % points.length]!;
  const angle = born() * TAU;
  const speed = born() * params.drift;

  const fade = Math.sin(Math.PI * (age / life));
  const twinkle = params.flicker ? 0.55 + 0.45 * Math.sin(clock * params.twinkleHz * TAU + twinklePhase) : 1;
  return {
    x: home.x + Math.cos(angle) * speed * age,
    y: home.y + Math.sin(angle) * speed * age,
    color: home.color,
    alpha: fade * twinkle,
  };
}
