// THE SEAT ITSELF — the chair a place is, drawn on the felt and standing there whether or not
// anybody is sitting in it.
//
// A desk knows its PLACES (`seatPlaces`) long before it knows its people: they are geometry, worked
// out from the shape of the felt, and they are the same on every screen. The avatar is not that. An
// avatar is a person's EYES — it is read out of their own camera (`presence.ts`) and walks off with
// them when they pan. A desk that drew only the avatar had nothing left on it when somebody looked
// away: the place they were sitting at vanished with them, and a board with three wandered players
// read as a board nobody had joined.
//
// So the two are separate things and the chair is the permanent one. It is the ANCHOR — flat on the
// sukno, in the place's own ink — and it is the whole of what "somebody sits here" looks like. Walk
// the eye away and the ring is still there saying whose place it is; the view glides back to it on
// idle (`idleReturn`) and on a tap.
//
// AND THE RING IS THE HAND. On a desk that deals, a player's cards lie INSIDE their own place
// (`handZone.ts` says what a hand IS), so there is one node saying where somebody sits and one
// saying what they hold, and they cannot come apart. It grows to what it is holding and shrinks back
// when the cards leave.
//
// AND IT WEARS ITS OWN DIRECTION — a short tick on the rim where the place looks (`CHAIR_TICK`).
// A ring is symmetric, so without it a seat says where somebody is and not which way round they are
// sitting, which on a round felt is the difference between the two ends of the same deal.
//
// AN EMPTY CHAIR IS A DIFFERENT PICTURE and not a dimmer one: grey and dashed, with no name under
// it. Dashed because a place nobody holds is an outline of a place — the same thing a plan drawing
// says with a dashed line — and drawing it in some seat's colour would be claiming it for a player
// who is not there. Nothing may be put in one either: an unheld place is nobody's hand.
//
// HOME AND AWAY ARE THE TWO PICTURES A HELD PLACE HAS. Its owner looking AT it (`isHome`) fills it
// with their own ink and their disc is not drawn at all — the ring IS them while they are in it.
// Looked away, the ring is the bare outline and the disc goes off with them.
//
// It is added to the desk BEFORE the pieces, so the document order that ranks equals in the plan
// puts it under every card and every man on the board.
//
// BUT ITS OWNER MAY MOVE IT, and only its owner. Where a person sits is the one thing about a desk
// that is theirs to decide, and it is decided by dragging the RING — with their cards riding along
// inside it — never by dragging the disc, which is a reading of their camera and not a thing. The
// refusal is `mayTake`, not `Grippable`: a grip cuts the whole SUBTREE, so a ring gripped to its
// owner would be a hand nobody else could ever be dealt from, which is what the LOCK is for and not
// what a place is.

import {
  Acceptor,
  add,
  Bounded,
  byId,
  Carry,
  circle,
  compose,
  Container,
  decompose,
  Draggable,
  Grabber,
  Grippable,
  grippableBy,
  Inviting,
  Labeled,
  node,
  NO_COAT,
  Oriented,
  Owned,
  Reaching,
  rect,
  registerLayout,
  registerSurface,
  registerTextStyle,
  Screened,
  Surfaced,
  Transformable,
  Valued,
  fieldsOf,
  type Node,
  type Paint,
  type TransformableFields,
  type ValuedFields,
  type Vec,
} from "game-kit";
import { handLayout, PULL, zoneKeen, ZONE_SPREAD, type Spread } from "./felt.js";
import { HAND, HAND_LAYOUT, HAND_LOCK, HAND_VALUE, handAccept, handLocked } from "./handZone.js";

/**
 * HOW BIG AN EMPTY CHAIR IS, in units — and it is the HAND'S own empty size (`HAND.empty`), because
 * they are one node and a place cannot be two sizes.
 *
 * Measured in FELT units and not held on the glass. The ring used to be `Screened` — sized for the
 * eye, like the disc it had to contain — and a container that holds cards cannot be: the cards are
 * felt-sized, and a patch that kept its size through a zoom would be a hand that swallowed the whole
 * table seen whole and a speck under one card seen close.
 */
export const CHAIR = { d: HAND.empty, line: 0.035, caption: { w: 1.7, h: 0.26, at: HAND.empty / 2 + 0.28 } };

/**
 * THE TICK ON THE RIM THAT SAYS WHICH WAY THIS PLACE LOOKS — a short bar across the outline, in
 * units, and nothing more than that.
 *
 * A ring is symmetric and so says WHERE somebody sits and not which way they are turned; on a round
 * felt those are two different facts, because the seat opposite is looking at the same cards from
 * the other end. The place's own `facing` is the answer and it is already known here — it is the
 * angle the owner's camera opens at — so the ring wears it.
 *
 * A TICK AND NOT A WEDGE. The wedge belongs to the DISC, which is a reading of where somebody is
 * looking RIGHT NOW and moves whenever they pan; a place's facing never moves at all, and drawing
 * the two alike would be one picture for a fact and for a measurement.
 */
export const CHAIR_TICK = { w: 0.26, h: 0.07, at: HAND.empty / 2 };

/** The mark a chair wears so a desk can find its own again — an id is a name and nothing parses one. */
export const CHAIR_VALUE = "chair";

/** The surface the facing tick is painted with, one per seat — its owner's own ink. */
export function chairTickSurface(seat: string): string {
  return `desk.seat.${seat}.facing`;
}

/**
 * THE ID OF THE TICK BESIDE A CHAIR — a node of its own, for the caption's own reason: the ring
 * arranges what is IN it (`handLayout`), so a tick made a child would be dealt into somebody's hand.
 */
export function chairTickId(seat: string): string {
  return `${chairId(seat)} facing`;
}

/** Whether its owner is looking AT this place right now. `1` is home; the ring is then filled. */
export const CHAIR_HOME = "home";

/** The caption's role. A PLACE'S NAME, not a font — what it is worth is the theme's to re-decide. */
export const SEAT_TEXT = "desk.seat.name";

/** The id a chair answers to. Built here, never parsed (`guard.id-is-opaque`). */
export function chairId(seat: string): string {
  return `seat ${seat}`;
}

/**
 * THE ID OF THE NAME UNDER A CHAIR — a node of its own and not a child of the ring.
 *
 * A child it would be laid out as a CARD: the ring arranges what is in it (`handLayout`), and a
 * caption in that row is a word dealt into somebody's hand. So it stands beside the ring in the
 * seats' layer, and `standChair` moves the two together.
 */
export function chairNameId(seat: string): string {
  return `${chairId(seat)} name`;
}

/**
 * The chair's own surface, one per seat and one per state it can be in — plus the one every unheld
 * place shares. `home` fills it with the owner's ink, `shut` washes it in the same ink for the lock;
 * both at once is both, which is the honest picture of a shut hand its owner is sitting at.
 */
export function chairSurface(seat?: string, state?: { readonly home?: boolean; readonly shut?: boolean }): string {
  if (seat === undefined) return "desk.seat.empty";
  return `desk.seat.${seat}${state?.home ? ".home" : ""}${state?.shut ? ".shut" : ""}`;
}

/** Whether this node is a chair. Read off what it SAYS, never off the shape of its id. */
export function isChair(n: Node): boolean {
  return Boolean(fieldsOf<ValuedFields>(n, "Valued")?.values[CHAIR_VALUE]);
}

/** Whether this place's owner is looking at it. Read off the node, so both screens read one truth. */
export function chairHome(n: Node): boolean {
  return fieldsOf<ValuedFields>(n, "Valued")?.values[CHAIR_HOME] === 1;
}

/**
 * MAY THIS FINGER LIFT THIS — the seat's whole permission, and the one line a live page hands to
 * `liveTable`'s `may`.
 *
 * Two rules, and they are about different things. A RING is its owner's alone: where a person sits
 * is theirs to decide, and a place any passing finger could drag is a player being reseated by
 * somebody else. Everything else is the kit's own grip (`grippableBy`), which is what the LOCK
 * writes when a hand is shut.
 *
 * The ring's own rule cannot be a grip, because a grip cuts the subtree: locked to its owner, the
 * cards lying in it would be unreachable by anybody else for ever, and a hand that can never be
 * dealt from is not an open hand.
 */
export function mayTake(n: Node, seat: string): boolean {
  const owner = isChair(n) ? fieldsOf<{ box: string }>(n, "Owned")?.box : undefined;
  if (owner !== undefined && owner !== seat) return false;
  return grippableBy(n, seat);
}

/** How much of the owner's ink a place its owner is sitting at is filled with. */
const HOME_WASH = 0.34;
/** How much of the owner's ink a shut hand is washed with — enough to read, not enough to hide a card. */
const SHUT_WASH = 0.22;

/**
 * Register what a chair points at by name. Idempotent — a re-render calls it again.
 *
 * The contour is what a place IS, so the away-and-open ring has no layers at all: a filled ring
 * would be a coin on the felt. The FILL is the news — "its owner is looking at this" — and it earns
 * the one thing the outline cannot say.
 */
export function installSeatArt(seat?: string, ink?: Paint, look: Spread = ZONE_SPREAD): void {
  registerTextStyleOnce();
  registerLayout(HAND_LAYOUT, handLayout(look, HAND.pad));
  registerSurface(chairSurface(), {
    layers: [],
    stroke: { color: "textFaint", width: CHAIR.line, opacity: 0.8, dash: { on: 0.1, off: 0.08 } },
  });
  if (seat === undefined || ink === undefined) return;
  registerSurface(chairTickSurface(seat), { layers: [{ paint: ink, opacity: 0.85 }] });
  const stroke = { color: ink, width: CHAIR.line, opacity: 0.85 };
  for (const home of [false, true]) {
    for (const shut of [false, true]) {
      registerSurface(chairSurface(seat, { home, shut }), {
        layers: [
          ...(home ? [{ paint: ink, opacity: HOME_WASH }] : []),
          ...(shut ? [{ paint: ink, opacity: SHUT_WASH }] : []),
        ],
        stroke,
      });
    }
  }
}

function registerTextStyleOnce(): void {
  registerTextStyle(SEAT_TEXT, {
    family: "ui-sans-serif, system-ui, sans-serif",
    size: 0.14,
    weight: 600,
    lineHeight: 1.2,
    fill: "text",
  });
}

/** Who sits at a chair, and what the desk calls them — absent altogether is a place nobody holds. */
export interface SeatLook {
  readonly ink: Paint;
  /** A short name under the ring. Absent, the ring alone — a held place the desk has no word for. */
  readonly name?: string;
  /**
   * WHETHER THIS DESK DEALS. On, the ring is also its owner's hand and cards may be put in it; off,
   * it is the place alone, which is every board — a man is on a square and nowhere else, and a
   * patch of felt beside a player would be a place the game has no word for.
   */
  readonly hand?: boolean;
}

/**
 * ONE CHAIR, standing at one place — and, on a desk that deals, one HAND.
 *
 * The hand atoms are the whole of what "cards go in here" means, and they are the same ones the
 * separate patch used to wear: an arrangement, a rule about what may come in, a grab that takes one
 * card at a time, a reach so a release NEAR the ring still counts as into it, and the light it wears
 * while a hand is aimed at it.
 *
 * NOT `Oriented: "viewer"`. The ring is symmetric and would not care, but what is IN it is not: a
 * billboard ring would hold every card square to the reader on a turned screen, which is a hand that
 * spins whenever somebody rotates their view. The NAME is the part with a top, and it is a node of
 * its own (`chairNameId`) so it can be a billboard while the ring is not.
 */
export function seatChair(seat: string, place: { readonly at: Vec }, look?: SeatLook): Node {
  installSeatArt(seat, look?.ink);
  return node(
    chairId(seat),
    Bounded({ bounds: circle(CHAIR.d / 2) }),
    Surfaced({ surface: look ? chairSurface(seat, {}) : chairSurface() }),
    Transformable({ at: place.at }),
    Valued({ values: { [CHAIR_VALUE]: 1, [CHAIR_HOME]: 0, ...(look?.hand ? { [HAND_VALUE]: 1, [HAND_LOCK]: 0 } : {}) } }),
    // STAY where the finger let go: a place is wherever its owner put it, and there is no target to
    // refuse it — a chair that flew home on every release could not be moved at all.
    Draggable({ onReject: "stay" }),
    // ALONG THE SUKNO, never off it. A ring is slid the way a beer mat is: no pop, no bank, no
    // picture of a landing under it and no flight when it is let go of in motion — the three things
    // a carry does for a PIECE, and a place asks none of them. Said by the thing itself, because
    // the ring stopped being glass-sized the day it grew to hold cards (`ridesFelt`).
    Carry({ ride: "felt" }),
    // WHOSE PLACE IT IS, said on the node — `mayTake` reads it, and so does everything else that
    // has to know a ring from a card. A place nobody holds is owned by nobody and moved by nobody.
    ...(look ? [Owned({ box: seat })] : []),
    ...(look?.hand
      ? [
          Container({ layout: HAND_LAYOUT }),
          Acceptor({ accept: handAccept(seat) }),
          Grabber({ grab: "one" }),
          Reaching({ reach: PULL }),
          // Nothing for being merely willing, the whole light for being aimed at: on a desk where
          // every open hand takes every card, "you may put it here" is true of all of them and all
          // the time.
          Inviting({ coat: NO_COAT, keen: zoneKeen(look.ink) }),
        ]
      : []),
  );
}

/**
 * WHERE THE TICK SITS AND HOW IT LIES — on the rim, in the direction the place looks.
 *
 * `facing` is the angle that place's own camera opens at, clockwise on the glass, and a screen
 * turned by it puts the felt straight ahead at the TOP. So the direction of the look on the felt is
 * the up-vector turned by `facing`, and the bar lies across it — which is the same turn again.
 */
function tickPose(place: { readonly at: Vec }, facing: number): { readonly at: Vec; readonly angle: number } {
  const rad = (facing * Math.PI) / 180;
  return {
    at: { x: place.at.x + Math.sin(rad) * CHAIR_TICK.at, y: place.at.y - Math.cos(rad) * CHAIR_TICK.at },
    angle: facing,
  };
}

/** The tick on a chair's rim — a node of its own, so the ring can arrange cards without arranging it. */
function seatTick(seat: string, place: { readonly at: Vec }, facing: number): Node {
  const pose = tickPose(place, facing);
  return node(
    chairTickId(seat),
    Bounded({ bounds: rect(CHAIR_TICK.w, CHAIR_TICK.h) }),
    Surfaced({ surface: chairTickSurface(seat) }),
    Transformable({ at: pose.at, angle: pose.angle }),
  );
}

/** The name under a chair — a billboard, because a caption drawn upside down is a broken picture. */
function seatName(seat: string, place: { readonly at: Vec }, label: string): Node {
  return node(
    chairNameId(seat),
    Bounded({ bounds: rect(CHAIR.caption.w, CHAIR.caption.h) }),
    Labeled({ label, style: SEAT_TEXT }),
    Transformable({ at: { x: place.at.x, y: place.at.y + CHAIR.caption.at } }),
    Oriented({ orientation: "viewer" }),
    Screened({ screened: true }),
  );
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
 * needs one of them by hand has it without looking it up again.
 */
export function seatChairs(
  desk: Node,
  places: readonly { readonly at: Vec; readonly facing?: number }[],
  seats: readonly SeatOfDesk[],
  /** Whether this desk DEALS — on, every held ring is also its owner's hand. Off is every board. */
  hands = false,
): readonly Node[] {
  const layer = chairLayer(desk);
  return places.map((place, i) => {
    const seat = seats[i];
    const chair = seatChair(
      seat?.seat ?? `${i}`,
      place,
      seat ? { ink: seat.ink, hand: hands, ...(seat.name !== undefined ? { name: seat.name } : {}) } : undefined,
    );
    add(layer, chair);
    // A TICK ONLY WHERE THERE IS SOMEBODY TO BE TURNED. An unheld place is an outline of a place
    // and has no owner to be looking anywhere, so it gets no direction either.
    if (seat && place.facing !== undefined) add(layer, seatTick(seat.seat, place, place.facing));
    if (seat?.name !== undefined) add(layer, seatName(seat.seat, place, seat.name));
    return chair;
  });
}

/**
 * THE LAYER THE CHAIRS STAND IN — a node of the desk that holds rings and nothing else.
 *
 * A ring is no more a piece than a disc is. Put among the desk's own children it is one to
 * everything that reads them: an arrangement seats it, a square's `Displacer` sends whoever stands
 * there away, a drop counts it as what is now in the place. On a board that reads as an outline
 * standing on e4 instead of a man; the layer is what makes it impossible rather than merely untrue
 * today.
 *
 * No `Container` on it and no `Acceptor`: nothing arranges what is in it and nothing may be dropped
 * in it, and its children keep the pose `seatChair` wrote. It is made HERE and so is the desk's
 * FIRST child — `seatChairs` is called before the pieces, and equals in the plan are ranked by
 * document order, so every ring is under every card and every man on the board.
 */
export const CHAIR_LAYER = "seat layer";

function chairLayer(desk: Node): Node {
  const standing = byId(desk, CHAIR_LAYER);
  if (standing) return standing;
  const layer = node(CHAIR_LAYER);
  add(desk, layer);
  return layer;
}

/**
 * THE CHAIR, MOVED TO WHERE ITS PLACE NOW IS — the one writer of a seat's position on the felt.
 *
 * A place that can be dragged is a place two screens have to agree about, and they agree by both
 * reading the same `Presence.place`: the owner's finger writes it, the wire carries it, and this
 * puts every screen's own ring where it says. Missing chair is skipped rather than thrown — a desk
 * that seats nobody is still a desk (CANONS §1).
 *
 * The NAME goes with it. It is a node of its own so the ring can arrange cards without arranging
 * words, and a caption left behind would be a player's name lying on the felt they got up from.
 */
export function standChair(desk: Node, seat: string, at: Vec, facing?: number): void {
  const chair = byId(desk, chairId(seat));
  if (!chair) return;
  const own = fieldsOf<TransformableFields>(chair, "Transformable");
  compose(chair, Transformable({ ...(own ?? {}), at }));
  // THE TICK GOES WITH IT, and it goes round with it too: a place is left facing the way its holder
  // was looking when they let it go (`Avatars.handed`), and a tick still pointing at the angle the
  // ring was BUILT with is a picture of a seat nobody is sitting at. Told no facing, it keeps the
  // one it has — a desk that never turns its places has nothing to say here.
  const tick = byId(desk, chairTickId(seat));
  if (tick) {
    const pose = fieldsOf<TransformableFields>(tick, "Transformable");
    const turn = facing ?? pose?.angle ?? 0;
    compose(tick, Transformable({ ...(pose ?? {}), ...tickPose({ at }, turn) }));
  }
  const name = byId(desk, chairNameId(seat));
  if (!name) return;
  const its = fieldsOf<TransformableFields>(name, "Transformable");
  compose(name, Transformable({ ...(its ?? {}), at: { x: at.x, y: at.y + CHAIR.caption.at } }));
}

/**
 * THE PLACE, DRESSED FOR WHAT IS TRUE OF IT — the one writer of the ring's picture.
 *
 * Home and the lock are two facts and one surface, so they are written together: asked separately,
 * the second call would paint over the first and a shut hand would stop being shut the moment its
 * owner looked at it. The state is put on the node as well as into the paint, because both screens
 * read it and a rule nobody can see is a rule a player finds out about by being refused.
 */
export function dressChair(chair: Node, state: { readonly home?: boolean; readonly shut?: boolean }): void {
  const owner = fieldsOf<{ box: string }>(chair, "Owned")?.box;
  if (owner === undefined) return;
  const values = fieldsOf<ValuedFields>(chair, "Valued")?.values ?? {};
  const shut = state.shut ?? handLocked(chair);
  const home = state.home ?? chairHome(chair);
  compose(chair, Valued({ values: { ...values, [CHAIR_HOME]: home ? 1 : 0, ...(HAND_VALUE in values ? { [HAND_LOCK]: shut ? 1 : 0 } : {}) } }));
  // The grip is what stops a hand reaching IN and taking something out, which no `AcceptRule` can
  // say — accept is asked of a drop and a theft is not one. Two atoms, one act, so they cannot come
  // apart. Only a desk that DEALS has a lock to turn: a board's ring holds nothing to steal.
  if (HAND_VALUE in values) {
    if (shut) compose(chair, Grippable({ by: [owner] }));
    else decompose(chair, "Grippable");
  }
  compose(chair, Surfaced({ surface: chairSurface(owner, { home, shut }) }));
}

/** TURN THE LOCK on a place that is also a hand — the home half of the picture is left alone. */
export function setHandLock(chair: Node, locked: boolean): void {
  dressChair(chair, { shut: locked });
}

/** SAY WHETHER ITS OWNER IS LOOKING AT IT — the lock half of the picture is left alone. */
export function setSeatHome(chair: Node, home: boolean): void {
  dressChair(chair, { home });
}
