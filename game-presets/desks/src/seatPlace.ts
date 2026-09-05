// THE SEAT ITSELF — the chair a place is, drawn on the felt and standing there whether or not
// anybody is sitting in it.
//
// A desk knows its PLACES (`seatPlaces`) long before it knows its people: they are geometry, worked
// out from the shape of the felt, and they are the same on every screen. The avatar is not that. An
// avatar is a person's EYES — it is read out of their own camera (`presence.ts`), it walks off with
// them when they pan, and it may be picked up and put down. A desk that drew only the avatar had
// nothing left on it when somebody looked away: the place they were sitting at vanished with them,
// and a board with three wandered players read as a board nobody had joined.
//
// So the two are separate things and the chair is the permanent one. It is the ANCHOR — flat on the
// sukno, in the place's own ink, a little bigger than the disc so the disc sits INSIDE it and the
// eye reads "that person is at that place" without being told. Walk the disc away and the ring is
// still there saying whose place it is; the disc glides back to it on idle (`idleReturn`).
//
// AN EMPTY CHAIR IS A DIFFERENT PICTURE and not a dimmer one: grey and dashed, with no name under
// it. Dashed because a place nobody holds is an outline of a place — the same thing a plan drawing
// says with a dashed line — and drawing it in some seat's colour would be claiming it for a player
// who is not there.
//
// IT IS SCENERY. No `Acceptor`, no `Draggable`, no `Grabber` and no shadow: a chair is not a place a
// card may go and not a thing a finger may take. It is added to the desk BEFORE the pieces, so the
// document order that ranks equals in the plan puts it under every card and every man on the board.

import {
  add,
  Bounded,
  circle,
  Labeled,
  node,
  Oriented,
  rect,
  registerSurface,
  registerTextStyle,
  Screened,
  Surfaced,
  Transformable,
  Valued,
  fieldsOf,
  type Node,
  type Paint,
  type ValuedFields,
  type Vec,
} from "game-kit";

/**
 * HOW BIG A CHAIR IS, in units — and it is measured against the DISC and not against the felt.
 *
 * `presence.ts` draws a person at 0.55 of a unit and holds that size on the GLASS (`Screened`), so a
 * ring measured in felt units would be a hoop round the disc on a board seen whole and a speck under
 * it zoomed in. The chair is screened for the same reason and by the same amount: the two are one
 * picture — a person standing in their place — and a picture whose halves scale differently comes
 * apart at every zoom but one.
 */
export const CHAIR = { d: 0.82, line: 0.035, caption: { w: 1.7, h: 0.26, at: 0.62 } };

/** The mark a chair wears so a desk can find its own again — an id is a name and nothing parses one. */
export const CHAIR_VALUE = "chair";

/** The caption's role. A PLACE'S NAME, not a font — what it is worth is the theme's to re-decide. */
export const SEAT_TEXT = "desk.seat.name";

/** The id a chair answers to. Built here, never parsed (`guard.id-is-opaque`). */
export function chairId(seat: string): string {
  return `seat ${seat}`;
}

/** The chair's own surface, one per seat — plus the one every unheld place shares. */
export function chairSurface(seat?: string): string {
  return seat === undefined ? "desk.seat.empty" : `desk.seat.${seat}`;
}

/** Whether this node is a chair. Read off what it SAYS, never off the shape of its id. */
export function isChair(n: Node): boolean {
  return Boolean(fieldsOf<ValuedFields>(n, "Valued")?.values[CHAIR_VALUE]);
}

/**
 * Register what a chair points at by name. Idempotent — a re-render calls it again.
 *
 * No layers at all, only the contour: a filled ring would be a coin on the felt, and the disc that
 * has to stand INSIDE it would be standing on a plate. What a chair is, is an outline.
 */
export function installSeatArt(seat?: string, ink?: Paint): void {
  registerTextStyle(SEAT_TEXT, {
    family: "ui-sans-serif, system-ui, sans-serif",
    size: 0.14,
    weight: 600,
    lineHeight: 1.2,
    fill: "text",
  });
  registerSurface(chairSurface(), {
    layers: [],
    stroke: { color: "textFaint", width: CHAIR.line, opacity: 0.8, dash: { on: 0.1, off: 0.08 } },
  });
  if (seat === undefined || ink === undefined) return;
  registerSurface(chairSurface(seat), {
    layers: [],
    stroke: { color: ink, width: CHAIR.line, opacity: 0.85 },
  });
}

/** Who sits at a chair, and what the desk calls them — absent altogether is a place nobody holds. */
export interface SeatLook {
  readonly ink: Paint;
  /** A short name under the ring. Absent, the ring alone — a held place the desk has no word for. */
  readonly name?: string;
}

/**
 * ONE CHAIR, standing at one place.
 *
 * `Oriented: "viewer"` for the same reason the avatar is: the ring is symmetric and would not care,
 * but the name under it has a top, and a caption drawn upside down for the player sitting opposite
 * is not "the same name from the other side", it is a broken picture.
 */
export function seatChair(seat: string, place: { readonly at: Vec }, look?: SeatLook): Node {
  installSeatArt(seat, look?.ink);
  const chair = node(
    chairId(seat),
    Bounded({ bounds: circle(CHAIR.d / 2) }),
    Surfaced({ surface: look ? chairSurface(seat) : chairSurface() }),
    Transformable({ at: place.at }),
    Oriented({ orientation: "viewer" }),
    Screened({ screened: true }),
    Valued({ values: { [CHAIR_VALUE]: 1 } }),
  );
  if (look?.name !== undefined) {
    add(
      chair,
      node(
        `${chairId(seat)} name`,
        Bounded({ bounds: rect(CHAIR.caption.w, CHAIR.caption.h) }),
        Labeled({ label: look.name, style: SEAT_TEXT }),
        Transformable({ at: { x: 0, y: CHAIR.caption.at } }),
      ),
    );
  }
  return chair;
}

/** One seat of a desk, as the maps declare them — and what, if anything, the chair is captioned. */
export interface SeatOfDesk {
  readonly seat: string;
  readonly ink: Paint;
  readonly name?: string;
}

/**
 * EVERY CHAIR OF A DESK, put on it — one per place, in the order the places came in.
 *
 * Called BEFORE the pieces are added and never after: equals in the plan are ranked by document
 * order, so a chair added last would be an outline drawn over the very cards it is under.
 *
 * A place with no seat declared for it is drawn empty. Returned in place order so a caller that
 * needs a stand-in for one of them — a hand measured against the person who is not here yet
 * (`placeHand`) — has it without looking it up again.
 */
export function seatChairs(
  desk: Node,
  places: readonly { readonly at: Vec }[],
  seats: readonly SeatOfDesk[],
): readonly Node[] {
  return places.map((place, i) => {
    const seat = seats[i];
    const chair = seatChair(seat?.seat ?? `${i}`, place, seat ? { ink: seat.ink, ...(seat.name !== undefined ? { name: seat.name } : {}) } : undefined);
    add(desk, chair);
    return chair;
  });
}
