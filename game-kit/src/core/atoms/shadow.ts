// SHADOWCASTER — this element lays a shadow on the desk. The atom carries ONE choice: which
// contour falls. A knight STANDS on a rectangle (the layout's business, `Bounded`) but its shadow
// is the knight — so the shape of the shadow is declared per node (`from`), never derived from the
// size. The shadow itself is NOT a node: it is a layer the scene plan draws in one pass, under
// everything that rests (`docs/design/camera.md`).
//
// Cast-ness is DERIVED, not toggled: a resting stack is one caster — the nearest casting owner
// speaks for its whole subtree — and a child detached from it starts casting the moment it stands
// alone. Reparenting IS the switch, so there is no flag to forget to flip.

import { defineAtom } from "../atom.js";
import { caps, fieldsOf, type Node } from "../node.js";
import { type Shape } from "./bounded.js";
import { screened } from "./screened.js";

export interface ShadowCasterFields {
  /** Which contour falls on the desk: the box's `footprint`, or the drawn `silhouette`. */
  readonly from: "footprint" | "silhouette";
  /**
   * THE CONTOUR THIS LAYS ON THE DESK when its own would be a lie. Absent — the ordinary answer —
   * and the shadow is the node's own shape, which is right for everything that IS its own shape.
   *
   * It is not right for a piece whose picture is a DRAWING inside a box. A knight is a knight-shaped
   * hole in a square, and the square is what falls: a rectangle a size the eye cannot match to
   * anything, sitting under a figure it plainly does not belong to. The honest silhouette can only
   * be TAKEN from the drawing itself, and nothing here can read a picture's alpha — the merged pass
   * masks with contours, so a snapshot goes in as a rectangle and a frame is what you see.
   *
   * SO SAY SOMETHING THAT DOES NOT LIE. A standing figure gets a spot at its base: it depicts
   * nothing, and a thing that depicts nothing cannot depict the wrong thing. What it must NOT be is
   * a hand-drawn outline "of a figure in general" — that is a forgery, and it gives the knight the
   * pawn's shadow the first time a second kind of figure arrives.
   */
  readonly spot: Shape | undefined;
  /**
   * THE DRAWING THAT FALLS, when the caster HAS one: an asset name, the picture of this piece
   * filled with shadow and nothing else. Laid over the node's own box at the shadow's darkness, so
   * what is on the desk is the knight's shape under the knight — the honest silhouette, taken from
   * the drawing itself and not read off its alpha, by whoever drew the piece and can draw it again.
   * Absent for everything that IS its own shape, and for a drawing nobody made a shadow of.
   */
  readonly picture: string | undefined;
}

export const ShadowCaster = defineAtom<ShadowCasterFields>({
  name: "ShadowCaster",
  requires: ["Bounded"],
  defaults: { from: "silhouette", spot: undefined, picture: undefined }, // the shadow of a drawn piece IS its silhouette
  classes: { from: "own", spot: "own", picture: "own" },
});

/** The contour this node lays down instead of its own, when it says one. */
export function shadowSpot(n: Node): Shape | undefined {
  return fieldsOf<ShadowCasterFields>(n, "ShadowCaster")?.spot;
}

/** The drawing this node lays down as its shadow, when it names one. */
export function shadowPicture(n: Node): string | undefined {
  return fieldsOf<ShadowCasterFields>(n, "ShadowCaster")?.picture;
}

/** The declared contour choice, or `undefined` when the node casts nothing at all. */
export function shadowFrom(n: Node): "footprint" | "silhouette" | undefined {
  return fieldsOf<ShadowCasterFields>(n, "ShadowCaster")?.from;
}

/**
 * Does THIS node lay a shadow? It does when it carries the atom and no owner casts for it: the
 * stack's shadow is the stack's, and fifty-two per-card shadows under a squared deck would be
 * one shadow drawn fifty-two times.
 *
 * A CONTROL NEVER CASTS ONE, whatever it carries — an avatar's disc, a seat's own ring, a cursor
 * are held at their size on the GLASS (`Screened`), not lying on the felt, so there is no height
 * above the desk for a shadow to say. The same atom already keeps a control out of a drag's
 * contour (`isControl` in `liveTable.ts`) and off a touch mark (`markQuads.ts`); a shadow is a
 * third question about the same fact and reads it off the same place.
 */
export function castsShadow(n: Node): boolean {
  if (!caps(n).has("ShadowCaster")) return false;
  if (screened(n)) return false;
  for (let up = n.parent; up; up = up.parent) if (caps(up).has("ShadowCaster")) return false;
  return true;
}
