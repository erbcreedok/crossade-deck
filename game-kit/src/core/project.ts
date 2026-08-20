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

import { cloneTree, fieldsOf, remove, walk, type Node } from "./node.js";
import { visibleTo } from "./atoms/private.js";
import { facing, setFacing } from "./atoms/flippable.js";
import { watchedRecord, type PoserFields } from "./atoms/pose.js";

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
  showSides(seen, viewer);
  return seen;
}

/**
 * THE SECOND AXIS OF FACING — what everyone ELSE is shown of a side, written into the projection
 * and nowhere else.
 *
 * The rule belongs to the ZONE and applies to what it holds, so the walk asks each container and
 * turns its children. Turning them is what makes this a projection rather than a render flag: the
 * card in this tree genuinely IS face-down for this seat, and every layer below — the painter, the
 * hit-test, a screenshot — agrees without being told who is watching.
 *
 * The truth keeps one side per card. Two seats differ only in what was drawn for them, which is
 * also why the odd card stays odd: the card's own bit and the zone's rule never mix.
 */
function showSides(seen: Node, viewer: string): void {
  walk(seen, (zone) => {
    const rules = fieldsOf<PoserFields>(zone, "Poser");
    if (!rules?.others) return;
    const record = watchedRecord(rules.others);
    if (!record) return; // an unregistered name is skipped: one bad string costs one zone, not the scene
    const mine = rules.owner === "" || rules.owner === viewer;
    for (const child of zone.children) setFacing(child, record({ owner: facing(child), mine }));
  });
}
