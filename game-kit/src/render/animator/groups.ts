// WHAT A SHUFFLE IS HANDED ABOUT THE PACK IT IS SHUFFLING — where the pack stands, how big it is,
// and what is visible around it. Apart from both the runtime and the recipes: the recipes are pure
// and must stay so, and the runtime has no business knowing how a packet is measured.

import { apply, type Transform, type Vec } from "../../core/transform.js";
import { type ShuffleBox, type ShuffleContext } from "../shuffles.js";

export /** The centre and extent of a group of rest poses' origins — what a shuffle recipe is told about the seats. */
function groupContext(rests: readonly (Transform | undefined)[], glass: ShuffleBox): ShuffleContext {
  const seats = rests.map((r) => (r ? apply(r, { x: 0, y: 0 }) : undefined));
  const known = seats.filter((s): s is Vec => !!s);
  if (known.length === 0) return { centre: { x: 0, y: 0 }, spread: { w: 0, h: 0 }, seats: [], glass };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const o of known) {
    x0 = Math.min(x0, o.x); y0 = Math.min(y0, o.y); x1 = Math.max(x1, o.x); y1 = Math.max(y1, o.y);
  }
  // A seat per CHILD, index for index — a recipe reads `seats[i]` for the piece it was handed, so
  // a node whose rest could not be read holds its place with the group's middle rather than
  // shortening the list and sliding every seat after it onto the wrong piece.
  const centre = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
  return { centre, spread: { w: x1 - x0, h: y1 - y0 }, seats: seats.map((s) => s ?? centre), glass };
}
