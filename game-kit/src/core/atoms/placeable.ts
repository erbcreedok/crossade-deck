// PLACEABLE — this element can be SET DOWN into a layout slot: it has a footprint to occupy one.
//
// NO FIELDS, like `Bakeable`: presence declares "can be placed", absence declines it. It requires
// `Bounded` because a slot reserves room for a FOOTPRINT — a thing with no box has no size to seat,
// so the atom would be a control over nothing. Whether a given container will actually take it is a
// separate question, answered by that container's `Acceptor`.

import { defineAtom } from "../atom.js";
import { caps, type Node } from "../node.js";

/** No fields — presence is the whole statement, and it can grow one honestly later. */
export type PlaceableFields = Record<string, never>;

export const Placeable = defineAtom<PlaceableFields>({
  name: "Placeable",
  requires: ["Bounded"],
  defaults: {},
  classes: {},
});

/** Can this node be set down into a slot? Presence of the atom is the answer. */
export function placeable(n: Node): boolean {
  return caps(n).has("Placeable");
}
