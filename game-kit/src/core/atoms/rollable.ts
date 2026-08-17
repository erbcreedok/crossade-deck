// ROLLABLE — this element can be thrown and lands on one of a fixed number of faces: a die, a
// coin, a spinner's pointer. The atom carries the one datum the truth needs — how many faces — and
// nothing of the LOOK: which face is up is the element's `Valued.values.face` (a rule reads it like
// any value: the sum of two dice is `a.values.face + b.values.face`), and what a face looks like is
// the set's skin, the same split as a card's rank and its picture.
//
// Where the result COMES from is not the atom's business either. The kit's seeded rng, a number the
// server dictated, a fixed value for a test — each is a `commit` the throw plays; `perform("roll")`
// is the stock verb for a solo game and draws from `Math.random`. Requires `Valued`: a die with no
// place to keep its face is not a die.

import { defineAtom } from "../atom.js";
import { caps, compose, fieldsOf, type Node } from "../node.js";
import { Valued, type ValuedFields } from "./valued.js";

export interface RollableFields {
  /** How many faces it can land on — 4, 6, 20. */
  readonly sides: number;
}

export const Rollable = defineAtom<RollableFields>({
  name: "Rollable",
  requires: ["Valued"],
  defaults: { sides: 6 },
  classes: { sides: "own" },
});

/** Can this node be rolled? Presence of the atom is the answer. */
export function rollable(n: Node): boolean {
  return caps(n).has("Rollable");
}

/** How many faces — `undefined` when it is not rollable at all. */
export function sidesOf(n: Node): number | undefined {
  return fieldsOf<RollableFields>(n, "Rollable")?.sides;
}

/** The face that is up — `values.face` when it is a whole number, else `undefined` (never thrown yet). */
export function faceOf(n: Node): number | undefined {
  const face = fieldsOf<ValuedFields>(n, "Valued")?.values["face"];
  return typeof face === "number" && Number.isInteger(face) ? face : undefined;
}

/**
 * The node with `values.face` set — a shallow clone, every other value and atom untouched. This is
 * the TRUTH of a roll and nothing else: the picture of the face is the set's business (its skin
 * swaps the surface), the tumble is the runtime's. Refuses a face the die does not have.
 */
export function withFace(n: Node, face: number): Node {
  const sides = sidesOf(n);
  if (sides === undefined) return n;
  if (!Number.isInteger(face) || face < 1 || face > sides) throw new Error(`face ${face} is not on a ${sides}-sided die`);
  const values = fieldsOf<ValuedFields>(n, "Valued")?.values ?? {};
  const next: Node = { id: n.id, parent: n.parent, children: n.children, atoms: new Map(n.atoms) };
  next.atoms.set("Valued", Valued({ values: { ...values, face } }));
  return next;
}

/**
 * Write the face onto the node IN PLACE — what a throw's `commit` calls when the die stops. Same
 * check, same truth as `withFace`; this one keeps the node's identity in a live tree.
 */
export function setFace(n: Node, face: number): void {
  const sides = sidesOf(n);
  if (sides === undefined) return;
  if (!Number.isInteger(face) || face < 1 || face > sides) throw new Error(`face ${face} is not on a ${sides}-sided die`);
  const values = fieldsOf<ValuedFields>(n, "Valued")?.values ?? {};
  compose(n, Valued({ values: { ...values, face } }));
}
