// TRANSFORMABLE — the node's OWN pose: where it sits and how high it stands.
//
// It lives on a bare `Node`, with no box required, because a node can be somewhere without
// occupying anything — the tabletop itself is such a node.
//
// The two fields are deliberately in DIFFERENT inheritance classes, and that is the whole
// lesson of this atom:
//   `at` is own    — a position is about this node, and inside a container it is the LAYOUT
//                    that resolves it. Nothing is inherited.
//   `z`  adds up   — lift a stack and everything in it rises with it. That is the behaviour
//                    anyone expects from picking up a pack of cards, and it is why `z` cannot
//                    be cancelled by a child: only added to.
//
// The apparent contradiction with "a stack's thickness is layout, not `z`" dissolves once the
// classes are read: a layout writes `at` and is FORBIDDEN to write `z` (enforced by the type
// of a layout record, not merely by a scan). A card inside a resting stack does not rise,
// because thickness is expressed as an `at` offset.

import { defineAtom } from "../atom.js";
import { sumAlongChain, type ResolveContext } from "../resolve.js";
import { type Point } from "./bounded.js";

export interface TransformableFields {
  readonly at: Point;
  readonly z: number;
}

export const Transformable = defineAtom<TransformableFields>({
  name: "Transformable",
  requires: [],
  defaults: { at: { x: 0, y: 0 }, z: 0 },
  classes: { at: "own", z: "addsUp" },
});

/**
 * The height this node ends up at: the sum along the whole chain of owners. Never stored on
 * the node and never sent over the wire — it is read at APPLY time, so a node that changes
 * owner mid-animation gets the new answer rather than a frozen one.
 */
export function resolveZ(ctx: ResolveContext): number {
  return sumAlongChain(ctx, "Transformable", "z");
}
