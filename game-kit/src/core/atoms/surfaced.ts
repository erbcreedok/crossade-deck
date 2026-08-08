// SURFACED — the atom that draws. Everything else in the model exists; this is what is seen.
//
// Its requirement is the reason requirements may be ALTERNATIVES at all. A surface needs an
// AREA, and an area has two sources: an own box (`Bounded`) or the extent of the content
// (`Container`). Demanding `Bounded` would outlaw the tabletop, which has something to paint
// and no footprint of its own.
//
// `surface` is a REGISTRY REFERENCE, not a bag of colours on the node. Re-register the record
// without a border and the border is gone from every card at once while the box stays exactly
// where it was — that is the lesson, and inline fields cannot demonstrate it. It also keeps
// the wire honest: `"plate"` is the same short string on every client, whereas a palette
// copied into each message is state two clients may legitimately disagree about.

import { defineAtom } from "../atom.js";
import { caps, fieldsOf, type Node } from "../node.js";
import { nearestAlongChain, type ResolveContext } from "../resolve.js";
import { extentOf, footprint } from "./bounded.js";
import { contentExtent } from "./container.js";

/** How the record's picture meets the area it is given. */
export type Fit = "contain" | "cover" | "repeat" | "original" | "fitX" | "fitY";

export type Align =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight";

export interface SurfacedFields {
  readonly surface: string;
  /**
   * `fit` and `align` come FROM THE OWNER, so they are `undefined` by default rather than
   * pre-filled with "contain": a field carrying the default on every node is a field that is
   * always set, and nothing would ever be inherited. The fallback is applied at resolve time.
   */
  readonly fit: Fit | undefined;
  readonly align: Align | undefined;
}

export const Surfaced = defineAtom<SurfacedFields>({
  name: "Surfaced",
  requires: [["Bounded", "Container"]],
  defaults: { surface: "plate", fit: undefined, align: undefined },
  classes: { surface: "own", fit: "fromOwner", align: "fromOwner" },
});

export const DEFAULT_FIT: Fit = "contain";
export const DEFAULT_ALIGN: Align = "center";

export function resolveFit(ctx: ResolveContext): Fit {
  return nearestAlongChain<Fit>(ctx, "Surfaced", "fit") ?? DEFAULT_FIT;
}

export function resolveAlign(ctx: ResolveContext): Align {
  return nearestAlongChain<Align>(ctx, "Surfaced", "align") ?? DEFAULT_ALIGN;
}

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
