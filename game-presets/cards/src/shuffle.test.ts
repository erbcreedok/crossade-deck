import { describe, expect, it } from "vitest";
import { shuffled } from "./shuffle.js";

/** A deterministic rng that walks a fixed list of fractions, then holds the last — pins a shuffle. */
function seq(values: readonly number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)] ?? 0;
}

describe("shuffled", () => {
  it("shuffle.keeps-every-item — a permutation, nothing added, dropped or duplicated", () => {
    const src = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = shuffled(src, seq([0.1, 0.9, 0.4, 0.7, 0.2, 0.5, 0.3]));
    expect(out).toHaveLength(src.length);
    expect([...out].sort((a, b) => a - b)).toEqual(src);
  });

  it("shuffle.does-not-mutate-the-input — the source keeps its order", () => {
    const src = [1, 2, 3, 4];
    const before = [...src];
    shuffled(src, () => 0);
    expect(src).toEqual(before);
  });

  it("shuffle.is-deterministic-under-a-seeded-rng — same rng, same permutation", () => {
    const src = ["a", "b", "c", "d", "e"];
    expect(shuffled(src, seq([0.2, 0.8, 0.1, 0.6]))).toEqual(shuffled(src, seq([0.2, 0.8, 0.1, 0.6])));
    // rng always 0 → each i swaps with index 0: a known, non-identity order.
    expect(shuffled(["a", "b", "c"], () => 0)).toEqual(["b", "c", "a"]);
  });
});
