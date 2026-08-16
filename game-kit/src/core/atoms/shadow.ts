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

export interface ShadowCasterFields {
  /** Which contour falls on the desk: the box's `footprint`, or the drawn `silhouette`. */
  readonly from: "footprint" | "silhouette";
}

export const ShadowCaster = defineAtom<ShadowCasterFields>({
  name: "ShadowCaster",
  requires: ["Bounded"],
  defaults: { from: "silhouette" }, // the shadow of a drawn piece IS its silhouette
  classes: { from: "own" },
});

/** The declared contour choice, or `undefined` when the node casts nothing at all. */
export function shadowFrom(n: Node): "footprint" | "silhouette" | undefined {
  return fieldsOf<ShadowCasterFields>(n, "ShadowCaster")?.from;
}

/**
 * Does THIS node lay a shadow? It does when it carries the atom and no owner casts for it: the
 * stack's shadow is the stack's, and fifty-two per-card shadows under a squared deck would be
 * one shadow drawn fifty-two times.
 */
export function castsShadow(n: Node): boolean {
  if (!caps(n).has("ShadowCaster")) return false;
  for (let up = n.parent; up; up = up.parent) if (caps(up).has("ShadowCaster")) return false;
  return true;
}
