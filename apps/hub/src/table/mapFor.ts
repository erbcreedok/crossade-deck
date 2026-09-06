// WHICH BOARD A TABLE BUILDS — one function of the `game` id the server hands back in `welcome`
// (or, on the very first frame before it arrives, the id already carried in the URL). Kept apart
// from `index.ts` so a unit test can hit it without mounting a host or opening a socket.
import { chairId, chessMap, nardyMap, roundMap, roundPlaces, seatChair } from "@game-presets/desks";
import { add, byId, node, remove, type Node } from "game-kit";
import { hubSeats } from "./people.js";

/** How many people this shelf's desks seat — the same two the room is created with. */
export const TABLE_SEATS = 2;

/** The layer the round table's rings stand in — see `syncSeatChairs` below. */
const SEAT_LAYER = "seat layer";

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

/**
 * THE RINGS, MADE TO MATCH WHO IS ACTUALLY HERE — one per seat in `present`, standing in the SAME
 * slot that seat always has (`roundPlaces(TABLE_SEATS)`, by index), never fewer and never more.
 *
 * Called locally by every screen off its OWN copy of the roster, exactly as the discs and the
 * chairs' dressing already are (`withAvatars`) — never sent over the wire, so two screens that
 * read the same roster draw the same rings without a byte spent saying so.
 */
export function syncSeatChairs(desk: Node, present: readonly string[]): void {
  const places = roundPlaces(TABLE_SEATS);
  const seats = hubSeats(TABLE_SEATS);
  let layer = byId(desk, SEAT_LAYER);
  for (const [i, { seat, ink }] of seats.entries()) {
    const there = byId(desk, chairId(seat));
    const should = present.includes(seat);
    if (should && !there) {
      if (!layer) {
        layer = node(SEAT_LAYER);
        add(desk, layer);
      }
      add(layer, seatChair(seat, places[i]!, { ink, name: seat }));
    } else if (!should && there) {
      remove(there.parent!, there);
    }
  }
}
