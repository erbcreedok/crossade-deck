// THE RINGS, MADE TO MATCH WHO IS ACTUALLY HERE — one per seat the room says is taken, standing in
// the SAME slot that seat always has, never fewer and never more.
//
// Built locally by every screen off its OWN copy of the roster, exactly as the discs already are —
// never sent over the wire, so two screens that read the same roster draw the same rings without a
// byte spent saying so.

import { CHAIR, chairId, chairLidId, chairMarks, freeRingSpot, installSeatArt, seatChairs } from "@game-presets/desks";
import { deskSeats, type SeatedPerson } from "@game-presets/desk";
import { byId, fieldsOf, remove, type Node, type Paint, type SeatPlace, type TransformableFields, type Vec } from "game-kit";

/**
 * Put a ring up for everybody sitting, take down the ones who got up, and make sure each ring wears
 * its paint.
 *
 * `places` is the desk's own slots, in seat order — a ring lands in the slot ITS SEAT always has,
 * never in the slot its owner's position in the roster happens to be.
 */
/**
 * КУДА ВСТАЁТ НОВЫЙ СТУЛ — в первую свободную точку разрезания, считая по тому, где стулья СТОЯТ
 * СЕЙЧАС, а не по номеру места.
 *
 * Люди двигаются: пересевший с трёх часов освобождает три часа, и следующий стул встаёт туда.
 * Гнездо по номеру этого не умеет — оно ставит стул поверх соседа, который занял его место, или в
 * пустоту рядом с ним.
 *
 * Своё, игрой назначенное место берётся, когда оно свободно: за доской мест ровно столько, сколько
 * правил, и придумывать им новые точки незачем.
 */
function freeSpot(desk: Node, places: readonly SeatPlace[], i: number): SeatPlace {
  const standing = chairsOn(desk);
  const mine = places[i];
  const apart = CHAIR.d * 0.9;
  const crowded = (spot: SeatPlace): boolean =>
    standing.some((one) => Math.hypot(one.x - spot.at.x, one.y - spot.at.y) < apart);
  if (mine && !crowded(mine)) return mine;
  const radius = Math.max(...places.map((one) => Math.hypot(one.at.x, one.at.y)), 1);
  return freeRingSpot({ taken: standing, radius, apart });
}

/** Где сейчас стоят стулья этого стола — их точки, как их подвинули руками. */
function chairsOn(desk: Node): Vec[] {
  const out: Vec[] = [];
  for (const seat of deskSeats(ROOM_CHAIRS).map((one) => one.seat)) {
    const chair = byId(desk, chairId(seat));
    const at = chair ? fieldsOf<TransformableFields>(chair, "Transformable")?.at : undefined;
    if (at) out.push(at);
  }
  return out;
}

/** Столько мест самое большее держит комната — дальше стульев не бывает. */
const ROOM_CHAIRS = 32;

export function syncSeatChairs(
  desk: Node,
  present: readonly SeatedPerson[],
  places: readonly SeatPlace[],
  /**
   * ЧЕМ ПОМЕЧЕН ЧЕЛОВЕК НА ЭТОМ СТУЛЕ. Пусто — цвет места, как и было. Кресло носит цвет ЧЕЛОВЕКА,
   * а не номера: иначе за одним столом человек трёх цветов сразу — своего в списке, места на сукне
   * и ещё одного в полосе сверху.
   */
  inkOf?: (seat: string) => Paint,
): void {
  const seats = deskSeats(places.length);
  for (const [i, { seat, ink: placeInk }] of seats.entries()) {
    const ink = inkOf?.(seat) ?? placeInk;
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
      seatChairs(desk, [freeSpot(desk, places, i)], [{ seat, ink, name: sitting.name }], true);
    } else if (!sitting && there) {
      remove(there.parent!, there);
      // ...AND ITS FURNITURE WITH IT: the face over it and the marks beside it — a face left behind
      // is a chair drawn for somebody who got up.
      for (const piece of [byId(desk, chairLidId(seat)), ...chairMarks(desk, seat)]) if (piece?.parent) remove(piece.parent, piece);
    }
  }
}
