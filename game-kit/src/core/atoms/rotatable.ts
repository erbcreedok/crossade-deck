// ROTATABLE — this element may be TURNED by hand, to any angle, and the atom says where the angle
// lands when the fingers let go. The same bargain `Draggable` strikes: the atom is DATA, and the
// pointer work that plays it belongs to whoever owns the fingers.
//
// The three answers are the three a table actually needs. A tile that must line up with a grid
// SNAPS; a card that is only ever upright or sideways goes HOME; a scrap of paper, a pawn placed at
// a jaunty angle, a token a player turned to mean something — those KEEP what the hand did.
//
// It is not `Tiltable`, and the difference is not a matter of degree. `Tiltable` is a TAP moving
// between a few declared stops: the state is which stop, and there is no angle in between. This is
// a continuous angle a hand chose. A node may sensibly have both, and they never argue: the tap
// walks the stops, the fingers set anything, and both write the same `Transformable.angle`.

import { defineAtom } from "../atom.js";
import { caps, fieldsOf, type Node } from "../node.js";

/** Where a released angle lands. */
export type OnRelease = "keep" | "home" | "snap";

export interface RotatableFields {
  /**
   * KEEP the angle the fingers left, fly HOME to where it stood before they touched it, or SNAP to
   * the nearest multiple of `snap`.
   *
   * `keep` is the default, and that is the opposite of `Draggable`'s on purpose. A refused drop is
   * a REFUSAL — something said no, and returning is the safe answer. Nothing refuses a turn: the
   * player turned the piece because they meant to, and undoing that by default would make the atom
   * useless for the case it exists for.
   */
  readonly onRelease: OnRelease;
  /** The grid a `snap` release lands on, in degrees. Read for nothing else. */
  readonly snap: number;
}

export const Rotatable = defineAtom<RotatableFields>({
  name: "Rotatable",
  // The angle is written into the pose, so there has to be one to write into.
  requires: ["Transformable"],
  defaults: { onRelease: "keep", snap: 90 },
  classes: { onRelease: "own", snap: "own" },
});

/** Can this node be turned by hand? Presence of the atom is the answer. */
export function rotatable(n: Node): boolean {
  return caps(n).has("Rotatable");
}

/** What a release does to this element — `undefined` when it does not turn at all. */
export function onReleaseOf(n: Node): OnRelease | undefined {
  return fieldsOf<RotatableFields>(n, "Rotatable")?.onRelease;
}

/**
 * WHERE THE ANGLE LANDS — the atom's whole policy as one pure function, in degrees.
 *
 * `home` is passed IN rather than read off the node, and that is the same lesson the press learnt:
 * by the time a release is handled the node is already wearing the turned angle, so reading it back
 * would make the turn its own home and `home` would mean `keep`. Whoever starts the gesture
 * captures where it began.
 *
 * A node with no `Rotatable` has no policy and keeps whatever it was given: this answers for the
 * atom, never for the tree.
 */
export function restAngle(n: Node, turnedTo: number, home: number): number {
  const spec = fieldsOf<RotatableFields>(n, "Rotatable");
  if (!spec) return turnedTo;
  if (spec.onRelease === "home") return home;
  if (spec.onRelease !== "snap") return turnedTo;
  // A grid of nothing is not a grid: a zero or negative step would divide the angle by nothing and
  // land it on NaN, which reads on screen as a piece that vanished.
  if (!(spec.snap > 0)) return turnedTo;
  return Math.round(turnedTo / spec.snap) * spec.snap;
}
