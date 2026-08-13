// SHUFFLE — a fair Fisher–Yates over any list, returning a NEW array (the source is left as it was).
// Drawing a deck, a bag of tiles, a turn order: shuffling is tabletop-common, not one game's, so it
// lives with the cards rather than inside Solitaire. The rng is a PARAMETER defaulting to Math.random,
// so a game gets randomness for free and a test can seed it and pin the permutation.

export function shuffled<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}
