// WHAT ONE SEAT IS SHOWN — the truth, minus whatever this pair of eyes is denied.
//
// The canon settles the shape before any code does: privacy is a fact of the TREE and not of the
// renderer, because the view is local. So a seat is not handed a flag to render differently; it is
// handed a different TREE — the projection — and the renderer goes on knowing nothing about who is
// watching. Everything downstream of this line is the same engine drawing an ordinary board.
//
// A PROJECTION IS A COPY, and that is the whole reason this exists as a function rather than as the
// three-line walk a single-screen story could get away with. The moment two seats look at one
// board, cutting the north hand out for the south viewer would cut it out of the BOARD — the next
// projection would find it already gone, and the truth would have been quietly eaten by a view.
//
// Ids survive the copy: a projection is the same board from somewhere else, so a move that names
// `pile` finds `pile` in every seat's tree, and the seats can agree about what happened.

import { cloneTree, remove, walk, type Node } from "./node.js";
import { visibleTo } from "./atoms/private.js";

/**
 * The tree as `viewer` may see it. Subtrees that viewer is denied are simply NOT THERE — not
 * greyed, not blanked: a hidden hand is absent, and nothing downstream has to know it ever was.
 *
 * The truth is left untouched. Project it again for another seat and you get another whole tree.
 */
export function project(root: Node, viewer: string): Node {
  const seen = cloneTree(root);
  const hidden: Node[] = [];
  walk(seen, (n) => {
    if (!visibleTo(n, viewer)) hidden.push(n);
  });
  for (const n of hidden) if (n.parent) remove(n.parent, n);
  return seen;
}
