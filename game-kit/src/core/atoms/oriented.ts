// ORIENTED — whose axes a node's turn is measured against.
//
// `world` (the default) is the ordinary case: the node is turned relative to the DESK, so a desk
// sat under 45° shows its cards under 45°, and an owner's turn reaches every child through the
// chain exactly as `z` does.
//
// `viewer` is the billboard, and it is a TERMINATOR rather than another term: a node framed to the
// onlooker is indifferent to how the desk and its owners are turned, so it does not inherit the
// accumulated turn AT ALL. Captions, counters and a context menu on a turned slot live this way.
//
// Partial inheritance was the rejected middle: it would produce a turn nobody ordered — "straight
// relative to a turned slot" is already expressible as an own angle of 0, and needs no field.
//
// The field is `fromOwner`: the nearest set value up the chain wins, so a tray can frame everything
// it holds to the onlooker and one badge inside it can still opt back out.

import { defineAtom } from "../atom.js";
import { nearestAlongChain, type ResolveContext } from "../resolve.js";
import { type Frame } from "./lit.js";

export interface OrientedFields {
  /** Whose axes this node's turn is measured in. Absent anywhere up the chain means `world`. */
  readonly orientation: Frame;
}

export const Oriented = defineAtom<OrientedFields>({
  name: "Oriented",
  requires: [],
  defaults: { orientation: "world" },
  classes: { orientation: "fromOwner" },
});

/** The frame in force for this node: the nearest one set up the chain, `world` when nobody spoke. */
export function orientationOf(ctx: ResolveContext): Frame {
  return nearestAlongChain<Frame>(ctx, "Oriented", "orientation") ?? "world";
}
