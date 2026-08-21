// WHERE EVERY NODE STANDS, by id, in one top-down walk — the geometry side of the plan, asked for
// on its own by the motion runtime, which needs poses and not pictures.

import { type Node, type NodeId } from "../../core/node.js";
import { fieldsOf } from "../../core/node.js";
import { resolveAngle, type TransformableFields } from "../../core/atoms/transformable.js";
import { contextFor, sumAlongChain } from "../../core/resolve.js";
import { placeChildren } from "../../core/atoms/container.js";
import { applyEffects } from "../effects.js";
import { chain, compose, IDENTITY, move, pose, type Transform } from "../../core/transform.js";

/**
 * Where every node sits, in units, relative to the root — the layout's answer where a
 * container spoke, the node's own pose where it did not.
 *
 * Read top-down in one pass: a child's origin needs its owner's, and the owner is always
 * visited first.
 */
export function transformsOf(root: Node): Map<NodeId, Transform> {
  const out = new Map<NodeId, Transform>();
  // THE SAME SEAM as scenePlan's, on the GEOMETRY side: an effect's `pre` (a flip's reflection) is
  // folded into a node's own transform so its CHILDREN inherit it through the chain — a mirrored
  // stack turns its cards over with it, and two reflections up the chain cancel exactly. The walk
  // knows no mechanic by name; the paint side reads `coats`, this side reads `pre`.
  //
  // And it descends into the SHOWN node's children, not the authored one's: a substitute face
  // stands exactly where the node stood — same slot, same pose — and carries its own subtree,
  // whose ids land in this map so the plan can place every quad it is about to draw.
  const seed = shownOf(root);
  const rootHere = compose(poseOf(root), seed.pre);
  out.set(root.id, rootHere);
  if (seed.node.id !== root.id) out.set(seed.node.id, rootHere);

  const descend = (shown: Node, here: Transform): void => {
    const placed = placeChildren(shown);
    for (const child of shown.children) {
      // The LAYOUT's answer where a container spoke, the child's own pose where it did not —
      // and either way it is composed onto the owner's, not added to it. Added, a card in a
      // turned hand would sit in the right place and face the wrong way.
      const at = placed.get(child.id) ?? ownPose(child);
      const own = fieldsOf<TransformableFields>(child, "Transformable");
      // The turn is the ONE resolved value here, because `orientation` can sever the chain: a
      // billboard must end up at its own angle however its owners are turned. `resolveAngle` says
      // what the node's turn must COME OUT as; what is composed onto the owner's matrix is that
      // target minus what the chain already carries, so `world` composes its own angle exactly as
      // it always did and `viewer` cancels the accumulated one. Place and size are untouched: the
      // frame cuts the angle, and a frame that moved things would be a second layout.
      const ctx = contextFor(child, 1);
      const inherited = sumAlongChain(ctx, "Transformable", "angle") - (own?.angle ?? 0);
      const turn = resolveAngle(ctx) - inherited;
      const base = compose(here, pose(at, turn, own?.scale ?? 1));
      const eff = shownOf(child);
      const t = compose(base, eff.pre);
      out.set(child.id, t);
      if (eff.node.id !== child.id) out.set(eff.node.id, t);
      descend(eff.node, t);
    }
  };
  descend(seed.node, rootHere);

  return out;
}

/** A node's substitute and pose shift from the effects list — itself and the identity when none. */
function shownOf(n: Node): { node: Node; pre: Transform } {
  return applyEffects(n, contextFor(n, 1));
}

/** The root's own pose. It has no owner, so nothing composes onto it. */
function poseOf(n: Node): Transform {
  const own = fieldsOf<TransformableFields>(n, "Transformable");
  return pose(ownPose(n), own?.angle ?? 0, own?.scale ?? 1);
}


function ownPose(n: Node): { x: number; y: number } {
  const at = fieldsOf<TransformableFields>(n, "Transformable")?.at;
  return { x: at?.x ?? 0, y: at?.y ?? 0 };
}
