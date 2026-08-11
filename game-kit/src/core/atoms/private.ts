// PRIVATE — cuts a SUBTREE out of what a viewer is shown. A private hand: its owner sees the cards,
// everyone else sees backs (or nothing). Privacy is a fact of the TREE, not of the renderer — the
// view is local, so this only ever changes what is PROJECTED, never what is true.
//
// It cuts the subtree: a private CONTAINER hides its children too. The reverse is ordinary and legal
// — a private child inside a public container. `access` lists the viewpoints that MAY see; the
// default empty list is private to all, and a hand names its owner to open it to exactly one.

import { defineAtom } from "../atom.js";
import { chainOf, fieldsOf, type Node } from "../node.js";

export interface PrivateFields {
  /** The viewpoints that may see this subtree. Empty = hidden from everyone; name one to open it. */
  readonly access: readonly string[];
}

export const Private = defineAtom<PrivateFields>({
  name: "Private",
  requires: [],
  defaults: { access: [] },
  classes: { access: "own" },
});

/**
 * May `viewer` see this node? It is hidden when the node OR any owner up the chain is `Private` with
 * `viewer` not in its access — that is the subtree cut. A node under no private owner is visible to all.
 */
export function visibleTo(node: Node, viewer: string): boolean {
  for (const owner of chainOf(node)) {
    const p = fieldsOf<PrivateFields>(owner, "Private");
    if (p && !p.access.includes(viewer)) return false; // a private ancestor without this viewer cuts here
  }
  return true;
}
