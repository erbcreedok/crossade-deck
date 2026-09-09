// THE PEOPLE AT A LIVE DESK — the wiring every live page needs and none should write twice.
//
// `Live/Avatars` built it once to teach where a person stands, and `Live/Hands` built it again to
// hang a patch of felt off each disc. Then every live desk on the shelf wanted the same thing —
// cards, chess, nardy — and a third and a fourth copy of it would be four answers to "where does
// this person stand", which on a shared desk is the one question two screens may not disagree about.
//
// So it lives here, beside `presence.ts` and for its reason: a cursor is what a hand is DOING and
// an avatar is the person doing it, both belong to every live page, and a bug in either is one bug.
//
// WHAT A PAGE STILL DECIDES is only what it is a page about: which seats, where their places are on
// ITS felt, and whether this desk has hands at all. A board has none — a chess piece is on a square
// and nowhere else — and a card table has one per person.
//
// WHO CARRIES A PRESENCE ACROSS. The catalog reads every seat's camera synchronously, because both
// screens are in one document; the hub reads only its own, because the other seat is on somebody
// else's phone and its view arrives over a relay, throttled. Both pictures are built out of the same
// `Presence[]` — only how a `Presence` gets here differs — so that difference is the one thing a
// caller plugs in (`AvatarsTransport`), and everything downstream of it is this file's alone.

import { byId, type Node } from "../core/node.js";
import { type Paint } from "../core/paint.js";
import { type Vec } from "../core/transform.js";
import { type CarryItem } from "./animator/index.js";
import { type SeatPlace } from "./liveTable.js";
import { registerTextStyle } from "./textStyles.js";
import { isHome, placeAvatars, PRESENCE_GLYPH, PRESENCE_TEXT, type Presence } from "./presence.js";
import { barPress, chairId, chairPinned, dressChair, fitChair, flipHand, handHidden, handLocked, handPose, layHand, setChairPin, setHandHidden, setHandPose, standChair } from "@game-presets/desks";

/**
 * THE FACES OF THE SEAT DESIGN — the pixel face for the name on its plate and for the initials in
 * the disc. A ROLE each, so a consumer with its own faces re-registers them under the same names.
 */
const PIXEL_FACE = "'Press Start 2P', ui-monospace, monospace";
const NAME_STYLE = { family: PIXEL_FACE, size: 0.24, weight: 400, lineHeight: 1.6, fill: "text" };
const GLYPH_STYLE = { family: PIXEL_FACE, size: 0.5, weight: 400, lineHeight: 1, fill: "text" };

/** One place at a live desk: who sits there and in what colour they are drawn. */
export interface AvatarSeat {
  readonly seat: string;
  readonly ink: Paint;
}

/**
 * HOW A `Presence` TRAVELS — the one thing that differs between the catalog (both screens in one
 * document, read live) and the hub (one seat local, the rest over a relay, throttled). Everything
 * downstream of a `Presence[]` is this file's own and does not know which of the two it is fed by.
 */
export interface AvatarsTransport {
  /**
   * THIS SIDE'S OWN PRESENCES, read fresh on every publish — the catalog's local screens (may be
   * more than one, since a catalog page keeps both panes in one document), or the hub's one seat.
   *
   * `place` and `holding` need not be filled in here: `handed()` is this file's own, and its
   * answer is laid over whatever `mine()` returns before it is placed or told to the far side.
   */
  mine(): readonly Presence[];
  /** Tell the far side about ONE of my presences — called once per presence `mine()` produced. */
  say(presence: Presence): void;
  /**
   * Subscribe to a presence arriving from elsewhere. Returns an unsubscribe. The catalog's
   * transport never calls the callback (everything it has is already in `mine()`); the hub's
   * calls it once a relay message is heard.
   */
  hear(cb: (presence: Presence) => void): () => void;
}

export interface AvatarsOptions {
  /**
   * THE TREE THE PEOPLE ARE PLACED INTO. A plain `Node` for a page that keeps one tree for its whole
   * life (the catalog's stories); a thunk for a caller whose tree is REPLACED wholesale on a network
   * revision (the hub's `live.host.root`, `host.setRoot` swaps the object, not its fields) — read
   * fresh on every publication, never captured once, or a wiring built before the first revision
   * would go on placing discs into a tree nobody draws any more.
   */
  readonly desk: Node | (() => Node);
  readonly seats: readonly AvatarSeat[];
  readonly transport: AvatarsTransport;
  /**
   * THE SEAT'S OWN PLACE at this desk — the shelf's `seatPlaces(n)`, by index, and the ANCHOR of
   * everything below: the ring stands there, the cards dealt to that player lie in it, and
   * `liveTable`'s idle glide returns a wandered view to it. Only the OPENING place: its owner may drag their chair
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
  /**
   * WHOSE HAND IS SHUT WHEN THE PAGE OPENS, by seat index — a page with a knob for it hands it in.
   *
   * The opening state and, for now, the only one: a tap on one's own ring is "take me home"
   * (`goHome`), so nothing at the desk turns the lock while the page is running. Absent, every hand
   * opens open, which is every page that has no knob.
   */
  readonly locked?: readonly boolean[];
  /**
   * TAKE THIS SEAT'S OWN VIEW HOME — the camera's glide, asked of whoever holds the camera.
   *
   * A tap on one's own ring means "put me back at my place", and the place is already known here
   * while the camera is not: a page owns its screens, this owns the people. Absent, a tap on a ring
   * does nothing, which is every page whose panes have no camera to move.
   */
  readonly goHome?: (seat: string) => void;
  /**
   * WHOSE SCREEN THIS IS, asked fresh — the seat whose chair wears the gold ring that says "this
   * is me". A fact of the screen and not of the desk, which is why it is asked here and never
   * sent: the hub answers with its own seat, the catalog with the pane last touched. Absent, no
   * chair wears the ring, which is a page that is nobody's.
   */
  readonly me?: () => string | undefined;
  /** Element whose disconnection stops the listeners below — a `MutationObserver` watches this. */
  readonly wall: HTMLElement;
}

export interface Avatars {
  /** Everybody placed, and every screen told — latched, so a placement cannot start another. */
  readonly publish: () => void;
  /** The desk came to rest: the furniture may have changed size without anybody having moved. */
  readonly settled: () => void;
  /** What the mirror's `hand` report means to the PEOPLE, after the screens have been told. */
  readonly handed: (seat: string, items: readonly CarryItem[], at: Vec | undefined, done: boolean) => void;
  /** A tap on one's OWN ring takes that reader's view home. Anything else is not this wiring's. */
  readonly tapped: (seat: string, piece: Node) => boolean;
  /**
   * A PRESS ON A CONTROL OF THE BAR ABOVE ONE'S OWN HAND — shut, hide, turn over, pin. Answered for
   * the owner only; a control that is not the bar's, or is somebody else's, is not this wiring's.
   * Answers `true` when the tree was written, so the caller can tell the room.
   */
  readonly pressed: (seat: string, control: Node) => boolean;
  /** Where a seat's place stands RIGHT NOW — the opening one until its owner drags the chair. */
  readonly placeOf: (seat: string) => SeatPlace | undefined;
  /**
   * A SEAT THAT LEFT THE ROOM LEFT THE DESK — drops it from the far side's picture and republishes.
   *
   * `placeAvatars` sweeps a disc away once nobody says they are here, and it is told by a seat's
   * `Presence` being absent; the catalog never loses a seat mid-page (`mine()` is the whole of what
   * exists), but the hub's roster shrinks when somebody leaves, and there is no `Presence` left to
   * arrive that says so — the ABSENCE has to be said instead.
   */
  readonly forget: (seat: string) => void;
}

/**
 * THE PEOPLE, WIRED INTO A LIVE PAGE — one call, and the caller hands its own pieces back in.
 *
 * Everything below is the two former callers' own wiring with the caller-specific parts lifted
 * out. It is deliberately not a scene: a caller builds its panes (or its relay) exactly as it did
 * before, and this only answers the four questions a desk with people on it grows — who is here,
 * where do they stand, what does their hand look like, and who just touched the glass.
 */
export function withAvatars(o: AvatarsOptions): Avatars {
  registerTextStyle(PRESENCE_TEXT, NAME_STYLE);
  registerTextStyle(PRESENCE_GLYPH, GLYPH_STYLE);
  const desk = (): Node => (typeof o.desk === "function" ? o.desk() : o.desk);
  /**
   * WHERE EACH SEAT'S PLACE STANDS RIGHT NOW — the opening one, until its owner drags their chair.
   *
   * The one truth on this page about who sits where: the ring is put here, the idle glide returns
   * here, and the far screen reads it off `Presence.place`.
   * Kept beside the tree rather than read out of it, because a tree is rebuilt and a place is not.
   */
  const placed = new Map<string, SeatPlace>(
    o.seats.flatMap(({ seat }, i) => (o.places?.[i] ? [[seat, o.places[i]!] as [string, SeatPlace]] : [])),
  );
  /** Whose hand is holding something — `handed()`'s own, laid over whatever `mine()` says. */
  const holding = new Set<string>();
  /**
   * WHOSE HAND OPENS SHUT — written onto the chair ONCE, the first time the desk is laid, and
   * never held here after that. The lock is a number on the chair (`HAND_LOCK`) and the chair is
   * on every screen's tree: a map of "shut" kept beside the tree was a second truth, and on the far
   * screen it was the wrong one — every publish there re-dressed the chair open again.
   */
  let seeded = false;
  const seedLocks = (): void => {
    if (seeded || o.hands === undefined) return;
    seeded = true;
    o.seats.forEach(({ seat }, i) => {
      const ring = byId(desk(), chairId(seat));
      if (ring && o.locked?.[i] === true) dressChair(ring, { shut: true });
    });
  };

  /** What the far side last said about each of its seats — this side's own is never in here. */
  const far = new Map<string, Presence>();
  const stopHearing = o.transport.hear((presence) => {
    far.set(presence.seat, presence);
    // THEY MOVED THEIR OWN CHAIR, and this side's own copy of the desk has to follow: a place is
    // the anchor a hand is measured against, so a ring left behind is a patch left behind.
    if (presence.place) placed.set(presence.seat, presence.place);
    publish();
  });

  /**
   * MY OWN PRESENCES, WITH WHAT ONLY THIS FILE TRACKS LAID OVER THEM — the place `handed()` has
   * moved to and whether a hand is full. The transport supplies who is here, in what colour and
   * looking at what; this file is the one truth for where a chair now stands, on both sides of it.
   */
  const mine = (): Presence[] =>
    o.transport.mine().map((p) => {
      const place = placed.get(p.seat);
      return { ...p, holding: holding.has(p.seat), ...(place ? { place } : {}) };
    });

  const presences = (): Presence[] => [...mine(), ...far.values()];

  /**
   * EVERY PLACE, RE-DRESSED — what is true of it, and how big what is in it has made it.
   */
  const layHands = (): void => {
    const me = o.me?.();
    for (const { seat } of o.seats) {
      const ring = byId(desk(), chairId(seat));
      if (!ring) continue;
      // THE CHAIR IS THE HAND, so there is nothing to put beside anything: it stands where its owner
      // sits and the cards lie about it in its pose. What is true of it is written in ONE call,
      // because it is one picture — see `dressChair`.
      dressChair(ring, { home: home.has(seat), mine: me === seat });
      if (o.hands !== undefined) layHand(ring);
      // ...AND THE FURNITURE FOLLOWS THE CHAIR: the face over it, the marks beside it.
      fitChair(desk(), seat);
    }
  };

  /**
   * WHO IS LOOKING AT THEIR OWN PLACE — worked out for EVERYBODY off what they said, not just for
   * this screen. A reader has to be able to see that the other player has come home, and the only
   * thing that says so is their own view against their own place (`isHome`).
   */
  const home = new Set<string>();
  const readHome = (all: readonly Presence[]): void => {
    home.clear();
    for (const p of all) if (p.place && isHome(p.view, p.place)) home.add(p.seat);
  };

  /** Every chair, stood where its place now is — the owner's drag written back onto both screens. */
  const layChairs = (): void => {
    for (const { seat } of o.seats) {
      const place = placed.get(seat);
      if (place) standChair(desk(), seat, place.at, place.facing);
    }
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
    const now = JSON.stringify(all);
    if (now === last) return;
    last = now;
    placing = true;
    try {
      seedLocks();
      readHome(all);
      placeAvatars(desk(), all);
      layChairs();
      layHands();
      for (const presence of mine()) o.transport.say(presence);
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
    readHome(presences());
    layChairs();
    layHands();
  };

  // The story's or the room's own element is thrown away whole on a re-render; the listener
  // above is not, and an unremoved one goes on placing avatars into a tree nobody is drawing.
  const observer = new MutationObserver(() => {
    if (o.wall.isConnected) return;
    stopHearing();
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
      //
      // ...AND AT THE TURN ITS HOLDER WAS LOOKING FROM, on the release and only there. A card lies
      // the way its holder held it (`holderTurn`), and a place is the one thing on the felt that
      // says which way somebody is sitting: a reader who spun their view and moved their ring was
      // left sat at the old angle, so the tick on the rim pointed where nobody was and coming home
      // glided the view back to a facing its owner had left. Read off the same message everybody
      // else reads their turn from (`PresenceView.rotation`), so both screens land on one number.
      //
      // ON THE RELEASE, because a facing rewritten every frame of a carry is the reader's own view
      // turning under their finger: the ring would follow the camera about while it was being held,
      // and `isHome` would flicker for the whole gesture.
      const was = placed.get(seat);
      const facing = done ? o.transport.mine().find((p) => p.seat === seat)?.view.rotation : undefined;
      if (carryingSeat && at && was) placed.set(seat, { at, facing: facing ?? was.facing });
      if (done) holding.delete(seat);
      else if (!carryingSeat) holding.add(seat);
      if (carryingSeat || done) publish();
    },
    tapped: (seat, piece) => {
      // A TAP ON ONE'S OWN RING IS "TAKE ME BACK THERE". On the RING, because the ring is the thing
      // on this desk that means "you": it is the only node a reader may pick up that is theirs, so
      // it is the only one a tap can be about without asking whose it is. Not on the disc — nothing
      // a finger does reaches the disc at all.
      //
      // The glide is the camera's and so is asked of the camera (`o.goHome`): this wiring holds
      // numbers and nodes, and a screen is neither. Coming home fills the ring and takes the disc
      // off the felt, and that is read back off the view like everybody else's (`readHome`).
      if (piece.id !== chairId(seat)) return false;
      o.goHome?.(seat);
      return true;
    },
    pressed: (seat, control) => {
      const press = barPress(control);
      if (!press || press.seat !== seat) return false;
      const ring = byId(desk(), chairId(seat));
      if (!ring) return false;
      // EACH IS ONE WRITE ON THE CHAIR, and the chair is the truth on every screen: the lock and
      // the pin are numbers on it, hiding is its zone rule, a flip is the cards' own sides, a
      // fold is the hand's pose. Then the place is re-dressed — which puts the marks beside the
      // chair and lights the HUD's controls off those very numbers (`dressMarks`, `dressBar`).
      // THE GLASS is not this wiring's: where a reader's hand is drawn is a fact of their screen.
      if (press.what === "glass") return false;
      if (press.what === "lock") dressChair(ring, { shut: !handLocked(ring) });
      else if (press.what === "hide") setHandHidden(ring, !handHidden(ring));
      else if (press.what === "flip") flipHand(ring);
      else if (press.what === "pin") setChairPin(ring, !chairPinned(ring));
      else setHandPose(ring, { side: handPose(ring).side, fold: press.what });
      layHands();
      return true;
    },
    placeOf: (seat) => placed.get(seat),
    forget: (seat) => {
      if (!far.delete(seat)) return;
      publish();
    },
  };
}
