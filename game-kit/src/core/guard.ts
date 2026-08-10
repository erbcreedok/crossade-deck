// INPUT GUARDS — one law, applied at every option seam of a layout. A value the type cannot
// forbid at authoring time — a NaN or an Infinity that is still a `number`, an enum member cast
// past its union — is CLAMPED to the documented default rather than carried into the geometry,
// where a poisoned number surfaces as a NaN coordinate and a stray enum as a silently-wrong axis.
//
// On a dev or test build the clamp SHOUTS: a `console.error` naming the field, so the bad value
// is caught while the code or its test is being written, not in a shipped scene. In production
// the same clamp is silent — a player never loses a whole table over one poisoned number.
//
// The TYPE layer is the first guard and catches what it can with no runtime cost: `LayoutAlign`
// and `"row" | "column"` already reject a typo at compile time (the tests must `as`-cast to feed
// garbage past them). These runtime guards are the SECOND layer, for the values that arrive
// dynamically — from JSON, the network, an `as` cast — where the type promise no longer holds.

// `import.meta.env.DEV` is Vite's flag: defined under the Storybook build and under Vitest, absent
// only in a bare Node import of the source — where defaulting to loud is the safer miss.
const env = (import.meta as ImportMeta & { readonly env?: { readonly DEV?: boolean } }).env;
export const isDev = env?.DEV ?? true;

/** A finite number, or `fallback` — shouting on a dev build when it had to substitute. */
export function finite(value: number, fallback: number, field: string): number {
  if (Number.isFinite(value)) return value;
  if (isDev) console.error(`[game-kit] ${field}: expected a finite number, got ${value} — using ${fallback}`);
  return fallback;
}

/** A member of `allowed`, or `fallback` — shouting on a dev build when it had to substitute. */
export function oneOf<T extends string>(value: T, allowed: readonly T[], fallback: T, field: string): T {
  if (allowed.includes(value)) return value;
  if (isDev) console.error(`[game-kit] ${field}: expected one of ${allowed.join(" | ")}, got ${JSON.stringify(value)} — using ${fallback}`);
  return fallback;
}
