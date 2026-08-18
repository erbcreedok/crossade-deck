// TRANSFORMABLE — the node's OWN pose: where it sits and how high it stands.
//
// It lives on a bare `Node`, with no box required, because a node can be somewhere without
// occupying anything — the desk itself is such a node.
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
import { fieldsOf } from "../node.js";
import { sumAlongChain, type ResolveContext } from "../resolve.js";
import { orientationOf } from "./oriented.js";
import { type Point } from "./bounded.js";

export interface TransformableFields {
  readonly at: Point;
  readonly z: number;
  /**
   * Turn, in degrees, clockwise on screen. `addsUp` for the same reason `z` does: turn a hand
   * and everything in it turns with it, and a child cannot un-turn its owner.
   *
   * Only around Z. An out-of-plane flip has no state — it has a resulting FACE, and which face
   * is showing is a different field on a different atom. A rotation you can be halfway through
   * is an animation, not something a node stores.
   */
  readonly angle: number;
  /**
   * Size, as a multiplier. It MULTIPLIES along the chain — a half-size hand holding a half-size
   * card shows it at a quarter, and no sum says that.
   *
   * One number, not two. A non-uniform scale is the only transform that destroys a shape's
   * geometry: a circle becomes an ellipse, and a collider stops being answerable cheaply. Turn
   * and uniform scale leave every shape what it was. Squashing belongs to the picture — a
   * surface layer — where nothing has to bounce off the result.
   */
  readonly scale: number;
}

export const Transformable = defineAtom<TransformableFields>({
  name: "Transformable",
  requires: [],
  defaults: { at: { x: 0, y: 0 }, z: 0, angle: 0, scale: 1 },
  classes: { at: "own", z: "addsUp", angle: "addsUp", scale: "multiplies" },
});

/**
 * The height this node ends up at: the sum along the whole chain of owners. Never stored on
 * the node and never sent over the wire — it is read at APPLY time, so a node that changes
 * owner mid-animation gets the new answer rather than a frozen one.
 */
export function resolveZ(ctx: ResolveContext): number {
  return sumAlongChain(ctx, "Transformable", "z");
}

/**
 * The turn this node ends up at — THE one place the formula lives, so no call site improvises.
 *
 *     world  (default): own + Σ(the owners' angles) — the chain, exactly as `z` sums
 *     viewer (billboard): own − the camera's rotation; the owners' turn is not added at all
 *
 * There is no camera yet, so the viewer branch is the node's own angle: the chain is severed and
 * nothing is subtracted. When a camera lands, its rotation is the only term that joins this line.
 *
 * It takes the context alone, like `resolveZ`, because the node IS the chain's last link — passing
 * both would let the two disagree.
 */
export function resolveAngle(ctx: ResolveContext): number {
  const own = fieldsOf<TransformableFields>(ctx.chain[ctx.chain.length - 1]!, "Transformable")?.angle ?? 0;
  return orientationOf(ctx) === "viewer" ? own : sumAlongChain(ctx, "Transformable", "angle");
}
