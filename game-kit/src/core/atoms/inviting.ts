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
import { Coated, hasCoat, NO_COAT, type Coat, type CoatedFields } from "./coated.js";

export interface InvitingFields {
  /** The coat a willing zone wears — a recipe name, a level, a tint. Data, like every look. */
  readonly coat: Coat;
  /**
   * THE COAT THE ZONE THAT WOULD ACTUALLY TAKE IT WEARS — the one the hand is over right now.
   *
   * Two different sentences, and a desk with more than one zone needs both. `coat` answers WHERE
   * MAY THIS GO: every willing zone says so at the moment of the grab, and goes on saying it for as
   * long as the hand is up. `keen` answers WHERE WILL IT GO IF I LET GO NOW, which is true of one
   * zone at a time and changes as the hand moves.
   *
   * NO_COAT by default, so a zone that says nothing about aiming behaves exactly as it always did.
   * A zone may also do the opposite — nothing for being willing, and its whole light for being
   * aimed at — by leaving `coat` empty and filling this: that is a desk with one zone, where "where
   * may it go" has no news in it and would only be a lamp left on.
   */
  readonly keen: Coat;
}

export const Inviting = defineAtom<InvitingFields>({
  name: "Inviting",
  requires: [],
  // A bare `Inviting()` already glows sensibly: a stock ring in the accent, not an empty coat
  // a consumer must fill before anything shows.
  defaults: { coat: { recipe: "ring", level: 0.7, tint: "accent" }, keen: NO_COAT },
  classes: { coat: "own", keen: "own" },
});

/** The declared invite, or `undefined` when this zone has nothing to put on. */
export function inviteOf(n: Node): Coat | undefined {
  return fieldsOf<InvitingFields>(n, "Inviting")?.coat;
}

/** What this zone wears while it is the one being AIMED at, or `undefined` when it says nothing. */
export function keenOf(n: Node): Coat | undefined {
  return fieldsOf<InvitingFields>(n, "Inviting")?.keen;
}

/**
 * Dress ONE zone in its invite and hand back the undo. The low door, for a game whose legality
 * lives in its own functions rather than an `Acceptor` — it picks the zones, this dresses them.
 */
export function wearInvite(zone: Node): () => void {
  return dress(zone, inviteOf(zone));
}

/**
 * Dress ONE zone as the AIMED one — the same protocol, the other coat.
 *
 * Who is aimed at is not a question this module can answer: it is whatever the desk would hand the
 * release to, and only the desk knows that. So the caller decides and this dresses, exactly as with
 * the invite — and a caller that dresses in the same answer the release will use cannot light a
 * zone that then refuses the card.
 */
export function wearKeen(zone: Node): () => void {
  return dress(zone, keenOf(zone));
}

function dress(zone: Node, invite: Coat | undefined): () => void {
  // AN EMPTY COAT IS NOT A COAT, and putting one on is not the same as putting nothing on: it would
  // take the zone's own standing look off for the length of the drag and hand it back afterwards.
  // A zone that declares one of the two and leaves the other empty says nothing on that question.
  if (!invite || !hasCoat(invite)) return () => {};
  const standing = fieldsOf<CoatedFields>(zone, "Coated");
  const prevSelf = standing?.self ?? NO_COAT;
  const cast = standing?.cast ?? NO_COAT;
  compose(zone, Coated({ self: invite, cast }));
  return () => compose(zone, Coated({ self: prevSelf, cast }));
}

