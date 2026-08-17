// Chance, pinned: a seed is a promise that two machines draw the same number, and this holds it.

import { describe, expect, it } from "vitest";
import { permutation, rollDie, seededRng } from "./rng.js";

describe("rng", () => {
  it("rng.a-seed-repeats-itself — the same seed yields the same sequence, another seed another", () => {
    const a = seededRng(42);
    const b = seededRng(42);
    const c = seededRng(43);
    const runA = Array.from({ length: 8 }, () => a());
    const runB = Array.from({ length: 8 }, () => b());
    const runC = Array.from({ length: 8 }, () => c());
    expect(runA).toEqual(runB);
    expect(runA).not.toEqual(runC);
    for (const v of runA) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("rng.permutation-is-fair — every index exactly once, seeded to a fixed order", () => {
    const p = permutation(10, seededRng(7));
    expect([...p].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(p).toEqual(permutation(10, seededRng(7))); // the same seed, the same order
    expect(p).not.toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]); // and it did actually shuffle
    expect(permutation(0, seededRng(1))).toEqual([]);
    expect(permutation(1, seededRng(1))).toEqual([0]);
  });

  it("rng.a-die-lands-in-range — 1..sides over many throws, and it refuses a nonsense die", () => {
    const rng = seededRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const v = rollDie(6, rng);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6); // every face came up at least once in 400 throws
    expect(() => rollDie(0, rng)).toThrow();
    expect(() => rollDie(2.5, rng)).toThrow();
  });
});
