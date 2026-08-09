// SURFACED — the atom that draws. Everything else in the model exists; this is what is seen.
//
// Its requirement is the reason requirements may be ALTERNATIVES at all. A surface needs an
// AREA, and an area has two sources: an own box (`Bounded`) or the extent of the content
// (`Container`). Demanding `Bounded` would outlaw the desk, which has something to paint
// and no footprint of its own.
//
// `surface` is a REGISTRY REFERENCE, not a bag of colours on the node. Re-register the record
// without its stroke and the border is gone from every card at once while the box stays
// exactly where it was — that is the lesson, and inline fields cannot demonstrate it. It also
// keeps the wire honest: `"plate"` is the same short string on every client, whereas a palette
// copied into each message is state two clients may legitimately disagree about.
//
// ONE FIELD, ON PURPOSE. `fit` and `align` used to live here — how a picture meets the area it
// is given. They were declared before the record had layers or pictures at all, so nothing
// ever read them: two controls a reader could move with no effect on anything. Their home is
// the LAYER, where a picture and an area actually meet, and they come back with the picture.
// A node-level copy would be a second place saying one thing, and an inherited one at that:
// "why is this card's face cropped" would be answered by a zone three levels up.

import { defineAtom } from "../atom.js";
import { caps, fieldsOf, type Node } from "../node.js";
import { extentOf, footprint } from "./bounded.js";
import { contentExtent } from "./container.js";

export interface SurfacedFields {
  readonly surface: string;
}

export const Surfaced = defineAtom<SurfacedFields>({
  name: "Surfaced",
  requires: [["Bounded", "Container"]],
  defaults: { surface: "plate" },
  classes: { surface: "own" },
});

/**
 * The area a surface is painted onto, in units — an own box first, the content's extent
 * otherwise. `undefined` means there is nothing to paint on, which is a legal state: a node
 * may carry `Surfaced` and be starved of it, and then it is not drawn at all.
 */
export function areaOf(n: Node): { readonly w: number; readonly h: number } | undefined {
  const own = footprint(n);
  if (own) return extentOf(own);
  return caps(n).has("Container") ? contentExtent(n) : undefined;
}

/** Is this node meant to be drawn? Present atom, and an area to draw it on. */
export function paintable(n: Node): boolean {
  return caps(n).has("Surfaced") && fieldsOf<SurfacedFields>(n, "Surfaced") !== undefined && areaOf(n) !== undefined;
}
