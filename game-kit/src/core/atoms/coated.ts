// COATED — a RUNTIME layer mixed over the surface, the part `Surfaced` cannot hold.
//
// `Surfaced` names a STATIC record: a style-sheet class every client agrees on, `"plate"` the same
// short word on every wire. That is right and it stays. But a class of thing does not fit "a name →
// a finished record" by construction, because it is PER-INSTANCE and it MOVES:
//   - a magnitude that creeps — a mana shard brightening as it charges, a rune smouldering 0..1, a
//     blueprint filling 0→100%. A registry cannot enumerate a continuum.
//   - a REACH — a poison cloud that greys the hex AND everyone standing on it (cascade), a ward that
//     hugs one door (own), a fog that dims everything EXCEPT the lit corridor (inverse cascade).
//   - a colour there are infinitely many of — each of N runtime teams tinting tiles their own hue.
//   - shared vs private — a bluff mark only its placer sees, terrain paint everyone sees alike.
//
// The doctrine the flip epic reached (see `docs/FLIPPABLE-HANDOFF.md`): the atom holds only DATA —
// a recipe NAME, a number, a colour token. HOW it looks is a recipe in a registry (`render/coats.ts`,
// the mirror of `surfaces.ts`). The engine mixes it in through the EFFECTS LIST, blind. And the
// REACH is not an `if` — it is the field's INHERITANCE CLASS: `self` is `own` (this face only),
// `cast` is `fromOwner` (this node and every child that did not override it). The inverse — "all but
// this subtree" — falls out for free by setting `cast` on the root and clearing it (NO_COAT) on the
// lit subtree, which is exactly what override-of-`fromOwner` means. No new machinery for any of it.

import { defineAtom } from "../atom.js";
import { type Paint } from "../paint.js";

/**
 * One runtime coat: how a per-instance magnitude becomes paint. `recipe` names the entry in
 * `render/coats.ts` that says WHAT it looks like; `level` is the creeping number it reads; `tint`
 * is the colour token (flat or parametric) it paints with. Empty `recipe` is NO coat — the default,
 * and what a node clears an inherited `cast` back to.
 */
export interface Coat {
  /** Recipe name in the coats registry: `darken`, `charge`, `ring`, `fill`, `censor`… "" = none. */
  readonly recipe: string;
  /** 0..1 — the creeping magnitude: charge, smoulder, progress, the strength of a dim. A FIELD. */
  readonly level: number;
  /** Colour TOKEN or parametric `{token, param}` — never a raw hex. "" leaves the recipe its default. */
  readonly tint: Paint;
}

/** No coat at all. The default of both fields, and the value that clears an inherited `cast`. */
export const NO_COAT: Coat = { recipe: "", level: 0, tint: "" };

/** Does this coat draw anything? A recipe has to be named, or there is nothing to look up. */
export function hasCoat(coat: Coat): boolean {
  return coat.recipe !== "";
}

export interface CoatedFields {
  /**
   * The coat on THIS face only. Reach = `own`: a selection ring, a self-dim, a charge badge — it
   * does not fall to the children.
   */
  readonly self: Coat;
  /**
   * The coat on this node AND every descendant that has not overridden it. Reach = `fromOwner`:
   * freeze a tray and the figures on it grey too. A spotlight is this set on the root and cleared
   * (NO_COAT) on the lit subtree — the "all but one" inversion, straight out of override semantics.
   */
  readonly cast: Coat;
}

export const Coated = defineAtom<CoatedFields>({
  name: "Coated",
  // No requirement: a node may carry `Coated` to cast over its children while drawing nothing
  // itself, exactly as a bare container can. The effect skips a node with no area to paint on.
  requires: [],
  defaults: { self: NO_COAT, cast: NO_COAT },
  // THE REACH IS THE CLASS, not a branch. `own` stays on the face; `fromOwner` cascades and can be
  // overridden — the two reaches the cases need, and the third (inverse) for free.
  classes: { self: "own", cast: "fromOwner" },
});
