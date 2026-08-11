// TILTABLE — the card tap. A node that tilts turns to one of a few DISCRETE stops, not to any
// angle: a card is upright or tapped-sideways, a token stands at 0/120/240. Which stop it is ON
// is runtime state (the index), passed in — the atom only spells the STOPS and how the tap moves
// between them. The chosen angle is written into `Transformable.angle`, so a tilt requires it.
//
// This is the discrete cousin of a free spin (which is just `Transformable.angle` set to anything)
// and the angular twin of `Flippable`: a small serialisable spec plus a pure resolver over a
// runtime index. See CANONS.md §3 (the atom table) and NIGHT-DECISIONS.md.

import { defineAtom } from "../atom.js";
import { fieldsOf, type Node } from "../node.js";

export interface TiltableFields {
  /** The discrete tilt stops, in degrees clockwise. Order is the tap order. */
  readonly stops: readonly number[];
  /** Does advancing past the last stop return to the first, or rest on the last? */
  readonly wrap: boolean;
}

export const Tiltable = defineAtom<TiltableFields>({
  name: "Tiltable",
  requires: ["Transformable"],
  defaults: { stops: [0, 90], wrap: true },
  classes: { stops: "own", wrap: "own" },
});

/** The stops a node tilts through; empty when it has no `Tiltable`. */
export function tiltStops(node: Node): readonly number[] {
  return fieldsOf<TiltableFields>(node, "Tiltable")?.stops ?? [];
}

/**
 * The angle at a stop index. Out-of-range indices clamp into the stop list (a tap can never point
 * a node nowhere). `undefined` only when there is no `Tiltable` or it names no stops at all.
 */
export function tiltAngle(node: Node, index: number): number | undefined {
  const stops = tiltStops(node);
  if (stops.length === 0) return undefined;
  const i = index < 0 ? 0 : index >= stops.length ? stops.length - 1 : index;
  return stops[i];
}

/**
 * The stop index a tap moves to from `index`. Past the last stop it wraps to the first when `wrap`,
 * otherwise it rests on the last. With no `Tiltable` (or a single stop) the index does not move.
 */
export function nextTilt(node: Node, index: number): number {
  const flip = fieldsOf<TiltableFields>(node, "Tiltable");
  const count = flip?.stops.length ?? 0;
  if (count <= 1) return count === 0 ? index : 0;
  const next = index + 1;
  if (next < count) return next;
  return flip!.wrap ? 0 : count - 1;
}
