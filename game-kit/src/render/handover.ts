import { add, byId, fieldsOf, remove, type Node } from "../core/node.js";
import { extentOf, type BoundedFields } from "../core/atoms/bounded.js";
import { isDrawn, isGrip } from "./grips.js";
import { type CarryItem, type Motions } from "./animator/index.js";
import { type Host } from "./host.js";

/**
 * GIVE THE RUN TO THE ZONE, here in the scene, and say the release is dealt with.
 *
 * The wiring can re-parent a drop of its own, and does it well — accept rules, displacement, the
 * lot. What it cannot do is a run led by a HANDLE: it moves the run's lead, and the lead of such a
 * run is a tab. So a hand put into a zone is handed over here instead, and the handle stays exactly
 * what it is — a picture, thrown away and redrawn by the next `settle`.
 *
 * Nothing is written about WHERE anything goes: the zone's own arrangement does that, and the
 * reconcile that follows eases every card from where the hand was holding it into the row. Which is
 * what "it lines up as it lands" means — not a snap after the fact.
 */
export function handOver(s: { readonly host: Host; readonly motions?: Motions }, zone: Node, items: readonly CarryItem[]): void {
  const root = s.host.root;
  for (const it of items) {
    const piece = byId(root, it.id);
    s.motions?.release(it.id);
    if (!piece || isDrawn(piece) || !piece.parent) continue;
    remove(piece.parent, piece);
    add(zone, piece);
  }
  s.host.setRoot(root);
}

/** Every handle on the desk except this one — wherever a zone may have re-homed it. */
export function otherGrips(root: Node, mine: Node): Node[] {
  const out: Node[] = [];
  for (const owner of [root, ...root.children]) {
    for (const tab of owner.children) if (isGrip(tab) && tab.id !== mine.id) out.push(tab);
  }
  return out;
}

/** How big a desk is by its own word, or the shelf's stock size when it has none. */
export function boxOfDesk(root: Node): { readonly w: number; readonly h: number } | undefined {
  const shape = fieldsOf<BoundedFields>(root, "Bounded")?.bounds;
  return shape ? extentOf(shape) : undefined;
}
