// TILTABLE — the card tap. A node that tilts turns to one of a few DISCRETE stops, not to any
// angle: a card is upright or tapped-sideways, a token stands at 0/120/240. Which stop it is ON
// is runtime state (the index), passed in — the atom only spells the STOPS and how the tap moves
// between them. The chosen angle is written into `Transformable.angle`, so a tilt requires it.
//
// This is the discrete cousin of a free spin (which is just `Transformable.angle` set to anything)
// and the angular twin of `Flippable`: a small serialisable spec plus a pure resolver over a
// runtime index. See CANONS.md §3 (the atom table) and NIGHT-DECISIONS.md.

import { defineAtom } from "../atom.js";
import { compose, fieldsOf, type Node } from "../node.js";

export interface TiltableFields {
  /** The discrete tilt stops, in degrees clockwise. Order is the tap order. */
  readonly stops: readonly number[];
  /** Does advancing past the last stop return to the first, or rest on the last? */
  readonly wrap: boolean;
  /**
   * WHICH STOP IT IS ON — state, sitting on the same atom as the spec that describes the stops.
   *
   * That is deliberate and it has a precedent: `Flippable.turns` is state on `Flippable`, and the
   * face a die shows is state in `Valued`. The kit already keeps this kind of fact on the node it
   * belongs to, and `Tiltable` was the outlier — its index lived in a runtime and nowhere else,
   * which meant a tilt did not survive a reload and a piece turned by one player stood upright for
   * everybody else.
   *
   * An INDEX, and the risk is named rather than hidden: reorder `stops` and a written tilt points
   * somewhere new. It is a list a spec author writes once, not a pile that shuffles — but that is
   * the reason this is not the pattern for anything that moves.
   */
  readonly stop: number;
}

export const Tiltable = defineAtom<TiltableFields>({
  name: "Tiltable",
  requires: ["Transformable"],
  defaults: { stops: [0, 90], wrap: true, stop: 0 },
  classes: { stops: "own", wrap: "own", stop: "own" },
});

/** The stops a node tilts through; empty when it has no `Tiltable`. */
export function tiltStops(node: Node): readonly number[] {
  return fieldsOf<TiltableFields>(node, "Tiltable")?.stops ?? [];
}

/** The stop this node is standing on right now. Zero when it carries no `Tiltable` at all. */
export function stopOf(node: Node): number {
  return fieldsOf<TiltableFields>(node, "Tiltable")?.stop ?? 0;
}

/**
 * The angle at a stop index — the node's OWN by default, which is the reading almost every caller
 * wants now that the stop lives on the node. Out-of-range indices clamp into the stop list (a tap
 * can never point a node nowhere). `undefined` only when there is no `Tiltable` or it names no
 * stops at all.
 */
export function tiltAngle(node: Node, index: number = stopOf(node)): number | undefined {
  const stops = tiltStops(node);
  if (stops.length === 0) return undefined;
  const i = index < 0 ? 0 : index >= stops.length ? stops.length - 1 : index;
  return stops[i];
}

/**
 * The stop index a tap moves to from `index`. Past the last stop it wraps to the first when `wrap`,
 * otherwise it rests on the last. With no `Tiltable` (or a single stop) the index does not move.
 */
export function nextTilt(node: Node, index: number = stopOf(node)): number {
  const flip = fieldsOf<TiltableFields>(node, "Tiltable");
  const count = flip?.stops.length ?? 0;
  if (count <= 1) return count === 0 ? index : 0;
  const next = index + 1;
  if (next < count) return next;
  return flip!.wrap ? 0 : count - 1;
}

/**
 * TURN IT TO A STOP — the writer paired with `stopOf`, and the twin of `setFacing`.
 *
 * The index is CLAMPED rather than refused: a tap can never point a node nowhere, and the same
 * arithmetic already guards `tiltAngle`. A node with no `Tiltable` has no stops to stand on and is
 * left alone — absence is the refusal here as everywhere.
 */
export function setTilt(node: Node, index: number): void {
  const own = fieldsOf<TiltableFields>(node, "Tiltable");
  if (!own || own.stops.length === 0) return;
  const at = index < 0 ? 0 : index >= own.stops.length ? own.stops.length - 1 : index;
  compose(node, Tiltable({ ...own, stop: at }));
}
