// WHICH BOARD A TABLE BUILDS — one function of the `game` id the server hands back in `welcome`
// (or, on the very first frame before it arrives, the id already carried in the URL). Kept apart
// from `index.ts` so a unit test can hit it without mounting a host or opening a socket.
import { chairId, chairLidId, chairMarks, chessMap, installSeatArt, nardyMap, roundMap, roundPlaces, seatChairs } from "@game-presets/desks";
import { byId, remove, type Node } from "game-kit";
import { deskSeats } from "@game-presets/desk";

/** How many people this shelf's desks seat — the same two the room is created with. */
export const TABLE_SEATS = 2;

export type TableGame = "cards" | "chess" | "nardy";

export function isTableGame(id: string | undefined): id is TableGame {
  return id === "cards" || id === "chess" || id === "nardy";
}

/** Builds the board for a table game id. Unknown ids fall back to the card table. */
export function mapFor(id: string | undefined): Node {
  if (id === "chess") return chessMap();
  if (id === "nardy") return nardyMap();
  // THE ROUND TABLE and not the catalog's live desk. That one seats two hand areas, because the
  // page it belongs to is about a card changing owner; a table people sit at has no zone that is
  // somebody's, and its felt is a circle a card cannot be taken out of (`roundMap`).
  // A HAND PER SEAT, under the room's OWN names for them (`p1`, `p2`). The hands come with the
  // people: a patch of felt belonging to somebody who is not here would be the fixed box the round
  // table was made to get rid of, and the desk re-places each one against its owner's disc the
  // moment that person's view arrives (`hubPeople`).
  //
  // NO RING WITHOUT A PLAYER: built with no seats at all — the roster is not known yet at this
  // point (it arrives from `joinTable`, after the desk is already up) — and `syncSeatChairs` puts
  // one up per seat once it is.
  return roundMap([]);
}

/** Who the room says is sitting at this desk — the seat it named them, and what it calls them. */
export interface SeatedPerson {
  readonly seat: string;
  readonly name: string;
}

/**
 * THE RINGS, MADE TO MATCH WHO IS ACTUALLY HERE — one per seat in `present`, standing in the SAME
 * slot that seat always has (`roundPlaces(TABLE_SEATS)`, by index), never fewer and never more.
 *
 * Called locally by every screen off its OWN copy of the roster, exactly as the discs and the
 * chairs' dressing already are (`withAvatars`) — never sent over the wire, so two screens that
 * read the same roster draw the same rings without a byte spent saying so.
 *
 * THE SHELF'S OWN CONSTRUCTOR BUILDS IT (`seatChairs`), one place at a time, and that is the whole
 * point of the call: a ring built here by hand was a ring without the two things the constructor
 * gives every other desk on the shelf — the HAND atoms that make it the patch its owner's cards lie
 * in, and the NAME node that stands beside it. Both were missing on this desk alone.
 */
export function syncSeatChairs(desk: Node, present: readonly SeatedPerson[]): void {
  const places = roundPlaces(TABLE_SEATS);
  const seats = deskSeats(TABLE_SEATS);
  for (const [i, { seat, ink }] of seats.entries()) {
    const there = byId(desk, chairId(seat));
    const sitting = present.find((one) => one.seat === seat);
    // A CHAIR OFF THE WIRE ARRIVES ALREADY STANDING — a reload's tree has it from the first move on
    // (`table.send` sends the whole tree) — so the branch that registers its paints never runs on
    // THIS screen unless asked here too. `installSeatArt` is idempotent, so asking for a seat
    // already registered costs nothing.
    if (sitting) installSeatArt(seat, ink);
    if (sitting && !there) {
      // ONE PLACE AND ONE SEAT, so the ring lands in the slot this seat always has rather than in
      // the slot its position in the roster happens to be. THE ROUND DESK DEALS, so the ring is
      // also its owner's hand — which is the only kind of hand this desk has (`handZone.ts`).
      seatChairs(desk, [places[i]!], [{ seat, ink, name: sitting.name }], true);
    } else if (!sitting && there) {
      remove(there.parent!, there);
      // ...AND ITS FURNITURE WITH IT: the face over it and the marks beside it — a face left behind
      // is a chair drawn for somebody who got up.
      for (const piece of [byId(desk, chairLidId(seat)), ...chairMarks(desk, seat)]) if (piece?.parent) remove(piece.parent, piece);
    }
  }
}
