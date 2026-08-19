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
import { DUST_LEVERS } from "./dust.js";
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
  // FILL — the blueprint completing: a SOLID coat over `level` of the face, bottom-up, cut off
  // where the level stops. A different KIND of mark from `wash` — a half-built thing is half
  // DRAWN, not half faded — which is exactly what earns it a recipe of its own.
  registerCoat("fill", (c) => ({
    layers: [{ paint: tintOr(c.tint, "accent"), part: clamp01(c.level) }],
  }));
  // CENSOR — the hidden face GROUND UP. Not a bar over it and not a blur of it: a cloud of motes
  // born on the node's own silhouette, each one carrying the colour of the spot it came from,
  // drifting off and being replaced. A hidden card therefore still reads as THAT card, smeared,
  // which is the whole difference between a censor and a grey rectangle.
  //
  // It is an OVERLAY, not a `filter`, and not a wash either. A wash would have to sit on the
  // surface the motes read their colours off, so the cloud would come out the colour of the bar
  // rather than of the face — the censor would look identical over every node in the game. And it
  // needs no GPU at all: the motes are plain drawn squares, so there is no shader tier to fall
  // back from.
  //
  // `level` is how thick the cloud is drawn, defaulting to 0.7 so a plain `censor` already hides
  // something. The four LEVERS ride along as numbers, so the owner's chosen look is data the plan
  // carries and a unit test can read, rather than a constant buried where jsdom cannot reach.
  // `tint` is not read: the motes' colour IS the face, and tinting them would be a lie about
  // what is under there.
  registerCoat("censor", (c) => ({
    overlay: { name: "dust", params: { level: clamp01(c.level || 0.7), ...DUST_LEVERS } },
  }));
  // CLEAR — draws nothing, but STOPS the cast cascade at this node: the "all but one" spotlight is a
  // dim cast on the root and a `clear` on the lit subtree. Non-empty recipe, so the nearest-cast
  // walk returns it instead of falling through to the dim above.
  registerCoat("clear", () => ({}));

  // ---- THE MODIFIERS — what a thing is MADE OF, over what it is a picture of ------------------
  //
  // Balatro's editions, and the reason they belong here rather than in the card preset: a coat
  // knows nothing about cards. Every one of these lands on ANY node that has a surface — a die, a
  // tile, a button, a panel, a token — because that is what a coat is. The card preset gets them
  // for free by not being asked.
  //
  // `level` is HOW MUCH of the treatment, 0…1, so a game can fade one in as a reward lands rather
  // than switching it on. The default is strong enough to see without a level at all.

  // FOIL — a cold streak sliding down the diagonal, and the SLIDE is the edition: a laminated
  // sheet is dull until the light moves on it. That is a shader, named here and built in
  // `render/pixi.ts`, clocked by the same shared ticker the censor's blur rides.
  //
  // What stays flat is only what survives without a GPU: a pale film and the bright hairline round
  // the edge. A rim is a STROKE and belongs to the contour, so a shader could not own it anyway.
  registerCoat("foil", (c) => {
    const k = clamp01(c.level || 0.7);
    return {
      layers: [{ paint: tintOr(c.tint, "text"), opacity: 0.08 * k }],
      filter: { name: "foil", params: { strength: 0.85 * k } },
      stroke: { color: tintOr(c.tint, "text"), width: 0.02, opacity: 0.5 * k, alignment: 0.5 },
    };
  });

  // POLYCHROME — one hue, a little different at every point of the face and at every moment. That
  // drift IS iridescence, and there is no honest flat stand-in for it: cut into `part` slices it
  // reads as a flag, not as oil on water. So the recipe NAMES the shader and hands it a place on
  // the wheel; `tint: {token:"spin", param}` is where that place comes from, the same number the
  // painter would have resolved into a colour.
  //
  // The one flat film left behind is the fallback, not the look — what a backend whose program did
  // not build still shows, which is a tinted surface rather than a bare one.
  registerCoat("polychrome", (c) => {
    const k = clamp01(c.level || 0.7);
    const turn = typeof c.tint === "object" ? c.tint.param : 0;
    return {
      layers: [{ paint: { token: "spin", param: turn }, opacity: 0.14 * k }],
      filter: { name: "polychrome", params: { strength: 0.9 * k, hue: turn } },
      stroke: { color: { token: "spin", param: turn + 0.12 }, width: 0.025, opacity: 0.6 * k, alignment: 0.5 },
    };
  });

  // GLASS — see-through and blurred. The blur is the shader the censor already clocks; what makes
  // it glass rather than a censor is that it BARELY tints and keeps a bright rim, so what is under
  // it stays readable.
  registerCoat("glass", (c) => {
    const k = clamp01(c.level || 0.6);
    return {
      layers: [
        { paint: tintOr(c.tint, "panelBg"), opacity: 0.22 * k },
        { paint: tintOr(c.tint, "text"), opacity: 0.08 * k, part: 0.5 },
      ],
      filter: { name: "blur", params: { strength: 0.25 * k } },
      stroke: { color: tintOr(c.tint, "text"), width: 0.018, opacity: 0.45 * k, alignment: 0.5 },
    };
  });

  // FROST — glass without the rim: the soft pane a dialog puts over the table behind it. Its own
  // recipe rather than a `glass` with a flag, because a flag would be a sort for a reader to guess.
  registerCoat("frost", (c) => {
    const k = clamp01(c.level || 0.6);
    return {
      layers: [{ paint: tintOr(c.tint, "stageBg"), opacity: 0.45 * k }],
      filter: { name: "blur", params: { strength: 0.5 * k } },
    };
  });

  // FADED — the thing is barely there. Not a wash toward a colour but toward the DESK, which is
  // what "transparent" means to an onlooker; a coat cannot make the surface under it see-through,
  // and pretending otherwise would be a name that lies.
  registerCoat("faded", (c) => ({
    layers: [{ paint: tintOr(c.tint, "stageBg"), opacity: clamp01(c.level || 0.6) }],
  }));

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
