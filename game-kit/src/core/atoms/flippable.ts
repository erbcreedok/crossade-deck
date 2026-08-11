// FLIPPABLE — the card turn. Which SURFACE shows when the element is turned over is a pure question
// of DATA: face-up is the node's `Surfaced.surface`; face-down is `back`. That is the whole atom.
//
// One field, because the earlier four-way `reverse` was three values pretending to be distinct:
// «a separate back» and «a per-card second face» render identically, «mirror» named a reflection no
// painter here can draw, and «same» is just an empty back. What remains is the one thing that
// changes a pixel — the down-side surface. Empty `back` shows the front, so a token identical both
// sides needs no back and a half-configured card never turns up blank.
//
// Which SIDE is up is runtime state, not spec — it is passed to `shownSurface`, never stored here.
// Requires `Surfaced`: no face, nothing to turn. See CANONS.md §3 and NIGHT-DECISIONS.md.

import { defineAtom } from "../atom.js";
import { fieldsOf, type Node } from "../node.js";
import { type SurfacedFields } from "./surfaced.js";

export interface FlippableFields {
  /** The surface shown face-down. Empty falls back to the front — same both sides, and never blank. */
  readonly back: string;
}

export const Flippable = defineAtom<FlippableFields>({
  name: "Flippable",
  requires: ["Surfaced"],
  defaults: { back: "" },
  classes: { back: "own" },
});

/**
 * The surface shown for a given up/down state: the front face-up, the `back` (or the front, when no
 * back is named) face-down. `undefined` when the node has no `Surfaced` at all — there is no face to
 * show. A node with a face but no `Flippable` shows its front either way (nothing to turn).
 */
export function shownSurface(node: Node, faceUp: boolean): string | undefined {
  const surf = fieldsOf<SurfacedFields>(node, "Surfaced");
  if (!surf) return undefined;
  if (faceUp) return surf.surface;
  const flip = fieldsOf<FlippableFields>(node, "Flippable");
  return flip?.back || surf.surface;
}
