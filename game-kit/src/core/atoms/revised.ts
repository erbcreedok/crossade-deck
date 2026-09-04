// REVISED — revision number of a root tree for state synchronization over the wire.

import { defineAtom } from "../atom.js";
import { compose, fieldsOf, type Node } from "../node.js";

export interface RevisedFields {
  readonly rev: number;
}

export const Revised = defineAtom<RevisedFields>({
  name: "Revised",
  requires: [],
  defaults: { rev: 0 },
  classes: { rev: "rootOnly" },
});

export function revOf(root: Node): number {
  return fieldsOf<RevisedFields>(root, "Revised")?.rev ?? 0;
}

export function bump(root: Node): Node {
  const current = fieldsOf<RevisedFields>(root, "Revised");
  const nextRev = (current?.rev ?? 0) + 1;
  compose(root, Revised({ rev: nextRev }));
  return root;
}
