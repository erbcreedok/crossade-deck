// FOCUSABLE — this element can take input focus (keyboard, a highlighted selection). NO FIELDS,
// like `Bakeable` and `Placeable`: presence declares it, absence declines. Requires `Bounded`,
// because focus lands on something with a footprint to outline and to hit-test.

import { defineAtom } from "../atom.js";
import { caps, type Node } from "../node.js";

/** No fields — presence is the whole statement, and it can grow one honestly later. */
export type FocusableFields = Record<string, never>;

export const Focusable = defineAtom<FocusableFields>({
  name: "Focusable",
  requires: ["Bounded"],
  defaults: {},
  classes: {},
});

/** Can this node take focus? Presence of the atom is the answer. */
export function focusable(n: Node): boolean {
  return caps(n).has("Focusable");
}
