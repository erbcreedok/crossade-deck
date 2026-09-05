// WHICH BOARD A TABLE BUILDS — one function of the `game` id the server hands back in `welcome`
// (or, on the very first frame before it arrives, the id already carried in the URL). Kept apart
// from `index.ts` so a unit test can hit it without mounting a host or opening a socket.
import { chessMap, nardyMap, roundMap } from "@game-presets/desks";
import type { Node } from "game-kit";
import { hubSeats } from "./people.js";

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
  return roundMap(hubSeats(TABLE_SEATS));
}
