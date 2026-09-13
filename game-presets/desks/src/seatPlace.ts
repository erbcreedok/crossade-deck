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
// So the two are separate things and the chair is the permanent one. It is the seat design's ARCH:
// a half-round front that looks INTO the desk and a flat back where its owner sits, drawn in the
// place's own ink over a black keyline — and it is the whole of what "somebody sits here" looks
// like. The shape itself says which way the place looks, so the chair wears no tick.
//
// AND THE CHAIR IS THE HAND. On a desk that deals, a player's cards lie in their own place
// (`handZone.ts` says what a hand IS and in which POSE it lies), so there is one node saying where
// somebody sits and one saying what they hold, and they cannot come apart. The chair does not grow
// to what it holds: the cards lie AROUND the arch, beside it or in front of it — and, for the
// poses that tuck them away, BEHIND it, which is why the arch's face is a node of its own drawn
// over the cards (`chairLidId`).
//
// AN EMPTY CHAIR IS A DIFFERENT PICTURE and not a dimmer one: a dashed outline in cream, with no
// face, no keyline and no name. Dashed because a place nobody holds is an outline of a place — the
// same thing a plan drawing says with a dashed line — and drawing it in some seat's colour would be
// claiming it for a player who is not there. Nothing may be put in one either: an unheld place is
// nobody's hand.
//
// ONE'S OWN PLACE DOES NOT CHANGE COLOUR. The rim is always the place's own ink, or in a room of
// four nobody could tell their colour from the chair. "This is me" is a SEPARATE gold ring OUTSIDE
// the keyline (`chairRingId`), written by the screen that knows whose it is (`dressChair`).
//
// It is added to the desk BEFORE the pieces, so the document order that ranks equals in the plan
// puts it under every card and every man on the board.
//
// BUT ITS OWNER MAY MOVE IT, and only its owner. Where a person sits is the one thing about a desk
// that is theirs to decide, and it is decided by dragging the CHAIR — with their cards riding along
// in it — never by dragging the disc, which is a reading of their camera and not a thing. The
// refusal is `mayTake`, not `Grippable`: a grip cuts the whole SUBTREE, so a chair gripped to its
// owner would be a hand nobody else could ever be dealt from, which is what the LOCK is for and not
// what a place is.

import {
  Acceptor,
  add,
  Bounded,
  byId,
  Carry,
  compose,
  Container,
  decompose,
  Draggable,
  Grabber,
  Grippable,
  grippableBy,
  installStockGrains,
  Inviting,
  isPlaceGrip,
  node,
  NO_COAT,
  Owned,
  Reaching,
  registerSurface,
  remove,
  setPresencePaints,
  Surfaced,
  Transformable,
  Valued,
  fieldsOf,
  type Node,
  type Paint,
  type Shape,
  type TransformableFields,
  type ValuedFields,
  type Vec,
} from "game-kit";
import { PULL, zoneKeen } from "./felt.js";
import { ARCH_R, HAND_LAYOUT, HAND_LOCK, HAND_VALUE, handAccept, handLocked, installHandPoses, layHand } from "./handZone.js";
import { dressMarks, fitMarks } from "./handBar.js";

/**
 * THE SEAT DESIGN'S OWN COLOURS — content, not a theme: the wood of a chair, the keyline round
 * it, its gold and its cream are the same on a light desk and a dark one, the way a red suit
 * stays red. A theme token here was a chair that went brown and unreadable on a light desk.
 */
export const SEAT_LOOK = {
  /** The keyline round every chair and every disc. */
  black: "#0b0704",
  /** The one gold: the ring that says "this is me", the marks, the lit control. */
  gold: "#f2c14e",
  /** The cream of every word on a plate and every initial in a disc. */
  ink: "#f5ead0",
  /** The wood of the chair, top to bottom — half strength, so the felt shows through. */
  woodHi: "#6b4d2c",
  woodLo: "#1d1409",
  /** The dashed outline of a place nobody holds. */
  cream: "#cdb98f",
  /** The ground of a disc, top to bottom — the design's dark green under the initials. */
  discHi: "#3d4a3a",
  discLo: "#1b2418",
} as const;

/**
 * HOW BIG A CHAIR IS, in units — the design's 74px arch beside its 34px cards (`ARCH_R`), and the
 * design's 3px lines over that arch.
 */
export const CHAIR = { d: ARCH_R * 2, line: 0.09 };

/**
 * THE ARCH — a half-round front and a flat back, the round side at -y (into the desk when the
 * chair stands at its facing) and the flat side at +y, where its owner sits. Drawn about the
 * centre of the round part, which is where the disc sits.
 */
export function arch(r: number): Shape {
  const k = 0.5523 * r;
  return {
    start: { x: -r, y: 0 },
    segments: [
      { c1: { x: -r, y: -k }, c2: { x: -k, y: -r }, to: { x: 0, y: -r } },
      { c1: { x: k, y: -r }, c2: { x: r, y: -k }, to: { x: r, y: 0 } },
      { to: { x: r, y: r } },
      { to: { x: -r, y: r } },
      { to: { x: -r, y: 0 } },
    ],
  };
}

/** How far the rim is from the chair's centre — the arch's radius. The marks stand off it. */
export function chairReach(_chair?: Node): number {
  return ARCH_R;
}

/** The mark a chair wears so a desk can find its own again — an id is a name and nothing parses one. */
export const CHAIR_VALUE = "chair";

/** Whether its owner is looking AT this place right now. `1` is home; the disc then stands in the arch. */
export const CHAIR_HOME = "home";

/**
 * WHETHER THE CHAIR IS PINNED — `1` and nobody moves it, its owner included. A state of its own,
 * apart from the lock: a player may open their cards and still not want to be moved, or shut them
 * and not mind. Written on the chair, so both screens read one truth.
 */
export const CHAIR_PIN = "pin";

/** The id a chair answers to. Built here, never parsed (`guard.id-is-opaque`). */
export function chairId(seat: string): string {
  return `seat ${seat}`;
}

/**
 * THE ID OF THE ARCH'S FACE — the wood and the ink rim, a node of its own drawn OVER the chair and
 * so over the cards in it: a tucked card lies behind it and shows only its tip. Not a child of the
 * chair, which arranges what is in it as cards.
 */
export function chairLidId(seat: string): string {
  return `${chairId(seat)} lid`;
}

/** THE ID OF THE GOLD RING that says "this is me" — under the chair, outside its keyline. */
export function chairRingId(seat: string): string {
  return `${chairId(seat)} mine`;
}

/** The chair's own surface — the keyline plate of a held place, or the dashed outline of a free one. */
export function chairSurface(seat?: string): string {
  return seat === undefined ? "desk.seat.empty" : `desk.seat.${seat}`;
}

/** The face of a held chair, in its owner's ink. */
export function chairLidSurface(seat: string): string {
  return `desk.seat.${seat}.lid`;
}

const RING_SURFACE = "desk.seat.mine";

/** Whether this node is a chair. Read off what it SAYS, never off the shape of its id. */
export function isChair(n: Node): boolean {
  return Boolean(fieldsOf<ValuedFields>(n, "Valued")?.values[CHAIR_VALUE]);
}

/** Whether this place's owner is looking at it. Read off the node, so both screens read one truth. */
export function chairHome(n: Node): boolean {
  return fieldsOf<ValuedFields>(n, "Valued")?.values[CHAIR_HOME] === 1;
}

/** Whether the chair is pinned. A chair that never had the field is free, which is what a bare one is. */
export function chairPinned(n: Node): boolean {
  return fieldsOf<ValuedFields>(n, "Valued")?.values[CHAIR_PIN] === 1;
}

/** PIN THE CHAIR, or free it — the one writer of the field. The cards in it answer to the lock alone. */
export function setChairPin(chair: Node, pinned: boolean): void {
  const own = fieldsOf<ValuedFields>(chair, "Valued")?.values ?? {};
  compose(chair, Valued({ values: { ...own, [CHAIR_PIN]: pinned ? 1 : 0 } }));
}

/**
 * ЧТО ЭТОТ ПАЛЕЦ ВПРАВЕ ПОДНЯТЬ — всё разрешение места одной строкой, и её живая страница отдаёт в
 * `liveTable.may`.
 *
 * СТУЛЬЯ ДВИГАЮТ ВСЕ, И ЭТО НЕ ОПЛОШНОСТЬ: люди рассаживаются за столом сообща — подвинуть соседа,
 * чтобы влез ещё один, обычное застольное дело, и запрещать его значит заставлять просить хозяина.
 *
 * ПИН — ЕДИНСТВЕННЫЙ ЗАПРЕТ, И ОН ЛИЧНЫЙ: приколотый стул не сдвинет никто, включая админа; сам
 * хозяин стула двигает его всегда — пин поставлен от чужих рук, а не от своих. Снять чужой пин
 * может админ (`piece:pin`), и это уже другое действие, не перетаскивание.
 *
 * Правило стула не может быть «хваткой» (`grippableBy`): хватка режет поддерево, и прикреплённые к
 * месту карты стали бы недосягаемы для всех остальных — рука, из которой нельзя сдать, не рука.
 */
export function mayTake(n: Node, seat: string): boolean {
  const owner = isChair(n) || isPlaceGrip(n) ? fieldsOf<{ box: string }>(n, "Owned")?.box : undefined;
  if (isChair(n)) {
    if (owner !== undefined && owner !== "" && owner === seat) return true;
    return !chairPinned(n);
  }
  // РУЧКА РУКИ — ХОЗЯЙСКАЯ (`handRule`): язычок, которым поднимают руку целиком, говорит, чья она,
  // и рука, поднятая соседом целиком, — это рука, отданная в чужие руки.
  if (owner !== undefined && owner !== "" && owner !== seat) return false;
  return grippableBy(n, seat);
}

/**
 * Register what a chair points at by name. Idempotent — a re-render calls it again.
 *
 * A held chair is two records: the black keyline plate the chair itself wears, and the face drawn
 * over it — the wood, top to bottom at half strength so the felt shows through, with the place's
 * ink as the rim inside the keyline. A free place is one dashed outline and nothing else.
 */
export function installSeatArt(seat?: string, ink?: Paint): void {
  // THE SIDE RULES a hidden hand names (`Poser.others: "back"`) are a registry the kit ships and
  // the consumer installs; a desk that forgot would hide nothing, in silence.
  installStockGrains();
  installHandPoses();
  // THE DISC WEARS THE SAME KEYLINE AS THE CHAIR, and the design's own ground: the kit holds no
  // colour of its own, so the seat design hands its paints over here, once, for every disc.
  setPresencePaints({ keyline: SEAT_LOOK.black, groundHi: SEAT_LOOK.discHi, groundLo: SEAT_LOOK.discLo, ink: SEAT_LOOK.ink, gold: SEAT_LOOK.gold });
  registerSurface(chairSurface(), {
    layers: [],
    stroke: { color: SEAT_LOOK.cream, width: CHAIR.line, opacity: 0.5, dash: { on: 0.24, off: 0.16 } },
  });
  registerSurface(RING_SURFACE, { layers: [{ paint: SEAT_LOOK.gold }] });
  if (seat === undefined || ink === undefined) return;
  registerSurface(chairSurface(seat), { layers: [{ paint: SEAT_LOOK.black }] });
  registerSurface(chairLidSurface(seat), {
    layers: [{ gradient: { stops: [{ at: 0, paint: SEAT_LOOK.woodHi }, { at: 1, paint: SEAT_LOOK.woodLo }], angle: 90 }, opacity: 0.5 }],
    stroke: { color: ink, width: CHAIR.line, alignment: 1 },
  });
}

/** Who sits at a chair — absent altogether is a place nobody holds. */
export interface SeatLook {
  readonly ink: Paint;
  /**
   * WHETHER THIS DESK DEALS. On, the chair is also its owner's hand and cards may be put in it; off,
   * it is the place alone, which is every board — a man is on a square and nowhere else, and a
   * patch of felt beside a player would be a place the game has no word for.
   */
  readonly hand?: boolean;
}

/**
 * ONE CHAIR, standing at one place — and, on a desk that deals, one HAND.
 *
 * The hand atoms are the whole of what "cards go in here" means: an arrangement (the pose), a rule
 * about what may come in, a grab that takes one card at a time, a reach so a release NEAR the chair
 * still counts as into it, and the light it wears while a hand is aimed at it.
 *
 * TURNED TO ITS OWNER. The arch has a front and a back, and the cards lie in the chair's own frame
 * (a fan in front, a stack on the right): the chair stands at `-facing` — the disc's own turn — so
 * its round front looks into the desk and what lies in it lies level on its owner's glass, one
 * number on one node inherited by every card. A place nobody holds has no owner to be square to and
 * stands as built.
 */
export function seatChair(seat: string, place: { readonly at: Vec; readonly facing?: number }, look?: SeatLook): Node {
  installSeatArt(seat, look?.ink);
  return node(
    chairId(seat),
    Bounded({ bounds: arch(ARCH_R) }),
    Surfaced({ surface: look ? chairSurface(seat) : chairSurface() }),
    Transformable({ at: place.at, ...(look && place.facing !== undefined ? { angle: -place.facing } : {}) }),
    Valued({ values: { [CHAIR_VALUE]: 1, [CHAIR_HOME]: 0, ...(look?.hand ? { [HAND_VALUE]: 1, [HAND_LOCK]: 0 } : {}) } }),
    // STAY where the finger let go: a place is wherever its owner put it, and there is no target to
    // refuse it — a chair that flew home on every release could not be moved at all.
    Draggable({ onReject: "stay" }),
    // ALONG THE SUKNO, never off it. A chair is slid the way a beer mat is: no pop, no bank, no
    // picture of a landing under it and no flight when it is let go of in motion — the three things
    // a carry does for a PIECE, and a place asks none of them.
    Carry({ ride: "felt" }),
    // WHOSE PLACE IT IS, said on the node — `mayTake` reads it, and so does everything else that
    // has to know a chair from a card. A place nobody holds is owned by nobody and moved by nobody.
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

/** The face over a held chair — the wood and the rim, standing where the chair stands. */
function seatLid(seat: string, place: { readonly at: Vec; readonly facing?: number }): Node {
  return node(
    chairLidId(seat),
    Bounded({ bounds: arch(ARCH_R - CHAIR.line) }),
    Surfaced({ surface: chairLidSurface(seat) }),
    Transformable({ at: place.at, ...(place.facing !== undefined ? { angle: -place.facing } : {}) }),
  );
}

/** One seat of a desk, as the maps declare them. */
export interface SeatOfDesk {
  readonly seat: string;
  readonly ink: Paint;
  /** A short name — the presence carries it under the disc; the chair itself wears no caption. */
  readonly name?: string;
}

/**
 * EVERY CHAIR OF A DESK, put on it — one per place, in the order the places came in, each with its
 * face over it and its marks beside it.
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
  /** Whether this desk DEALS — on, every held chair is also its owner's hand. Off is every board. */
  hands = false,
): readonly Node[] {
  const layer = chairLayer(desk);
  return places.map((place, i) => {
    const seat = seats[i];
    const chair = seatChair(seat?.seat ?? `${i}`, place, seat ? { ink: seat.ink, hand: hands } : undefined);
    add(layer, chair);
    // THE FACE OVER THE CHAIR, for a held one: a free place is its outline and nothing else.
    if (seat) {
      add(layer, seatLid(seat.seat, place));
      fitChair(desk, seat.seat);
    }
    return chair;
  });
}

/**
 * THE LAYER THE CHAIRS STAND IN — a node of the desk that holds chairs and their furniture and
 * nothing else.
 *
 * A chair is no more a piece than a disc is. Put among the desk's own children it is one to
 * everything that reads them: an arrangement seats it, a square's `Displacer` sends whoever stands
 * there away, a drop counts it as what is now in the place. On a board that reads as an outline
 * standing on e4 instead of a man; the layer is what makes it impossible rather than merely untrue
 * today.
 *
 * No `Container` on it and no `Acceptor`: nothing arranges what is in it and nothing may be dropped
 * in it, and its children keep the pose `seatChair` wrote. It is made HERE and so is the desk's
 * FIRST child — `seatChairs` is called before the pieces, and equals in the plan are ranked by
 * document order, so every chair is under every card and every man on the board.
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
 * puts every screen's own chair where it says. Missing chair is skipped rather than thrown — a desk
 * that seats nobody is still a desk (CANONS §1).
 *
 * The furniture goes with it (`fitChair`): a face left behind would be a chair drawn twice.
 */
export function standChair(desk: Node, seat: string, at: Vec, facing?: number): void {
  const chair = byId(desk, chairId(seat));
  if (!chair) return;
  const own = fieldsOf<TransformableFields>(chair, "Transformable");
  // ...AND ROUND WITH THE FACING, arch and cards together: a place let go of under a turned camera
  // faces the way its holder looked.
  compose(chair, Transformable({ ...(own ?? {}), at, ...(facing !== undefined ? { angle: -facing } : {}) }));
  fitChair(desk, seat);
}

/**
 * THE CHAIR'S FURNITURE, PUT WHERE THE CHAIR IS — the face over it, the gold ring under it and the
 * marks beside it, wherever the chair now stands and whichever way it faces. The ONE writer of
 * where they stand, called by every move and every re-dressing.
 */
export function fitChair(desk: Node, seat: string): void {
  const chair = byId(desk, chairId(seat));
  if (!chair) return;
  const pose = fieldsOf<TransformableFields>(chair, "Transformable");
  const at = pose?.at ?? { x: 0, y: 0 };
  const angle = pose?.angle ?? 0;
  for (const id of [chairLidId(seat), chairRingId(seat)]) {
    const piece = byId(desk, id);
    if (!piece) continue;
    const own = fieldsOf<TransformableFields>(piece, "Transformable");
    compose(piece, Transformable({ ...(own ?? {}), at, angle }));
  }
  layHand(chair);
  dressMarks(desk, seat);
  fitMarks(desk, seat, at, angle);
}

/**
 * THE PLACE, DRESSED FOR WHAT IS TRUE OF IT — the one writer of the chair's states.
 *
 * Home and the lock are two facts on the node, and they are written together: asked separately,
 * the second call would overwrite the first. Both screens read them off the node — a rule nobody
 * can see is a rule a player finds out about by being refused. Neither changes the chair's paint:
 * home is said by the disc standing in the arch, the lock by the mark beside it (`dressMarks`).
 *
 * `mine` is the one thing about a chair that is a fact of the SCREEN and not of the desk: it puts
 * the gold ring outside the keyline, and only the screen that knows whose it is writes it.
 */
export function dressChair(chair: Node, state: { readonly home?: boolean; readonly shut?: boolean; readonly mine?: boolean }): void {
  const owner = fieldsOf<{ box: string }>(chair, "Owned")?.box;
  if (owner === undefined) return;
  const values = fieldsOf<ValuedFields>(chair, "Valued")?.values ?? {};
  const shut = state.shut ?? handLocked(chair);
  const home = state.home ?? chairHome(chair);
  compose(chair, Valued({ values: { ...values, [CHAIR_HOME]: home ? 1 : 0, ...(HAND_VALUE in values ? { [HAND_LOCK]: shut ? 1 : 0 } : {}) } }));
  // The grip is what stops a hand reaching IN and taking something out, which no `AcceptRule` can
  // say — accept is asked of a drop and a theft is not one. Two atoms, one act, so they cannot come
  // apart. Only a desk that DEALS has a lock to turn: a board's chair holds nothing to steal.
  if (HAND_VALUE in values) {
    if (shut) compose(chair, Grippable({ by: [owner] }));
    else decompose(chair, "Grippable");
  }
  if (state.mine !== undefined && chair.parent) {
    const layer = chair.parent;
    const ring = byId(layer, chairRingId(owner));
    if (state.mine && !ring) {
      const pose = fieldsOf<TransformableFields>(chair, "Transformable");
      const made = node(
        chairRingId(owner),
        Bounded({ bounds: arch(ARCH_R + CHAIR.line) }),
        Surfaced({ surface: RING_SURFACE }),
        Transformable({ at: pose?.at ?? { x: 0, y: 0 }, angle: pose?.angle ?? 0 }),
      );
      // UNDER THE CHAIR: a ring outside the keyline is drawn before the plate it surrounds.
      add(layer, made);
      const kids = layer.children;
      kids.splice(kids.indexOf(chair), 0, ...kids.splice(kids.indexOf(made), 1));
    } else if (!state.mine && ring) {
      remove(layer, ring);
    }
  }
  const desk = rootOf(chair);
  if (desk) dressMarks(desk, owner);
}

function rootOf(n: Node): Node | undefined {
  let at: Node = n;
  while (at.parent) at = at.parent;
  return at === n ? undefined : at;
}

/** TURN THE LOCK on a place that is also a hand — the home half of the picture is left alone. */
export function setHandLock(chair: Node, locked: boolean): void {
  dressChair(chair, { shut: locked });
}

/** SAY WHETHER ITS OWNER IS LOOKING AT IT — the lock half of the picture is left alone. */
export function setSeatHome(chair: Node, home: boolean): void {
  dressChair(chair, { home });
}
