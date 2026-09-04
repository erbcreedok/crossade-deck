// MARKED — "who did what" mark attached to a node.
//
// A mark records the last action performed on or with this node (who, what, from where, and when).
// It lives in the tree, so it travels to a second screen or online room. Whether to display a mark
// is decided by the viewer's policy via `visibleMark()`.

import { defineAtom } from "../atom.js";
import { compose, decompose, fieldsOf, type Node } from "../node.js";
import type { Vec } from "../transform.js";
import type { ViewerSettings } from "../viewer.js";

export interface MarkedFields {
  /** Who (seat/player key, e.g. "white", "south") performed the action. */
  readonly by: string;
  /** What action was performed (name of mark registry record). */
  readonly mark: string;
  /** Where the piece originated from, in root units. */
  readonly from?: Vec | undefined;
  /** Timestamp in ms (Date.now()) when the action occurred. */
  readonly at: number;
}

export const Marked = defineAtom<MarkedFields>({
  name: "Marked",
  requires: [],
  defaults: { by: "", mark: "", at: 0, from: undefined },
  classes: { by: "own", mark: "own", at: "own", from: "own" },
});

export function mark(
  n: Node,
  fields: { readonly by: string; readonly mark: string; readonly from?: Vec; readonly at?: number },
): Node {
  return compose(
    n,
    Marked({
      by: fields.by,
      mark: fields.mark,
      ...(fields.from ? { from: fields.from } : {}),
      at: fields.at ?? Date.now(),
    }),
  );
}

export function unmark(n: Node): Node {
  return decompose(n, "Marked");
}

export function visibleMark(n: Node, viewer?: ViewerSettings, now: number = Date.now()): MarkedFields | undefined {
  const m = fieldsOf<MarkedFields>(n, "Marked");
  if (!m || !m.mark) return undefined;

  const policy = viewer?.marks;
  if (policy) {
    if (policy.me !== undefined && m.by === policy.me && !policy.showOwn) return undefined;
    if (policy.ttlMs !== undefined && now - m.at > policy.ttlMs) return undefined;
  }

  return m;
}
