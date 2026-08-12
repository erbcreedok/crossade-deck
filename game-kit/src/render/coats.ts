// THE COATS REGISTRY — what `Coated`'s recipe names point AT, and the one effect that mixes them.
//
// It mirrors `surfaces.ts`: `core` names a recipe, `render` knows what the name is worth. A recipe
// takes a `Coat` (the instance's data — a recipe name, a creeping `level`, a `tint`) and returns a
// RENDER contribution in the record's own vocabulary; the plan folds it over the surface, blind.
//
// THE RECIPES DIFFER BY RENDER SHAPE, NOT BY VALUE OR COLOUR. There is no `darken` beside a `charge`
// beside a `dim`: those are one overlay, `wash`, told apart by the `tint` and `level` handed to it —
// the Axis76 lesson, a changing magnitude is a PARAMETER, not a new record. What earns a separate
// recipe is a different KIND of mark: a fill (`wash`), a stroke (`ring`), a mask (`censor`). A new
// look is a new registration, never a branch anything has to learn.
//
// The REACH — this face, or the whole subtree — is NOT here and a recipe knows nothing of it. It
// rides the atom's inheritance CLASS (`self` own, `cast` fromOwner); this file only paints.

import { fieldsOf } from "../core/node.js";
import { type Coat, type CoatedFields, hasCoat } from "../core/atoms/coated.js";
import { paintable } from "../core/atoms/surfaced.js";
import { ownValue, type ResolveContext } from "../core/resolve.js";
import { IDENTITY } from "../core/transform.js";
import { type Paint } from "../core/paint.js";
import { registerEffect, type Effect, type RuntimeCoat } from "./effects.js";

/** A recipe: instance data in, a render contribution out. It never sees the reach — only the coat. */
export type CoatRecipe = (coat: Coat) => RuntimeCoat;

const COATS = new Map<string, CoatRecipe>();

export function registerCoat(name: string, recipe: CoatRecipe): void {
  COATS.set(name, recipe);
}

/** `undefined` for a name nobody registered — the effect SKIPS it, exactly as a dangling surface. */
export function coatRecipe(name: string): CoatRecipe | undefined {
  return COATS.get(name);
}

export function coatNames(): readonly string[] {
  return [...COATS.keys()];
}

/**
 * 0..1, and SAFE for a number that has no business being one. A `level` is a runtime magnitude —
 * an HP fraction, a timer — and a broken source (a NaN, an Infinity, a negative, a huge) must dim
 * a node, never throw a NaN through the whole matrix. Non-finite is read as nothing (0); a finite
 * value is clamped into range.
 */
function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

/** The tint unless it is the empty default, in which case the recipe's own. Objects pass through. */
function tintOr(tint: Paint, fallback: string): Paint {
  return typeof tint === "string" ? tint || fallback : tint;
}

/**
 * The stock recipes AND the effect that runs them. Called by the consumer, like every other
 * `installStock*` — the catalog is an ordinary consumer. Idempotent: the recipes are a map and the
 * effect registers once, so a second call is harmless.
 */
let effectInstalled = false;

export function installStockCoats(): void {
  // WASH — a flat colour over the whole surface, opacity from `level`. The continuum: a mana shard
  // charging (`tint: accent`), a figure dimming as it loses HP or a frozen tray greying its own
  // children (`tint: stageBg`), a team tile (`tint: {token:"spin", param: hue}`). One recipe, N looks.
  registerCoat("wash", (c) => ({
    layers: [{ paint: tintOr(c.tint, "stageBg"), opacity: clamp01(c.level) }],
  }));
  // RING — a stroke around the contour, its weight from `level`. A selection ring, a ward. It is a
  // STROKE, so it replaces the surface's border while it lasts (one stroke per quad).
  registerCoat("ring", (c) => ({
    stroke: {
      color: tintOr(c.tint, "accent"),
      width: 0.02 + 0.08 * clamp01(c.level),
      opacity: 1,
      alignment: 0.5,
      cap: "round",
      join: "round",
    },
  }));
  // CENSOR — a mask over the surface, and a shader that animates it. The wash guarantees a visible
  // bar with no GPU at all; the `filter` names a mosaic/shimmer the painter builds and clocks when
  // it can (tier 3). A default `level` of 0.7 so a plain `censor` already hides something.
  registerCoat("censor", (c) => ({
    layers: [{ paint: tintOr(c.tint, "sunkBg"), opacity: clamp01(c.level || 0.7) }],
    filter: { name: "mosaic", params: { strength: clamp01(c.level || 0.7) } },
  }));
  // CLEAR — draws nothing, but STOPS the cast cascade at this node: the "all but one" spotlight is a
  // dim cast on the root and a `clear` on the lit subtree. Non-empty recipe, so the nearest-cast
  // walk returns it instead of falling through to the dim above.
  registerCoat("clear", () => ({}));

  if (!effectInstalled) {
    registerEffect(coatEffect);
    effectInstalled = true;
  }
}

/** Test seam — the registry is process-wide, and the effect flag rides with it. */
export function resetCoats(): void {
  COATS.clear();
  effectInstalled = false;
}

/**
 * THE COAT EFFECT — one function in the engine's list, and the engine does not know it by name.
 *
 * It reads the two coats by their REACH: `self` own (this node), `cast` as the nearest NON-EMPTY
 * one up the chain. The empty default is transparent to that walk on purpose — a node may carry
 * `Coated` for its own `self` ring and STILL inherit a tray's freeze; only a recipe explicitly set
 * (a real cast, or `clear`) shadows what is above. The cast is laid down first, the self over it.
 *
 * It never reads `ctx.viewer`: a coat is SHARED state that travels the wire, and the onlooker plane
 * is neither shared nor on the wire (`guard.coat-not-viewer`). Privacy is a projected field the
 * orchestrator omits from other viewers' trees, not a flag read here.
 */
export const coatEffect: Effect = (n, ctx) => {
  // No area to paint on — a bare cascading container — so nothing to coat. It still passes its
  // `cast` DOWN, because a descendant reads the chain, not this node's output.
  if (!paintable(n)) return { node: n, pre: IDENTITY };
  const coats: RuntimeCoat[] = [];
  addCoat(coats, nearestCast(ctx)); // the inherited cast, underneath
  addCoat(coats, ownValue<Coat>(n, "Coated", "self")); // this node's own, on top
  return { node: n, pre: IDENTITY, coats: coats.length ? coats : undefined };
};

function addCoat(out: RuntimeCoat[], coat: Coat | undefined): void {
  if (!coat || !hasCoat(coat)) return;
  const recipe = coatRecipe(coat.recipe);
  if (recipe) out.push(recipe(coat)); // a dangling recipe name is skipped, not thrown
}

/**
 * The nearest cast up the chain whose recipe is actually set. The empty default (`NO_COAT`) is
 * skipped so it never shadows an owner's cast; a set recipe — including `clear` — stops the walk.
 */
function nearestCast(ctx: ResolveContext): Coat | undefined {
  for (let i = ctx.chain.length - 1; i >= 0; i -= 1) {
    const cast = fieldsOf<CoatedFields>(ctx.chain[i]!, "Coated")?.cast;
    if (cast && cast.recipe !== "") return cast;
  }
  return undefined;
}
