// THE PEOPLE AT A LIVE DESK — the wiring every live page needs and none should write twice.
//
// `Live/Avatars` built it once to teach the pin and the leash, and `Live/Hands` built it again to
// hang a patch of felt off each disc. Then every live desk on the shelf wanted the same thing —
// cards, chess, nardy — and a third and a fourth copy of it would be four answers to "where does
// this person stand", which on a shared desk is the one question two screens may not disagree about.
//
// So it lives here, beside `liveScreens.ts` and for its reason: a cursor is what a hand is DOING and
// an avatar is the person doing it, both belong to every live page, and a bug in either is one bug.
//
// WHAT A PAGE STILL DECIDES is only what it is a page about: which seats, where their places are on
// ITS felt, and whether this desk has hands at all. A board has none — a chess piece is on a square
// and nowhere else — and a card table has one per person.

import {
  byId,
  placeAvatars,
  registerTextStyle,
  watchPresence,
  PRESENCE_TEXT,
  type CarryItem,
  type Node,
  type Paint,
  type Presence,
  type PresenceState,
  type PresenceView,
  type SeatPlace,
  type Vec,
} from "../../src/index.js";
import { type Screen } from "./liveScreens.js";
import { chairId, growHand, handId, placeHand, setHandLock, standChair } from "@game-presets/desks";
import { currentSettings, onSettingsChange } from "../devtools/catalogSettings.js";
import { loadPage, type PageText } from "../locales/pages.js";

/** The name under a disc: small, quiet and the desk's own face. */
const NAME_STYLE = { family: "ui-sans-serif, system-ui, sans-serif", size: 0.14, weight: 600, lineHeight: 1.2, fill: "text" };

/** One place at a live desk: who sits there and in what colour they are drawn. */
export interface AvatarSeat {
  readonly seat: string;
  readonly ink: Paint;
}

export interface AvatarsOptions {
  /** The one tree the screens share — the people are placed INTO it, like everything else on it. */
  readonly desk: Node;
  readonly seats: readonly AvatarSeat[];
  /** The screens, as the page fills them in — read live, because a pane exists before its scene. */
  readonly screens: readonly Screen[];
  /** The prose bundle whose `docs.<page>.name.<seat>` the discs wear. */
  readonly page: string;
  /**
   * THE SEAT'S OWN PLACE at this desk — the shelf's `seatPlaces(n)`, by index, and the ANCHOR of
   * everything below: the chair stands there, the hand stands beside it, and `liveTable`'s idle
   * glide returns a wandered view to it. Only the OPENING place: its owner may drag their chair
   * somewhere else, after which `placeOf` is the answer and this list is only where they started.
   * Absent, no `Presence` here carries a `place` and nothing about idle return changes: this is the
   * same desk without a seat, not a broken one.
   */
  readonly places?: readonly SeatPlace[];
  /**
   * THE RIM A HAND IS MEASURED AGAINST, when this desk has hands. Absent, it has none — which is
   * every board on the shelf: a piece on a board is on a square, and a patch of felt beside a
   * player would be a place the game has no word for.
   */
  readonly hands?: number;
  /** The story's own element — the listeners below are dropped when it leaves the document. */
  readonly wall: HTMLElement;
}

export interface Avatars {
  /** Everybody placed, and every screen told — latched, so a placement cannot start another. */
  readonly publish: () => void;
  /** The desk came to rest: the furniture may have changed size without anybody having moved. */
  readonly settled: () => void;
  /** What the mirror's `hand` report means to the PEOPLE, after the screens have been told. */
  readonly handed: (seat: string, items: readonly CarryItem[], at: Vec | undefined, done: boolean) => void;
  /** A finger came down in this pane — the stand-in for "mine" where one tree serves two screens. */
  readonly claim: (seat: string) => void;
  /** A tap on one's OWN chair turns one's own lock. Anything else is not this wiring's. */
  readonly tapped: (seat: string, piece: Node) => boolean;
  /** Where a seat's place stands RIGHT NOW — the opening one until its owner drags the chair. */
  readonly placeOf: (seat: string) => SeatPlace | undefined;
}

/**
 * THE PEOPLE, WIRED INTO A LIVE PAGE — one call, and the page hands its own pieces back in.
 *
 * Everything below is the two pages' own wiring with the page-specific parts lifted out. It is
 * deliberately not a scene: a page builds its panes and its `grabScene` exactly as it did before,
 * and this only answers the four questions a desk with people on it grows — who is here, where do
 * they stand, what does their hand look like, and who just touched the glass.
 */
export function withAvatars(o: AvatarsOptions): Avatars {
  registerTextStyle(PRESENCE_TEXT, NAME_STYLE);
  /**
   * WHERE EACH SEAT'S PLACE STANDS RIGHT NOW — the opening one, until its owner drags their chair.
   *
   * The one truth on this page about who sits where: the chair is put here, the hand is measured
   * against here, the idle glide returns here, and the far screen reads it off `Presence.place`.
   * Kept beside the tree rather than read out of it, because a tree is rebuilt and a place is not.
   */
  const placed = new Map<string, SeatPlace>(
    o.seats.flatMap(({ seat }, i) => (o.places?.[i] ? [[seat, o.places[i]!] as [string, SeatPlace]] : [])),
  );
  const states = new Map<string, PresenceState>(o.seats.map(({ seat }) => [seat, "online"]));
  const holding = new Set<string>();
  /** Whose hand is shut. Turned by its owner's tap, and only on a desk that has hands at all. */
  const shut = new Map<string, boolean>(o.seats.map(({ seat }) => [seat, false]));
  let mine: string = o.seats[0]!.seat;

  /**
   * THE PAGE'S OWN WORDS, FETCHED BY THE PAGE. The catalog hands a story the CHROME's bundle; a
   * page's prose is loaded when somebody opens it, and two player names are that page's prose —
   * put in the chrome they would be downloaded by every reader of every other page.
   *
   * Until they arrive the key itself stands in, which is what the catalog does everywhere else: a
   * name a moment late is better than a disc that waits for a network round trip to exist.
   */
  let said: PageText | undefined;
  const words = (key: string): string => (said ? said.text(key as Parameters<PageText["text"]>[0]) : key);
  const readNames = (): void => {
    const locale = currentSettings().text.locale;
    void loadPage(o.page, locale).then((text) => {
      if (currentSettings().text.locale !== locale) return;
      said = text;
      publish();
    });
  };

  /** What a screen's camera is worth as a message — see `PresenceView` on why the scale is total. */
  const viewOf = (one: Screen): PresenceView | undefined => {
    const camera = one.scene?.camera;
    if (!camera) return undefined;
    return { target: camera.target, zoom: camera.pixelsPerUnit, rotation: camera.rotation, glass: camera.glass };
  };

  const presences = (): Presence[] =>
    o.screens.flatMap((one) => {
      const view = viewOf(one);
      if (!view) return [];
      // THE SEAT'S OWN PLACE, by the SEAT and not by the screen's position in the array — a screen
      // is filled in as a page opens its panes, and the order they arrive in is not the order the
      // seats were declared in.
      const place = placed.get(one.seat);
      return [
        {
          seat: one.seat,
          name: words(`docs.${o.page}.name.${one.seat}`),
          ink: one.ink,
          state: states.get(one.seat)!,
          holding: holding.has(one.seat),
          view,
          ...(place ? { place } : {}),
          // IN ITS OWN RING, AND DRAGGED ALONG BY ITS OWNER'S VIEW — `desk` at the place with a
          // `chase`: at rest the disc stands in the chair, and when its owner pans away from their
          // own seat it slides along the edge of their glass rather than being left behind. Not a
          // screen pin: fastened to a fraction of the glass, every player looking at the middle of
          // the table would be drawn standing on the deck. Not a lock either — a lock moves the
          // CAMERA, and a reader may look wherever they like.
          pin: { mode: "desk", at: place?.at ?? { x: 0, y: 0 }, leash: "chase" },
        },
      ];
    });

  /**
   * EVERY HAND, RE-DERIVED — its size from what is in it, its place from its own person.
   *
   * In this order and never the other: the side with the most room is measured with the patch at
   * the size it is about to be drawn at, and a hand placed before it grew would be placed as the
   * smaller thing it no longer is — half of it off the rim the moment the card lands.
   */
  const layHands = (): void => {
    if (o.hands === undefined) return;
    for (const { seat } of o.seats) {
      const hand = byId(o.desk, handId(seat));
      const chair = byId(o.desk, chairId(seat));
      if (!hand) continue;
      setHandLock(hand, shut.get(seat) === true);
      growHand(hand);
      // AGAINST THE CHAIR and never against the disc: the patch belongs to the PLACE, so a reader
      // panning their own view leaves it exactly where it was, cards and all.
      if (chair) placeHand(o.desk, chair, hand, o.hands);
    }
  };

  /** Every chair, stood where its place now is — the owner's drag written back onto both screens. */
  const layChairs = (): void => {
    for (const { seat } of o.seats) {
      const place = placed.get(seat);
      if (place) standChair(o.desk, seat, place.at);
    }
  };

  const tellScreens = (): void => {
    for (const one of o.screens) one.scene?.setRoot(o.desk);
  };

  /**
   * ONE PUBLICATION AT A TIME, and only when something is actually different.
   *
   * Placing the people writes the tree, writing the tree wakes every screen, and a woken screen
   * reports that its view was touched — which is another publication. Without the latch that is
   * a loop with no floor, and it hangs the page before the first frame; without the comparison it
   * is a whole tree rebuilt per pointer event for a desk where nobody moved.
   */
  let placing = false;
  let last = "";
  const publish = (): void => {
    if (placing) return;
    const all = presences();
    if (all.length === 0) return;
    const now = JSON.stringify([all, [...shut]]);
    if (now === last) return;
    last = now;
    placing = true;
    try {
      placeAvatars(o.desk, all);
      layChairs();
      layHands();
      tellScreens();
    } finally {
      placing = false;
    }
  };

  /**
   * THE DESK CAME TO REST — the one moment a hand can have changed size without anybody moving.
   *
   * Published without the latch above, because nothing about the PEOPLE changed and the latch
   * compares people: a card landing in a hand is a change to the furniture alone.
   */
  const settled = (): void => {
    layChairs();
    layHands();
    tellScreens();
  };

  /** A hidden tab is nobody's screen, so everybody sitting in it goes quiet at once. */
  const stopWatching = watchPresence(document, (state) => {
    for (const { seat } of o.seats) states.set(seat, state);
    publish();
  });
  const stopFollowing = onSettingsChange(() => readNames());
  readNames();

  // The story's element is thrown away whole on a re-render; the two listeners above are not, and
  // an unremoved one goes on placing avatars into a tree nobody is drawing.
  const observer = new MutationObserver(() => {
    if (o.wall.isConnected) return;
    stopWatching();
    stopFollowing();
    observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return {
    publish,
    settled,
    handed: (seat, items, at, done) => {
      // A HAND WITH SOMETHING IN IT IS A STATE, and one's own chair is not "something".
      const carryingSeat = items.some((it) => it.id === chairId(seat));
      // WHERE THE FINGER PUT THE CHAIR IS WHERE THIS PERSON NOW SITS — written straight into the
      // place, in the desk's own units, which is what a carry speaks and what a place is kept in.
      // The facing is NOT touched: dragging a chair moves a seat, it does not turn it round.
      const was = placed.get(seat);
      if (carryingSeat && at && was) placed.set(seat, { at, facing: was.facing });
      if (done) holding.delete(seat);
      else if (!carryingSeat) holding.add(seat);
      if (carryingSeat || done) publish();
    },
    claim: (seat) => {
      if (mine === seat) return;
      mine = seat;
      publish();
    },
    tapped: (seat, piece) => {
      // ...AND THE OWNER IS THE ONE WHO SHUTS IT. On the CHAIR, because the chair is the thing on
      // this desk that means "you": it is the only node a reader may pick up that is theirs, so it
      // is the only one a tap can be about without asking whose it is. Not on the disc — nothing a
      // finger does reaches the disc at all.
      if (o.hands === undefined || piece.id !== chairId(seat)) return false;
      shut.set(seat, shut.get(seat) !== true);
      publish();
      return true;
    },
    placeOf: (seat) => placed.get(seat),
  };
}
