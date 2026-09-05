// THE PEOPLE AT THE HUB'S DESK — the catalog's `withAvatars` with the network in place of the panes.
//
// The catalog can read every seat's camera because both screens are in one document. Here the other
// screen is on somebody else's phone, so the same four questions — who is here, where do they
// stand, what is in their hand, and are they still looking — are answered by what arrives on the
// wire (`relay`) instead. Everything downstream of the answers is the kit's own and is not restated:
// `placeAvatars` puts the discs on the felt, `growHand`/`placeHand` keep a hand beside its place.
//
// WHY A PRESENCE IS NOT A TREE WRITE. A view that moved is worth nothing a second later, and sent
// as a revision it would beat every real change to the desk in a race the desk must win. So it goes
// through `relay` — the room passes it on and the tree does not move — and each screen puts the
// people it has been told about into its OWN copy of the tree.

import {
  byId,
  placeAvatars,
  registerTextStyle,
  PRESENCE_TEXT,
  type CarryItem,
  type Node,
  type Paint,
  type Presence,
  type PresenceState,
  type PresenceView,
  type SeatPlace,
  type Vec,
} from "game-kit";
import { chairId, growHand, handId, placeHand, setHandLock, standChair } from "@game-presets/desks";
import type { RelayMessage, RosterItem } from "../online/table.js";

/** The name under a disc — the catalog's own, so a desk looks the same in the hub as on the shelf. */
const NAME_STYLE = { family: "ui-sans-serif, system-ui, sans-serif", size: 0.14, weight: 600, lineHeight: 1.2, fill: "text" };

/**
 * THE INKS SEATS ARE MARKED IN, in seat order — one list, read by the mark AND by the avatar.
 *
 * Asked twice they would drift, and then the badge saying who moved a card would be a different
 * colour from the person it is about, which is the one thing a colour on this desk is for.
 */
export const SEAT_INKS = ["accent", "alert", "textMuted", "text"] as const;

/**
 * THE SEATS A HUB DESK IS BUILT WITH — `p1`, `p2`…, each in the ink its own mark is drawn in.
 *
 * The room names seats and the desk seats hands, and the two have to be the same names: a hand
 * standing beside `south` on a desk whose players are `p1` and `p2` belongs to nobody who is here.
 */
export function hubSeats(n: number): readonly { readonly seat: string; readonly ink: Paint }[] {
  return Array.from({ length: n }, (_, i) => ({ seat: `p${i + 1}`, ink: SEAT_INKS[i % SEAT_INKS.length]! }));
}

/** Which of the inks a seat wears — `p1` is the first, `p2` the second, and so on round the desk. */
export function inkOf(seat: string, seats: readonly string[]): Paint {
  const i = seats.indexOf(seat);
  return SEAT_INKS[(i < 0 ? 0 : i) % SEAT_INKS.length]!;
}

/** How often this screen's own view may be told to the room, in ms — a hand moves faster than this. */
export const PRESENCE_EVERY_MS = 100;

export interface HubPeopleOptions {
  /** The tree the people are placed INTO — asked afresh, because a tree arriving from the room replaces it. */
  readonly desk: () => Node;
  /** This screen's own seat, once the room has said. */
  readonly mine: () => string | null;
  /**
   * The seats' own OPENING places at this desk, in seat order — `seatPlaces(n)` on the shelf. Only
   * the opening ones: a player may drag their own chair, after which `placeOf` is the answer.
   */
  readonly places: readonly SeatPlace[];
  /** This screen's camera, as a message. Absent while the glass has not been laid out yet. */
  readonly view: () => PresenceView | undefined;
  /**
   * THE RIM A HAND IS MEASURED AGAINST, when this desk has hands. Absent, it has none — which is
   * every board: a piece on a board is on a square, and a patch of felt beside a player would be a
   * place the game has no word for.
   */
  readonly hands?: number;
  /** Say something that is not a change to the desk. */
  readonly send: (msg: RelayMessage) => void;
  /** The tree was written — this screen has to draw it again. */
  readonly draw: () => void;
  /** The clock, injectable so a test can move it without waiting. */
  readonly now?: () => number;
}

export interface HubPeople {
  /** Everybody placed, this screen told, and my own presence put on the wire if it is time. */
  publish(): void;
  /** The desk came to rest: a hand may have changed size without anybody having moved. */
  settled(): void;
  /** The room said who is here. */
  roster(items: readonly RosterItem[]): void;
  /** Something arrived on the wire — `true` if it was this wiring's. */
  heard(msg: RelayMessage): boolean;
  /** What this screen's own hand is doing, after the mirror has reported it. */
  handed(items: readonly CarryItem[], at: Vec | undefined, done: boolean): void;
  /** This tab stopped being looked at, or started again. */
  state(state: PresenceState): void;
  /** A tap on one's OWN chair turns one's own lock. Anything else is not this wiring's. */
  tapped(piece: Node): boolean;
  /** Everybody the room has named, in seat order. */
  seats(): readonly string[];
  /** Where a seat's place stands RIGHT NOW — the opening one until its owner drags the chair. */
  placeOf(seat: string): SeatPlace | undefined;
}

/** What one person's `relay {kind:"presence"}` carries, beyond the seat the room writes on it. */
interface PresenceWire {
  readonly view: PresenceView;
  readonly pin: Presence["pin"];
  readonly state: PresenceState;
  readonly holding: boolean;
  readonly shut: boolean;
  /**
   * WHERE THIS PERSON'S CHAIR NOW STANDS. On the wire and not left to the tree, because a place is
   * the one thing about this desk both screens must agree on for the hands to line up, and a tree
   * arriving a revision late would put the far reader's patch under the cards it was dealt.
   */
  readonly place?: SeatPlace;
}

export function hubPeople(o: HubPeopleOptions): HubPeople {
  registerTextStyle(PRESENCE_TEXT, NAME_STYLE);
  const now = o.now ?? (() => Date.now());

  /** Everybody the room has named, in seat order — the order the places and the inks are read by. */
  let seated: readonly string[] = [];
  const names = new Map<string, string>();
  /** What the far screens last said about themselves. Nobody's own seat is ever in here. */
  const far = new Map<string, PresenceWire>();

  let myState: PresenceState = "online";
  let myHolding = false;
  /** Whether MY hand is shut — turned by a tap on my own chair, and told to everybody else. */
  let myShut = false;
  /**
   * WHERE A SEAT'S PLACE HAS BEEN MOVED TO — mine by my own finger, everybody else's off the wire.
   * Empty is the desk as it opened, and `o.places` answers.
   */
  const moved = new Map<string, SeatPlace>();

  let lastSent = 0;
  /** What was last put on the wire, so a view that did not move is not news. */
  let lastWire = "";

  const placeOf = (seat: string): SeatPlace | undefined => {
    const i = seated.indexOf(seat);
    return moved.get(seat) ?? (i >= 0 ? o.places[i] : undefined);
  };

  const mineNow = (): Presence | undefined => {
    const seat = o.mine();
    const view = o.view();
    if (!seat || !view) return undefined;
    const place = placeOf(seat);
    return {
      seat,
      name: names.get(seat) ?? seat,
      ink: inkOf(seat, seated),
      state: myState,
      holding: myHolding,
      view,
      ...(place ? { place } : {}),
      // IN ITS OWN RING, AND DRAGGED ALONG BY ITS OWNER'S VIEW — `desk` at the place with a
      // `chase`: at rest the disc stands in the chair, and when its owner pans away from their own
      // seat it slides along the edge of their glass rather than being left behind. Not a screen
      // pin: fastened to a fraction of the glass, every player looking at the middle of the table
      // would be drawn standing on the deck.
      pin: { mode: "desk", at: place?.at ?? { x: 0, y: 0 }, leash: "chase" },
    };
  };

  const everybody = (): Presence[] => {
    const mine = mineNow();
    const all: Presence[] = mine ? [mine] : [];
    for (const seat of seated) {
      const wire = far.get(seat);
      if (!wire) continue;
      const place = placeOf(seat);
      all.push({
        seat,
        name: names.get(seat) ?? seat,
        ink: inkOf(seat, seated),
        state: wire.state,
        holding: wire.holding,
        view: wire.view,
        ...(place ? { place } : {}),
        pin: wire.pin,
      });
    }
    return all;
  };

  /** Whose hand is shut right now — mine from the tap, everybody else's from what they said. */
  const shutOf = (seat: string): boolean => (seat === o.mine() ? myShut : far.get(seat)?.shut === true);

  /**
   * EVERY HAND, RE-DERIVED — its size from what is in it, its place from its own person.
   *
   * In this order and never the other: a hand placed before it grew would be placed as the smaller
   * thing it no longer is, and half of it would be off the rim the moment the card lands.
   */
  const layHands = (): void => {
    if (o.hands === undefined) return;
    const desk = o.desk();
    for (const seat of seated) {
      const hand = byId(desk, handId(seat));
      const chair = byId(desk, chairId(seat));
      if (!hand) continue;
      setHandLock(hand, shutOf(seat));
      growHand(hand);
      // AGAINST THE CHAIR and never against the disc: the patch belongs to the PLACE, so a reader
      // panning their own view leaves it exactly where it was, cards and all.
      if (chair) placeHand(desk, chair, hand, o.hands);
    }
  };

  /** Every chair, stood where its place now is — this screen's own finger and the wire, one line. */
  const layChairs = (): void => {
    const desk = o.desk();
    for (const seat of seated) {
      const place = placeOf(seat);
      if (place) standChair(desk, seat, place.at);
    }
  };

  /**
   * MY OWN VIEW, ON THE WIRE — no oftener than `PRESENCE_EVERY_MS`, and never twice the same.
   *
   * A state change goes at once and does not wait its turn: "this person has left" arriving a tenth
   * of a second late is the same picture, but arriving never — because nothing moved afterwards to
   * carry it — is a person who sits at the desk forever.
   */
  const tell = (force: boolean): void => {
    const mine = mineNow();
    if (!mine) return;
    const wire: PresenceWire = {
      view: mine.view,
      pin: mine.pin,
      state: mine.state,
      holding: mine.holding,
      shut: myShut,
      ...(mine.place ? { place: mine.place } : {}),
    };
    const said = JSON.stringify(wire);
    if (said === lastWire) return;
    const t = now();
    if (!force && t - lastSent < PRESENCE_EVERY_MS) return;
    lastSent = t;
    lastWire = said;
    o.send({ kind: "presence", ...wire });
  };

  /**
   * ONE PUBLICATION AT A TIME. Placing the people writes the tree, writing the tree wakes the
   * screen, and a woken screen reports that its view was touched — which is another publication.
   * Without the latch that is a loop with no floor.
   */
  let placing = false;
  const publish = (force = false): void => {
    if (placing) return;
    const all = everybody();
    placing = true;
    try {
      if (all.length > 0) {
        placeAvatars(o.desk(), all);
        layChairs();
        layHands();
        o.draw();
      }
    } finally {
      placing = false;
    }
    tell(force);
  };

  return {
    publish: () => publish(false),
    settled: () => {
      layChairs();
      layHands();
      o.draw();
    },
    seats: () => seated,
    roster: (items) => {
      seated = items.map((one) => one.seat).filter((seat): seat is string => typeof seat === "string");
      names.clear();
      for (const one of items) if (one.seat) names.set(one.seat, one.name);
      // WHOEVER LEFT THE ROOM LEFT THE DESK — `placeAvatars` sweeps the disc away once nobody says
      // they are here, and it is told by this map being emptied of them.
      for (const seat of [...far.keys()]) if (!seated.includes(seat)) far.delete(seat);
      publish(true);
    },
    heard: (msg) => {
      if (msg.kind !== "presence") return false;
      const seat = msg.from;
      // A SEAT IS THE ROOM'S TO WRITE, never the sender's, and my own never arrives from outside.
      if (typeof seat !== "string" || seat === o.mine()) return true;
      const wire = msg as unknown as PresenceWire;
      if (!wire.view || !wire.pin) return true;
      far.set(seat, {
        view: wire.view,
        pin: wire.pin,
        state: wire.state ?? "online",
        holding: wire.holding === true,
        shut: wire.shut === true,
        ...(wire.place ? { place: wire.place } : {}),
      });
      // THEY MOVED THEIR OWN CHAIR, and this screen's copy of the desk has to follow: a place is
      // the anchor a hand is measured against, so a ring left behind is a patch left behind.
      if (wire.place) moved.set(seat, wire.place);
      publish(false);
      return true;
    },
    handed: (items, at, done) => {
      const seat = o.mine();
      if (!seat) return;
      // A HAND WITH SOMETHING IN IT IS A STATE, and one's own chair is not "something".
      const carryingSeat = items.some((it) => it.id === chairId(seat));
      // WHERE THE FINGER PUT THE CHAIR IS WHERE I NOW SIT — written straight into the place, in the
      // desk's own units, which is what a carry speaks and what a place is kept in. The facing is
      // NOT touched: dragging a chair moves a seat, it does not turn it round.
      const was = placeOf(seat);
      if (carryingSeat && at && was) moved.set(seat, { at, facing: was.facing });
      myHolding = done ? false : !carryingSeat;
      if (carryingSeat || done) publish(true);
    },
    state: (state) => {
      myState = state;
      publish(true);
    },
    tapped: (piece) => {
      const seat = o.mine();
      // ...AND THE OWNER IS THE ONE WHO SHUTS IT. On the CHAIR, because the chair is the thing on
      // this desk that means "you" — nothing a finger does reaches the disc at all.
      if (o.hands === undefined || !seat || piece.id !== chairId(seat)) return false;
      myShut = !myShut;
      publish(true);
      return true;
    },
    placeOf,
  };
}
