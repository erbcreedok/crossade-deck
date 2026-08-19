import { describe, expect, it } from "vitest";
import {
  DUST_FLICKER,
  DUST_LEVERS,
  DUST_PER_CELL,
  DUST_TIME_SCALE,
  MOTE_CAP,
  type DustCell,
  dustCells,
  dustParams,
  dustPoints,
  dustStep,
  moteAt,
  thinPoints,
} from "./dust.js";

// THE CENSOR'S DUST, held down without a pixel. The renderer can only hand this module two things
// — a grid of colours read off the glass, and a clock — so everything else about the cloud is
// decided here and is testable here. What is guarded is the LOOK: the owner's four numbers, the
// silhouette the motes are born on, the colour each one inherits, and the fact that a mote's
// position is a function of time rather than of an object that remembers where it was.

const lit = (color: number): DustCell => ({ on: true, color });
const dark: DustCell = { on: false, color: 0 };

describe("dust — the levers", () => {
  it("dust.levers-are-the-owners-numbers — mote 5, churn 25, spread 1, twinkle 1", () => {
    // Chosen on a live stand and carried over verbatim. A number that drifts here is the look
    // drifting, and nothing else in the suite would notice.
    expect(DUST_LEVERS).toEqual({ block: 5, swapsPerSec: 25, jitterAmp: 1, jitterFreq: 1 });
    expect(DUST_FLICKER).toBe(false);
    expect(DUST_TIME_SCALE).toBeCloseTo(1 / 3);
  });

  it("dust.params-carry-the-time-scale — the cloud runs slow wherever it shows", () => {
    const p = dustParams(DUST_LEVERS, DUST_FLICKER);
    expect(p.flicker).toBe(false);
    expect(p.timeScale).toBeCloseTo(DUST_TIME_SCALE);
  });

  it("dust.a-mote-has-a-floor — under a pixel and a half nothing is visible however many there are", () => {
    expect(dustParams({ ...DUST_LEVERS, block: 1 }, false).dot).toBe(1.5);
    expect(dustParams({ ...DUST_LEVERS, block: 5 }, false).dot).toBeCloseTo(4);
  });

  it("dust.more-churn-shorter-life — but never so short the cloud reads as static", () => {
    const slow = dustParams({ ...DUST_LEVERS, swapsPerSec: 0 }, false).life;
    const fast = dustParams({ ...DUST_LEVERS, swapsPerSec: 120 }, false).life;
    expect(fast).toBeLessThan(slow);
    expect(fast).toBeGreaterThanOrEqual(0.35);
  });

  it("dust.the-grid-is-measured-on-the-short-side — a long node gets more cells, not coarser ones", () => {
    expect(dustStep(220, 900)).toBe(10);
    expect(dustStep(900, 220)).toBe(10);
    // Below two pixels a cell costs more than the motes it feeds, and a zero size is not a divide.
    expect(dustStep(10, 10)).toBe(2);
    expect(dustStep(0, 0)).toBe(2);
  });
});

describe("dust — the sampled face", () => {
  it("dust.cells-read-the-true-colour — premultiplied channels are divided back out", () => {
    // A half-transparent edge arrives with its channels already scaled by alpha; left that way,
    // the rim of every rounded node comes out unnaturally dark.
    const cells = dustCells([64, 128, 255, 128], 1);
    expect(cells[0]!.on).toBe(true);
    expect(cells[0]!.color).toBe((128 << 16) | (255 << 8) | 255);
  });

  it("dust.a-see-through-cell-is-off — dust does not sprout past a rounded corner", () => {
    expect(dustCells([255, 255, 255, 40], 1)[0]!.on).toBe(false);
  });

  it("dust.a-cell-lends-its-colour — a mote is the colour of what it was born on", () => {
    expect(dustPoints([lit(0xff0000)], 1, 1, 10, 1)).toEqual([{ x: 0, y: 0, color: 0xff0000 }]);
  });

  it("dust.dark-cells-give-no-points — the cloud follows the silhouette, not the box", () => {
    expect(dustPoints([dark, lit(0x112233), dark, dark], 2, 2, 10, 1)).toEqual([{ x: 5, y: -5, color: 0x112233 }]);
    // And an empty face is an empty cloud, never one stray mote at the origin.
    expect(dustPoints([dark, dark], 2, 1, 10, 1)).toEqual([]);
  });

  it("dust.per-cell-repeats-a-point — density is a multiplier, not a finer grid", () => {
    const points = dustPoints([lit(0x00ff00)], 1, 1, 8, 3);
    expect(points).toHaveLength(3);
    expect(new Set(points.map((p) => `${p.x},${p.y},${p.color}`)).size).toBe(1);
  });

  it("dust.the-cloud-is-centred-on-the-origin — where the node's own contour is", () => {
    const points = dustPoints([lit(1), lit(1), lit(1), lit(1)], 2, 2, 4, 1);
    expect(points.reduce((a, p) => a + p.x, 0)).toBeCloseTo(0);
    expect(points.reduce((a, p) => a + p.y, 0)).toBeCloseTo(0);
  });

  it("dust.a-short-grid-is-skipped — a bad sample is a bad frame, not a dropped scene", () => {
    expect(() => dustPoints([lit(1)], 2, 2, 10, 1)).not.toThrow();
    expect(dustPoints([lit(1)], 2, 2, 10, 1)).toHaveLength(1);
  });

  it("dust.thinning-holds-the-cap — one ornate node cannot cost a scene its frame", () => {
    const many = Array.from({ length: 5000 }, (_, i) => ({ x: i, y: 0, color: i }));
    const thin = thinPoints(many, MOTE_CAP);
    expect(thin).toHaveLength(MOTE_CAP);
    // Every k-th, so the thinned cloud still covers the whole silhouette rather than a corner.
    expect(thin[thin.length - 1]!.x).toBeGreaterThan(many.length * 0.9);
    // Under the cap nothing is dropped.
    expect(thinPoints(many.slice(0, 10), MOTE_CAP)).toHaveLength(10);
  });
});

describe("dust — a mote in flight", () => {
  const params = dustParams(DUST_LEVERS, DUST_FLICKER);
  const cloud = dustPoints(
    Array.from({ length: 16 }, (_, i) => lit(0x100000 + i)),
    4,
    4,
    6,
    DUST_PER_CELL,
  );

  it("dust.a-mote-is-a-function-of-time — the same second twice is the same mote", () => {
    // The kit rebuilds its scene from the plan every frame. A mote that remembered where it was
    // would be reseeded on every rebuild, and the cloud would shiver instead of drift.
    expect(moteAt(cloud, 7, params, 2.5)).toEqual(moteAt(cloud, 7, params, 2.5));
  });

  it("dust.a-mote-is-born-on-the-silhouette — with no drift it never leaves its cell", () => {
    const still = { ...params, drift: 0 };
    const homes = new Set(cloud.map((p) => `${p.x},${p.y}`));
    for (let t = 0; t < 6; t += 0.05) {
      const mote = moteAt(cloud, 3, still, t);
      expect(homes.has(`${mote.x},${mote.y}`)).toBe(true);
    }
  });

  it("dust.a-mote-drifts-outwards — the spread lever is what carries it off its cell", () => {
    const homes = new Set(cloud.map((p) => `${p.x},${p.y}`));
    let away = 0;
    for (let t = 0; t < 6; t += 0.05) {
      const mote = moteAt(cloud, 3, params, t);
      if (!homes.has(`${mote.x},${mote.y}`)) away += 1;
    }
    expect(away).toBeGreaterThan(50);
  });

  it("dust.a-mote-arrives-and-leaves — the arc reaches nothing at both ends and full in the middle", () => {
    let low = 1;
    let high = 0;
    for (let t = 0; t < 20; t += 0.01) {
      const a = moteAt(cloud, 5, params, t).alpha;
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      low = Math.min(low, a);
      high = Math.max(high, a);
    }
    expect(low).toBeLessThan(0.05);
    expect(high).toBeGreaterThan(0.95);
  });

  it("dust.motes-do-not-pulse-in-unison — a field of one lifetime reads as a fault, not as dust", () => {
    const alphas = new Set(Array.from({ length: 40 }, (_, i) => moteAt(cloud, i, params, 1.7).alpha));
    expect(alphas.size).toBeGreaterThan(30);
  });

  it("dust.a-mote-inherits-a-real-colour — never a colour no cell had", () => {
    const colours = new Set(cloud.map((p) => p.color));
    for (let i = 0; i < 40; i += 1) expect(colours.has(moteAt(cloud, i, params, 3.3).color)).toBe(true);
  });

  it("dust.a-broken-clock-dims-the-cloud — it never puts a NaN into a coordinate", () => {
    // A NaN in a Graphics path is a node that never draws again; a frame of still dust is a glitch.
    for (const t of [Number.NaN, Number.POSITIVE_INFINITY, -5]) {
      const mote = moteAt(cloud, 2, params, t);
      expect(Number.isFinite(mote.x)).toBe(true);
      expect(Number.isFinite(mote.y)).toBe(true);
      expect(Number.isFinite(mote.alpha)).toBe(true);
    }
  });

  it("dust.an-empty-cloud-draws-nothing — a node with no face has nothing to grind up", () => {
    expect(moteAt([], 0, params, 1)).toEqual({ x: 0, y: 0, color: 0, alpha: 0 });
  });
});
