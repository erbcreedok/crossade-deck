// REACHING — how far past its own edge a node still counts as being AT something.
//
// A box says where a thing IS. It says nothing about the space around it, and a desk is full of
// rules about that space: two chips beside each other are one pot, a card let go of near a zone
// belongs to the zone, a piece a hair from another is touching as far as any player is concerned.
// Every one of those is the same question — how far out does this thing reach — and every game that
// has ever needed it has answered it with a number buried in a rule somewhere.
//
// So it is a field, on the node, in units, measured OUT FROM THE OUTLINE and not from the centre: a
// reach from the centre would be a different distance at every edge of anything that is not a
// circle, which is not what "near" means to anybody.
//
// It is deliberately not part of `Heaping`. Which pile a piece belongs to and how far it reaches are
// two questions, and the second has answers on things that belong to no pile at all — a zone is the
// case that proves it: a zone reaches for cards and is not itself a card.
//
// `own`, never inherited: a tray does not lend its pull to the cards inside it.

import { defineAtom } from "../atom.js";
import { fieldsOf, type Node } from "../node.js";

export interface ReachingFields {
  /**
   * How far out, root units, from the node's own outline. `0` — the default — is a node that reaches
   * nowhere: it counts only where it actually is, which is what every node meant before this existed.
   */
  readonly reach: number;
}

export const Reaching = defineAtom<ReachingFields>({
  name: "Reaching",
  requires: ["Bounded"], // a reach is measured out from an outline, so there has to be one
  defaults: { reach: 0 },
  classes: { reach: "own" },
});

/** How far this node reaches past its own edge, root units — `0` for one that reaches nowhere. */
export function reachOf(n: Node): number {
  return fieldsOf<ReachingFields>(n, "Reaching")?.reach ?? 0;
}
