// KEEPS — which of a child's capabilities still act while it sits INSIDE this container.
//
// Shape is like `bounds`: NO field (no atom) means everything is allowed; a list is a NARROWING.
// A discard that `keeps: ["drag"]` lets a card be carried OUT but not flipped in place. There is no
// `allow_manual_flip: false` — that would be a negation flag, and the canon forbids those: restriction
// is by ABSENCE from an allow-list, never by a negative. See docs/design/container.md.

import { defineAtom } from "../atom.js";
import { fieldsOf, type Node } from "../node.js";

export interface KeeperFields {
  /** The capabilities that still act inside. Present = narrowing; the atom's ABSENCE = all allowed. */
  readonly keeps: readonly string[];
}

export const Keeper = defineAtom<KeeperFields>({
  name: "Keeper",
  requires: ["Container"],
  defaults: { keeps: [] }, // present but empty = nothing acts inside; the OPEN case is having no Keeper at all
  classes: { keeps: "own" },
});

/**
 * Does capability `cap` still act on a child inside this container? A container with no `Keeper`
 * allows everything (absence is the open door); with one, only the listed capabilities pass.
 */
export function keepsAllows(container: Node, cap: string): boolean {
  const fields = fieldsOf<KeeperFields>(container, "Keeper");
  if (!fields) return true; // no narrowing declared — everything a child can do, it may do here
  return fields.keeps.includes(cap);
}
