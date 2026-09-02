// FORGIVING — how far a finger may MISS this node and still find it. The touch area is bigger than
// the picture, and the picture does not change: `Bounded` says what is drawn, this says what is
// reachable, and the two are different questions about the same node.
//
// Because a control is aimed at with a fingertip and drawn for an eye. A drag handle is a few
// pixels tall on purpose — a tab that looked like a slab would be a slab — and a fingertip covers
// forty-odd pixels of glass with the finger itself hiding the target on the way down. So the honest
// answer is not to draw it bigger; it is to catch the misses.
//
// IT NEVER STEALS. The pick tries every node exactly as drawn first, and only what would otherwise
// have found NOTHING is offered to the forgiving ones (`pick`). A finger that landed squarely on a
// card gets the card, however forgiving the tab beneath it is.

import { defineAtom } from "../atom.js";
import { fieldsOf, type Node } from "../node.js";

export interface ForgivingFields {
  /**
   * HOW FAR PAST ITS OWN OUTLINE THIS NODE STILL TAKES A FINGER, in the node's own units.
   *
   * Its own units, so a node held at a constant size on the glass (`Screened`) has a slop that is
   * constant on the glass too: the tab and the miss it forgives are drawn from the same ruler, and
   * a control sized for a fingertip stays sized for one at every zoom.
   */
  readonly miss: number;
}

export const Forgiving = defineAtom<ForgivingFields>({
  name: "Forgiving",
  requires: ["Bounded"],
  // Nothing forgiven is the stock answer: every node in the kit is hit exactly as it is drawn, and
  // a node that wants otherwise says so.
  defaults: { miss: 0 },
  classes: { miss: "own" },
});

/** How far a finger may miss this node, or `0` for one that is hit exactly as it is drawn. */
export function missOf(n: Node): number {
  return fieldsOf<ForgivingFields>(n, "Forgiving")?.miss ?? 0;
}
