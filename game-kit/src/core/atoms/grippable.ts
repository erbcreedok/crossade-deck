// GRIPPABLE — whose hands may pick a node up. The permission twin of `Private`: privacy cuts what a
// seat SEES, grip cuts what a seat may MOVE. A hand gripped by "north" makes every card in it north's
// to lift; a piece under no grip is the open table, liftable by anyone.
//
// Like privacy it is a fact of the TREE and cuts a SUBTREE: a gripped container grips its children
// too, so a card cannot be freely grabbed out of someone's hand. `by` lists the seats that MAY grip;
// the default empty list is locked to everyone (a fixed board element), and a hand names its owner.

import { defineAtom } from "../atom.js";
import { chainOf, fieldsOf, type Node } from "../node.js";

export interface GrippableFields {
  /** The seats that may lift this subtree. Empty = locked to all; name one to hand it to that seat. */
  readonly by: readonly string[];
}

export const Grippable = defineAtom<GrippableFields>({
  name: "Grippable",
  requires: [],
  defaults: { by: [] },
  classes: { by: "own" },
});

/**
 * May `seat` lift this node? It is locked when the node OR any owner up the chain is `Grippable`
 * without `seat` in its `by` — the subtree cut. A node under no grip is liftable by anyone (the
 * open table). Mirrors `visibleTo`.
 */
export function grippableBy(node: Node, seat: string): boolean {
  for (const owner of chainOf(node)) {
    const g = fieldsOf<GrippableFields>(owner, "Grippable");
    if (g && !g.by.includes(seat)) return false; // a gripped ancestor without this seat locks here
  }
  return true;
}
