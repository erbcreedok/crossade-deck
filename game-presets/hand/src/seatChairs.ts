// THE RINGS, MADE TO MATCH WHO IS ACTUALLY HERE — one per seat the room says is taken, standing in
// the SAME slot that seat always has, never fewer and never more.
//
// Built locally by every screen off its OWN copy of the roster, exactly as the discs already are —
// never sent over the wire, so two screens that read the same roster draw the same rings without a
// byte spent saying so.

import { chairId, chairLidId, chairMarks, installSeatArt, seatChairs } from "@game-presets/desks";
import { deskSeats, type SeatedPerson } from "@game-presets/desk";
import { byId, remove, type Node, type SeatPlace } from "game-kit";

/**
 * Put a ring up for everybody sitting, take down the ones who got up, and make sure each ring wears
 * its paint.
 *
 * `places` is the desk's own slots, in seat order — a ring lands in the slot ITS SEAT always has,
 * never in the slot its owner's position in the roster happens to be.
 */
export function syncSeatChairs(desk: Node, present: readonly SeatedPerson[], places: readonly SeatPlace[]): void {
  const seats = deskSeats(places.length);
  for (const [i, { seat, ink }] of seats.entries()) {
    const there = byId(desk, chairId(seat));
    const sitting = present.find((one) => one.seat === seat);
    // A CHAIR OFF THE WIRE ARRIVES ALREADY STANDING — a reload's tree has it from the first move on
    // (the whole tree is sent) — so the branch that registers its paints never runs on THIS screen
    // unless asked here too. `installSeatArt` is idempotent, so asking for a seat already registered
    // costs nothing, and without this the arch and the lid of a chair that came off the wire are
    // simply never drawn: the painter silently skips a surface nobody registered.
    if (sitting) installSeatArt(seat, ink);
    if (sitting && !there) {
      // THE SHELF'S OWN CONSTRUCTOR BUILDS IT (`seatChairs`), one place at a time, and that is the
      // whole point of the call: a ring built here by hand was a ring without the two things the
      // constructor gives every other desk on the shelf — the HAND atoms that make it the patch its
      // owner's cards lie in, and the NAME node that stands beside it.
      seatChairs(desk, [places[i]!], [{ seat, ink, name: sitting.name }], true);
    } else if (!sitting && there) {
      remove(there.parent!, there);
      // ...AND ITS FURNITURE WITH IT: the face over it and the marks beside it — a face left behind
      // is a chair drawn for somebody who got up.
      for (const piece of [byId(desk, chairLidId(seat)), ...chairMarks(desk, seat)]) if (piece?.parent) remove(piece.parent, piece);
    }
  }
}
