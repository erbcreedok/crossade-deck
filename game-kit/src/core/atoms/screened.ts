// SCREENED — this node keeps the size it has ON THE GLASS, whatever the view is doing.
//
// Everything on a desk is measured in units, and that is right for everything that is ON the desk:
// zoom in and a card gets bigger, because a card is a thing lying there. A CONTROL is not a thing
// lying there. A drag handle, a resize corner, a selection ring — every application that has ever
// drawn one draws it at the same number of pixels at every zoom, because it is sized for the
// FINGER, and a finger does not get bigger when the picture does. A handle that scaled with the
// view would be unusable at one end of the zoom and cover the whole picture at the other.
//
// It is a size and not a place: the node still sits where its pose puts it, and it still travels
// with the desk it belongs to. Only its scale is taken back, about its own origin, so it neither
// walks across the glass nor drifts off the thing it is a handle for.
//
// `own`, not `fromOwner`: a control inside a scaled tray is still a control, and a tray that made
// everything in it screen-sized would have said something about its contents it has no business
// saying. Each node that is one says so.

import { defineAtom } from "../atom.js";
import { caps, type Node } from "../node.js";

export interface ScreenedFields {
  /** Keep the drawn size the view would have at zoom 1. `false` turns the atom into a no-op. */
  readonly screened: boolean;
  /**
   * THE LEAST AND MOST OF THE VIEW'S OWN SCALE THIS NODE WILL TAKE, as a factor of the size it has
   * at zoom 1. `1` and `1` — the default — is a control that never changes size at all.
   *
   * Bounds, because "never changes size" is only right in the middle. Pushed far enough out, a
   * handle that held its pixels while the desk shrank away under it ends up dwarfing the very thing
   * it is a handle for; pulled far enough in, it becomes a speck on a picture of one card. So the
   * node is allowed to follow the view a little, between a floor and a ceiling: it stops shrinking
   * before it is too small to hit, and stops growing before it covers what it is attached to.
   */
  readonly min: number;
  readonly max: number;
}

export const Screened = defineAtom<ScreenedFields>({
  name: "Screened",
  requires: [],
  defaults: { screened: true, min: 1, max: 1 },
  classes: { screened: "own", min: "own", max: "own" },
});

/** The factor of its zoom-1 size this node may be drawn at, given what the view is doing. */
export function screenScale(fields: ScreenedFields | undefined, viewOverUnit: number): number {
  if (!fields || !fields.screened) return viewOverUnit;
  const lo = Math.min(fields.min, fields.max);
  const hi = Math.max(fields.min, fields.max);
  return Math.min(hi, Math.max(lo, viewOverUnit));
}

/** Does this node hold its size on the glass? Presence of the atom is the answer. */
export function screened(n: Node): boolean {
  return caps(n).has("Screened");
}
