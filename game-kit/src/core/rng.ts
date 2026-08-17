// CHANCE — the one place the kit draws a random number, and the reason it is SEEDABLE. A shuffle,
// a die, a draw from a bag: on a shared desk every client has to arrive at the SAME answer, and a
// seed is how two machines agree without one of them being told the result. `Math.random` is the
// consumer's choice for a solo game, never a default hidden in here — the source of chance is a
// PARAMETER everywhere below, so a test pins a permutation and a server dictates a face by handing
// in a function that returns what it wants.

/** A source of chance: `[0, 1)` per call, like `Math.random`. */
export type Rng = () => number;

/**
 * A small, fast, well-distributed generator (mulberry32) seeded from one 32-bit integer. The same
 * seed yields the same sequence on every machine — which is the whole point of having one.
 */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A fair permutation of `0..n-1` — Fisher–Yates over the indices. This is a shuffle's TRUTH: hand
 * it to `reorder` and the children stand in that order; the choreography that plays it is a
 * separate matter and never sees the rng.
 */
export function permutation(n: number, rng: Rng): number[] {
  const out = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** One throw of a `sides`-sided die: an integer in `1..sides`. */
export function rollDie(sides: number, rng: Rng): number {
  if (!Number.isInteger(sides) || sides < 1) throw new Error(`rollDie: a die has a whole number of sides, not ${sides}`);
  return 1 + Math.floor(rng() * sides);
}
