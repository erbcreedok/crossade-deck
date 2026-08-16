// THE INVITE BRIDGE — where the Acceptor's verdict meets the Inviting look. Deliberately its own
// module rather than a corner of either atom: `Inviting` is pure data (a coat), `Acceptor` is
// pure judgement (a rule), and the thing that reads BOTH is a seam of its own — the same shape as
// `planMove` standing over the container policies.

import { walk, type Node } from "./node.js";
import { canAccept } from "./atoms/acceptor.js";
import { inviteOf, wearInvite } from "./atoms/inviting.js";

/**
 * Every zone under `root` that would TAKE `el` and has an invite to show: the Acceptor's verdict
 * decides, the atom dresses — either alone is nothing. Zones whose rule answers anything but
 * "allow" stay dark: a request-gated drop is not an open door.
 */
export function willingZones(root: Node, el: Node): Node[] {
  const willing: Node[] = [];
  walk(root, (n) => {
    if (inviteOf(n) && canAccept(n, el) === "allow") willing.push(n);
  });
  return willing;
}

/**
 * The one-call form over the Acceptor's verdict: dress every willing zone for `el`, and undress
 * them all with the returned closure — grab calls this, release calls what it returns.
 */
export function wearInvites(root: Node, el: Node): () => void {
  const undos = willingZones(root, el).map(wearInvite);
  return () => undos.forEach((undo) => undo());
}
