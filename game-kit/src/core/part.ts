// THE GAP A HAND OPENS while a card is held over it — the preview, and the promise it makes.
//
// Hold a card over a hand and its cards STEP APART, freeing a place for the neighbour-to-be at the
// position the finger points at. That gap is not decoration: it is where the card falls when the
// finger lets go, and a preview pointing anywhere else would be a lie told at the exact moment a
// player is deciding. So the same arithmetic answers both, and there is no second place to keep it.
//
// IT NEEDS NO NEW LAYOUT METHOD, and that is worth saying out loud, because the first sketch of this
// added one. A layout already answers "where do these children go" as a PURE function of a list —
// so a hand parted around a newcomer is that same question asked about a list with the newcomer in
// it. Insert a ghost at the seat under the finger, ask, and read the answers back: the real children
// get their parted poses and the ghost's pose IS the gap.
//
// A layout that keeps no seats does not part. A free desk holds positions rather than addresses:
// there is nothing to step aside from and nothing to promise, and silence is the honest answer.
//
// Nothing here touches the tree. A preview is a promise, and a promise that moved things would be
// a move.

import { fieldsOf, type Node, type NodeId } from "./node.js";
import { type Point, type Shape } from "./atoms/bounded.js";
import { layoutChildren, layoutRecord, type ContainerFields, type LayoutChild } from "./atoms/container.js";

export interface Parted {
  /** Where each child sits WHILE the gap is open — the parted hand, by id. */
  readonly poses: ReadonlyMap<NodeId, Point>;
  /** The gap itself: where the load would land if the finger let go now. */
  readonly gap: Point;
  /** Whose seat it takes — the child it lands BEFORE, or `undefined` at the end of the row. */
  readonly before: NodeId | undefined;
}

/** The newcomer's name inside the borrowed list. It never reaches a tree, so it needs no ceremony. */
const GHOST = "~gap";

/**
 * How `parent` parts for a load held at `at`, or `undefined` when it does not part at all.
 *
 * `load` is the incoming shape, so a hand reserves room for what is actually coming: an UNO card is
 * wider than an ordinary one, and a gap measured for the wrong size is a gap the card does not fit.
 * Absent, the newcomer takes no room and only the seat is answered.
 */
export function partAt(parent: Node, at: Point, load?: Shape): Parted | undefined {
  const fields = fieldsOf<ContainerFields>(parent, "Container");
  const record = fields ? layoutRecord(fields.layout) : undefined;
  if (!record) return undefined;
  const children = layoutChildren(parent);
  const ghost: LayoutChild = { id: GHOST, footprint: load, at: undefined };

  // EVERY SEAT THE NEWCOMER COULD TAKE, and the one whose GAP lands nearest the finger wins.
  //
  // Not `indexAt`, and the difference is the end of the row: that answers "which card is under this
  // point" and so clamps to the nearest EXISTING one — a finger far to the right of the last card
  // gets the last card, and the hand would part before it instead of after. Asking where the card
  // would LAND is the same question the drop will ask, so preview and drop cannot disagree.
  let best: { poses: Map<NodeId, Point>; gap: Point; before: NodeId | undefined } | undefined;
  let closest = Infinity;
  for (let seat = 0; seat <= children.length; seat += 1) {
    const parted = [...children.slice(0, seat), ghost, ...children.slice(seat)];
    const placed = record.place(parted);
    const gap = placed[seat];
    if (!gap) continue; // a layout that places nobody promises nothing — a free desk keeps no seats
    const d = (gap.x - at.x) ** 2 + (gap.y - at.y) ** 2;
    if (d >= closest) continue;
    closest = d;
    const poses = new Map<NodeId, Point>();
    parted.forEach((child, i) => {
      const pose = placed[i];
      if (child.id !== GHOST && pose) poses.set(child.id, pose);
    });
    best = { poses, gap, before: children[seat]?.id };
  }
  return best;
}
