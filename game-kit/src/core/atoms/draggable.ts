// DRAGGABLE — this element can be picked up and moved by a pointer. The atom carries the DATA of a
// drag (where it goes when a drop is refused); the pointer runtime that plays it lives in the host.
//
// `onReject` is the one policy the model needs: when the target says no, does the element fly HOME
// to where it started, or STAY where the finger let go? A trail (the ghost it leaves) is deliberately
// NOT a field yet — it returns with the mechanism that draws one. Requires `Bounded`: a drag needs a
// footprint to hit-test and to carry.

import { defineAtom } from "../atom.js";
import { caps, fieldsOf, type Node } from "../node.js";

export interface DraggableFields {
  /** Where the element ends up when a drop is refused: back HOME, or STAY where released. */
  readonly onReject: "home" | "stay";
}

export const Draggable = defineAtom<DraggableFields>({
  name: "Draggable",
  requires: ["Bounded"],
  defaults: { onReject: "home" }, // the safe default: a refused card returns rather than stranding
  classes: { onReject: "own" },
});

/** Can this node be dragged? Presence of the atom is the answer. */
export function draggable(n: Node): boolean {
  return caps(n).has("Draggable");
}

/** What a refused drop does to this element — `undefined` when it is not draggable at all. */
export function onRejectOf(n: Node): "home" | "stay" | undefined {
  return fieldsOf<DraggableFields>(n, "Draggable")?.onReject;
}
