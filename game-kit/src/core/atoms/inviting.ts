// INVITING — what a zone WEARS while a drag it would take is in flight. The atom is only the
// LOOK: one `Coat`, worn on the zone's own face for as long as the invitation stands. Whether the
// zone is willing is never decided here — that is the ACCEPTOR's verdict (`willingZones`, in
// `core/invite.ts`), or the game's own rule where legality lives in functions; either way the
// wiring dresses the zone at grab and undresses it at release, and the tree carries no
// "highlighted" flag anywhere.
//
// The coat goes into `Coated.self` — runtime state, exactly what that field exists for — and the
// undo closure puts back what stood there, so a zone that already wore its own selection keeps it.

import { compose, fieldsOf, type Node } from "../node.js";
import { defineAtom } from "../atom.js";
import { Coated, NO_COAT, type Coat, type CoatedFields } from "./coated.js";

export interface InvitingFields {
  /** The coat a willing zone wears — a recipe name, a level, a tint. Data, like every look. */
  readonly coat: Coat;
}

export const Inviting = defineAtom<InvitingFields>({
  name: "Inviting",
  requires: [],
  // A bare `Inviting()` already glows sensibly: a stock ring in the accent, not an empty coat
  // a consumer must fill before anything shows.
  defaults: { coat: { recipe: "ring", level: 0.7, tint: "accent" } },
  classes: { coat: "own" },
});

/** The declared invite, or `undefined` when this zone has nothing to put on. */
export function inviteOf(n: Node): Coat | undefined {
  return fieldsOf<InvitingFields>(n, "Inviting")?.coat;
}

/**
 * Dress ONE zone in its invite and hand back the undo. The low door, for a game whose legality
 * lives in its own functions rather than an `Acceptor` — it picks the zones, this dresses them.
 */
export function wearInvite(zone: Node): () => void {
  const invite = inviteOf(zone);
  if (!invite) return () => {};
  const standing = fieldsOf<CoatedFields>(zone, "Coated");
  const prevSelf = standing?.self ?? NO_COAT;
  const cast = standing?.cast ?? NO_COAT;
  compose(zone, Coated({ self: invite, cast }));
  return () => compose(zone, Coated({ self: prevSelf, cast }));
}

