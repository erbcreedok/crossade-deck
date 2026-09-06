// THE HUB'S DESK — the catalog's `Live/*` scene with a network behind it, and NOTHING ELSE.
//
// It used to be five hundred lines of its own wiring: its own `runOf`, its own landing picture, its
// own dice throw, its own camera loop. Every one of those was a second answer to a question the kit
// had already answered on the shelf, and the two disagreed wherever nobody had looked — a card could
// not be thrown at all here, because this copy simply had no release branch to throw it in.
//
// So the wiring is the kit's (`liveTable`), and what is left in this file is the two things that are
// genuinely the hub's: WHICH desk this is (the room, the unit, how the view opens on it) and the
// WIRE (`joinTable` — my change goes out, a change that arrives comes in). Anything else missing
// belongs in `liveTable`, where every consumer gets it.

import {
  chessPlaces,
  chessRoom,
  CHESS_UNIT,
  LIVE_UNIT,
  mayThrow,
  nardyPlaces,
  nardyRoom,
  NARDY_BUMP,
  NARDY_UNIT,
  ROUND_R,
  roundPlaces,
  runOf,
  seatsOf,
  settled,
  squareAt,
  pointUnder,
  handTakes,
  isHand,
  mayTake,
  roundRoom,
  roundWalls,
  wallsOf as nardyWallsOf,
  ANCHOR_MARK,
} from "@game-presets/desks";
import { throwDie } from "@game-presets/dice";
import {
  DEFAULT_TUNING,
  follow,
  watchPresence,
  zoneNear,
  type CarryItem,
  type PresenceView,
  type Screen,
  GRIP_SPEC,
  heapOf,
  holdThePage,
  installStockCarries,
  installStockFlips,
  installStockLayouts,
  installStockSurfaces,
  installTheme,
  liveTable,
  withAvatars,
  setRev,
  t,
  type Avatars,
  type CameraContent,
  type Palette,
  type LiveClock,
  type LiveStage,
  type LiveTableOptions,
  type Mirror,
  type Node,
  type SeatPlace,
  type Transform,
  type Vec,
} from "game-kit";
import { pixiPainter } from "game-kit/pixi";
import { storedAccount } from "../account/account.js";
import { beat } from "../hub/beat.js";
import { goTo, placeOf } from "../hub/route.js";
import { joinTable, type RosterItem, type Table } from "../online/table.js";
import type { Teardown } from "../hub/catalogue.js";
import { installTableLook } from "../look/surfaces.js";
import { isTableGame, mapFor, syncSeatChairs, TABLE_SEATS, type SeatedPerson, type TableGame } from "./mapFor.js";
import { hubAvatarsTransport, hubSeats, inkOf, SEAT_INKS, type HubAvatarsTransport } from "./people.js";

/** A far hand's cursor, over the glass and never on the desk — the catalog's own `DOT` size. */
const CURSOR_DOT = 18;

/**
 * WHICH `position` VALUES ALREADY HOLD AN ABSOLUTE CHILD. Everything but `static` does, and the
 * question has to be asked of the COMPUTED style, never of the inline one.
 *
 * The hub's `#stage` is `position:absolute; top:56px; …; bottom:0` in the page's own stylesheet, and
 * its inline `position` is empty — so a guard reading `element.style.position` finds nothing, writes
 * `relative`, and the inline rule beats the stylesheet: the region loses its `top`/`bottom` and
 * collapses out of the flow to the canvas's intrinsic 2:1, a glass 197px tall on a 800px phone. The
 * desk then opens fitted to that strip and reads as a coin on the felt.
 */
const POSITIONED = ["relative", "absolute", "fixed", "sticky"];

/** Does this container still need a `position` of its own before a dot may be pinned inside it? */
export function needsPositioning(position: string): boolean {
  return !POSITIONED.includes(position);
}

/**
 * WHERE A FAR HAND'S CURSOR SITS ON THIS GLASS, in the container's own pixels.
 *
 * `at` is the anchor in the DESK's units — the same number on every screen — and `view` is THIS
 * screen's camera, so the point is turned into pixels by the eye that is looking, never by the one
 * that sent it. The result is offset from the container's top-left corner, which the canvas fills.
 */
export function dotAt(at: Vec, view: Transform): { readonly left: number; readonly top: number } {
  return { left: view.a * at.x + view.c * at.y + view.e, top: view.b * at.x + view.d * at.y + view.f };
}

function buildInitialDesk(game: TableGame): Node {
  installStockSurfaces();
  installStockLayouts();
  installStockCarries();
  installStockFlips();
  return mapFor(game);
}

/** A piece heaps by the name it carries (`Heaping`) — cards only, on this shelf. */
function heapKindOf(n: Node): string {
  return heapOf(n) ?? "";
}

/** The zone a run is over, per game — the same question `zoneAt` and a drop both ask. */
function zoneAtFor(game: TableGame, seat: () => string | null): ((root: Node, at: Vec, lead: Node) => Node | undefined) | undefined {
  if (game === "chess") return (root, at) => squareAt(root, at);
  if (game === "nardy") return (root, at, lead) => pointUnder(root, at, lead);
  // THE NEAREST HAND WITHIN REACH, AND ONLY IF IT WOULD TAKE THE CARD FROM THIS SEAT. One question
  // asked once: a hand the drop is going to refuse must not light up inviting the card first, and
  // both the light and the drop read this line (see the catalog's `Live/Cards`).
  return (root, at, lead) => {
    const mine = seat();
    if (!mine) return undefined;
    const zone = zoneNear(root, at, lead);
    return zone && isHand(zone) && handTakes(zone, lead, mine) ? zone : undefined;
  };
}

/** The seats' own places on this desk, the shelf's `seatPlaces(2)` per game — read for the idle glide. */
function placesFor(game: TableGame): readonly SeatPlace[] {
  if (game === "chess") return chessPlaces(2);
  if (game === "nardy") return nardyPlaces(2);
  return roundPlaces(2);
}

/** How far the view may zoom, either way — the same range the catalog's map opens with. */
const CAM_ZOOM = { minZoom: 0.5, maxZoom: 2.5 };

/**
 * HOW LONG THE GLIDE HOME TAKES, in ms — the kit's own default, named here because the OPENING is
 * the same glide run to its end in one step (see `startTable`), and a number known to one of the two
 * would open the desk part of the way to a place it then eased the rest of the way into.
 */
const HOME_GLIDE_MS = 600;

/**
 * THE STRETCH THE CAMERA IS HELD INSIDE — each desk's OWN room (`roundRoom`, `chessRoom`,
 * `nardyRoom`, exactly as the catalog's `Live/*` story hands it in), widened until every seat at it
 * can actually be brought under the reader on THIS glass.
 *
 * THE ROOM IS THE ONLY THING THAT DECIDES WHETHER A PLAYER CAN SIT DOWN. A place is on the rim, and
 * sitting at it means having it in the MIDDLE of one's own glass — which is what `isHome` reads,
 * what the ring fills for and what the disc comes off the felt for. But `Camera.lookAt` clamps: a
 * room narrower than the glass is CENTRED rather than pinned, so the eye asked for a seat is put
 * back in the middle of the desk and nobody at it is ever home. The shelf's own margin (`roundMap`'s
 * `RIM`) is measured for the catalog's short pane; on a phone held upright, half the glass is
 * thirteen units of felt and the room ran out after six — the glide ran, clamped, and came to rest
 * in the middle, which is the picture the table opened with on the hub and only on the hub.
 *
 * So the room is the desk's own plus half a glass BEHIND the furthest seat, measured at the widest
 * the view may ever be (`CAM_ZOOM.minZoom`), which is the widest the clamp ever has to give way to.
 * It is the same sentence the shelf already writes, with this glass's number in it instead of a
 * pane's.
 */
export function roomOfDesk(game: TableGame, glass: { readonly width: number; readonly height: number }): CameraContent {
  const room = game === "chess" ? chessRoom() : game === "nardy" ? nardyRoom() : roundRoom();
  const behind = Math.max(glass.width, glass.height) / 2 / (unitOfDesk(game) * CAM_ZOOM.minZoom);
  const reach = Math.max(...placesFor(game).map(({ at }) => Math.hypot(at.x, at.y))) + behind;
  // GROWN ROUND THE ROOM'S OWN MIDDLE, never shrunk: a desk that already declares more felt than
  // this asks for is a desk that has its own reason to, and half a glass is a floor, not a size.
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  const half = { w: Math.max(room.w / 2, reach), h: Math.max(room.h / 2, reach) };
  return { x: cx - half.w, y: cy - half.h, w: half.w * 2, h: half.h * 2 };
}

/**
 * WHAT ONE UNIT IS WORTH ON THIS DESK, in pixels — the shelf's own etalon per desk, the very number
 * the catalog's story passes. A unit worked out here from the glass would be a second etalon, and a
 * `Screened` node measured against one while the camera used the other draws itself to make up the
 * difference.
 */
export function unitOfDesk(game: TableGame): number {
  if (game === "chess") return CHESS_UNIT;
  if (game === "nardy") return NARDY_UNIT;
  return LIVE_UNIT;
}

/**
 * HOW THIS DESK IS PLAYED — the whole difference between the three, as data.
 *
 * Every field here is a `liveTable` option under the name the catalog's own `Live/*` story passes it
 * by, so "the hub plays the desk the shelf shows" is something a reader can check line by line
 * rather than take on trust.
 */
function playFor(game: TableGame, seat: () => string | null): LiveTableOptions<LiveStage> {
  const zones = zoneAtFor(game, seat);
  if (game === "cards") {
    return {
      ...(zones ? { zones } : {}),
      // WHAT IS TOUCHING WHAT IS A HEAP, and a heap gets a handle — the deck's own tab.
      stacking: true,
      heapKindOf,
      grip: GRIP_SPEC,
      // A THROW IS ON: a card flicked across the felt travels, which is the whole of a card table.
      letGo: "throw",
      // ...AND A TAP TURNS WHAT IT LANDED ON, which on a closed pile is the top of the deck.
      flipping: true,
      // THE ROUND FELT IS A WALL AND NOT A DRAWING: a card may be carried to the edge of the circle
      // and no further, and the tray the hand is held inside is the very one a throw bounces off
      // (`roundWalls`) — asked twice, the two could differ, and a card carried somewhere it cannot
      // be thrown is a border in two places.
      trayOf: (_root: Node, hit: Node) => roundWalls(hit),
      anchorMark: ANCHOR_MARK,
    };
  }
  if (game === "nardy") {
    return {
      // A THROW IS ON, always: the dice are the whole reason the desk has a second half.
      letGo: "throw",
      bump: NARDY_BUMP,
      // A DIE SET DOWN KEEPS ITS FACE: only a throw changes the number, so a die moved out of the
      // way is not a roll.
      ways: { die: "toss" },
      ...(zones ? { zones } : {}),
      // A COLUMN OF CHECKERS IS ONE RUN, and the point's own idea of how it stands in the hand.
      pieces: { runOf, offsetOf: seatsOf, wallsOf: nardyWallsOf, mayThrow, settled },
      onRoll: throwDie,
      anchorMark: ANCHOR_MARK,
    };
  }
  return {
    // NO STACKING. A board has no heaps: pieces do not pile up on a square, they take each other's
    // place — so there are no handles to draw and nothing for one to lift.
    letGo: "drop",
    ...(zones ? { zones } : {}),
    // THE LANDING PICTURE IS OFF on a board: the lit square already says where the man is going.
    landingShown: false,
    anchorMark: ANCHOR_MARK,
  };
}

export function startTable(container: HTMLElement): Teardown {
  installTheme(document, "dark");
  const stopHold = holdThePage();

  const currentPlace = placeOf();
  const game: TableGame = isTableGame(currentPlace.game) ? currentPlace.game : "cards";
  const account = storedAccount();

  let unbindOnTree: (() => void) | undefined;
  let currentTable: Table | null = null;
  /**
   * WHICH SEAT THIS GLASS IS, once the server has said — `p1`/`p2`, never a game's own names: the
   * room is one server room for every game, and chess is the only one that cares which of the two
   * it is. Known only after `joinTable` resolves, which is AFTER the camera has usually already
   * opened (the opening is a latch on the first real layout, and the network round trip is slower
   * than that on any connection worth calling one) — so the turn is applied where the seat arrives.
   */
  let seat: string | null = null;
  /**
   * WHICH OF THE DESK'S PLACES THIS GLASS SITS AT — the seat's own slot, and `0` until the room has
   * said. Only the fallback: once somebody is actually at the desk their ring is the answer, and a
   * ring can be dragged (`Avatars.placeOf`).
   */
  const mySeatIndex = (): number => (seat === "p2" ? 1 : 0);

  let initialRoot = buildInitialDesk(game);

  // A THROW OR A PINCH NEEDS A CLOCK, and the kit's camera has none of its own (`guard.one-clock`):
  // the hub's own `beat` is joined while a fling is moving and left the moment it rests. The redraw
  // belongs to the desk itself, so the beat is handed nothing to draw — it only counts the frames.
  const cameraClock = beat(() => {});
  const clock: LiveClock = (tick) => cameraClock.join((_seconds, dt) => tick(dt));

  /**
   * MY CHANGE, TOLD TO THE ROOM. The wiring announces every tree write it makes here (`changed`), so
   * the wire is one line rather than a wrapper round `setRoot` that could not tell my write from the
   * one that had just arrived. A HAND STILL IN THE AIR goes the other way (`relay`): it is not a
   * change to the desk and must never become a revision, or every pointer move would be one.
   */
  /**
   * The desk, once it exists — and it does not while it is being built. The wiring announces its
   * first tree write from INSIDE the call that returns it (the deck's handles are drawn before a
   * frame is), so a mirror reaching for the desk by name would be reading a binding that has not
   * been assigned yet. There is no room to tell at that moment either: the wire is joined later.
   */
  let standing: ReturnType<typeof liveTable> | undefined;
  let leaveIdleClock: (() => void) | undefined;
  /** The people at this desk, once the room has said who they are. */
  let avatars: Avatars | undefined;
  let peopleWire: HubAvatarsTransport | undefined;
  /** Everybody the room has named, in seat order — read by `farDot`'s own ink. */
  let seated: readonly string[] = [];
  /** THE SAME PEOPLE, WITH THE NAME THE ROOM CALLS THEM BY — what stands under a ring on the felt. */
  const sitting = (roster: readonly RosterItem[]): readonly SeatedPerson[] =>
    roster.flatMap((one) => (one.seat ? [{ seat: one.seat, name: one.name }] : []));
  let stopWatching: (() => void) | undefined;
  let unbindOnRelay: (() => void) | undefined;
  let unbindOnRoster: (() => void) | undefined;
  /**
   * A DISPOSABLE MARKER, watched by the kit's own `Avatars` for when to stop listening — `container`
   * itself is the hub's persistent stage (`stage.replaceChildren()` empties it between games, but the
   * element is never removed from the document), so a wiring told to watch `container` would never
   * see it disconnect and would go on listening for the relay for every game played after this one.
   */
  const peopleWall = document.createElement("div");
  peopleWall.style.display = "none";
  container.appendChild(peopleWall);
  /**
   * THE FAR SCREENS, ONE PER SEAT — this glass, wearing somebody else's name.
   *
   * `follow` keeps its own record of what it is already carrying ON the screen it is told about
   * (`mirroring`), so two people carrying at once over one shared record would each release the
   * other's run. One `Screen` per seat and the record is per person, which is what it is about.
   */
  const farScreens = new Map<string, Screen>();
  /**
   * A POINT ON THE GLASS FOR EACH FAR SEAT — the catalog's own dot (`Live/*` stories), coloured in
   * that seat's ink so a cursor reads as the same person the mark on the desk names.
   */
  if (needsPositioning(getComputedStyle(container).position)) container.style.position = "relative";
  const farDots = new Map<string, HTMLDivElement>();
  const farDot = (seat: string): HTMLDivElement => {
    let dot = farDots.get(seat);
    if (!dot) {
      dot = document.createElement("div");
      dot.style.cssText =
        `position:absolute;z-index:4;width:${CURSOR_DOT}px;height:${CURSOR_DOT}px;border-radius:50%;` +
        `pointer-events:none;display:none;transform:translate(-50%,-50%);` +
        // SEAT INKS ARE ALWAYS PALETTE TOKENS (`SEAT_INKS`), the widened `Paint` return type just
        // does not say so — the same narrowing the catalog's own `SEATS as const` gets for free.
        `background:${t(inkOf(seat, seated) as keyof Palette)};box-shadow:0 0 0 2px ${t("sunkBg")}`;
      container.appendChild(dot);
      farDots.set(seat, dot);
    }
    return dot;
  };
  const farScreen = (from: string): Screen => {
    let one = farScreens.get(from);
    if (!one) {
      one = {
        seat: from,
        onCursor: (at: Vec | undefined, view: Transform | undefined) => {
          const dot = farDot(from);
          if (!at || !view) {
            dot.style.display = "none";
            return;
          }
          dot.style.display = "block";
          const { left, top } = dotAt(at, view);
          dot.style.left = `${left}px`;
          dot.style.top = `${top}px`;
        },
      };
      farScreens.set(from, one);
    }
    one.scene = standing ? { host: standing.host, ...(standing.motions ? { motions: standing.motions } : {}), ...(standing.camera ? { camera: standing.camera } : {}) } : undefined;
    return one;
  };
  /** How high a mirrored hand holds what it is carrying — the same lift this desk's own carry uses. */
  const held = DEFAULT_TUNING.lift;
  /**
   * WHAT THIS SCREEN'S CAMERA IS WORTH AS A MESSAGE — `zoom` is SCREEN PIXELS PER UNIT and not the
   * camera's own factor, because one screen's etalon is not the other's (see `PresenceView`).
   */
  const viewNow = (): PresenceView | undefined => {
    const camera = standing?.camera;
    if (!camera) return undefined;
    return { target: camera.target, zoom: camera.pixelsPerUnit, rotation: camera.rotation, glass: camera.glass };
  };
  /**
   * THE DESK IS TOLD TO DRAW ITSELF AGAIN — `Avatars` writes discs, rings and hands straight into
   * `standing.host.root` (the same tree, by the thunk it was handed), and a write to the tree is not
   * by itself a repaint: nothing else here re-renders on a timer while the camera stands still.
   *
   * A PLAIN REPAINT (`motions.redraw`), never `host.setRoot`: the tree object is already the one
   * standing, so `setRoot` would only be telling the host to swap it for itself — but the host
   * answers every swap by firing `onChange`, which re-fits the camera and calls `onView`, which is
   * THIS DESK'S OWN `onView` below — the one that calls `redraw()`. A screen open on its own felt,
   * touched by nobody, span forever between the two before the first frame ever reached the glass.
   */
  const redraw = (): void => {
    standing?.motions?.redraw();
  };
  const mirror: Mirror<LiveStage> = {
    ready: () => {},
    changed: () => {
      if (currentTable && standing) currentTable.send(standing.host.root);
    },
    hand: (items, at, done, feel) => {
      currentTable?.sendRelay({ kind: "hand", items: items as unknown as CarryItem[], at, done, feel });
      if (seat) avatars?.handed(seat, items, at, done);
      redraw();
    },
  };

  const live = liveTable<LiveStage>(container, initialRoot, {
    ...playFor(game, () => seat),
    painter: (view, size) => pixiPainter(view, size),
    clock,
    mirror,
    limits: CAM_ZOOM,
    // Re-dresses the board's own backdrop in the hub's look — AFTER the map has registered its own,
    // so the override is the one left standing.
    look: installTableLook,
    // THE GLASS AS IT STANDS NOW, and not as it stood when the desk was built: the room is re-read
    // on every resize (`control.refresh`), and a phone turned on its side is a different glass with
    // a different amount of felt behind its seats. Read off the CONTAINER and not off the host,
    // because the very first read happens inside the call that is still building the host.
    room: () => roomOfDesk(game, { width: container.clientWidth, height: container.clientHeight }),
    unit: unitOfDesk(game),
    // WHERE THE SEATS ARE, AND THAT AN UNTOUCHED VIEW COMES BACK TO MINE — the kit's own, the same
    // option the catalog's `Live/*` stories pass. It is what makes the ring fill and the disc come
    // off the felt (`isHome`), and it carries the TURN with it: the second place faces 180°, so a
    // screen sitting at it looks at the desk from the other side without anybody turning a camera.
    //
    // `mine` is the fallback and `placeNow` is the answer: which seat this glass is arrives from
    // `joinTable`, after the desk is already up, and where that seat STANDS moves again whenever
    // its owner drags their ring. Both are asked every step, so neither is a number kept here.
    seats: {
      places: placesFor(game),
      mine: 0,
      placeNow: () => avatars?.placeOf(seat ?? "") ?? placesFor(game)[mySeatIndex()],
      idleReturn: { glideMs: HOME_GLIDE_MS },
    },
    // WHERE SOMEBODY IS LOOKING IS PART OF THIS DESK, so a view that moved is news — it is what
    // puts the far reader's own disc where they are actually sitting — or takes it off the felt
    // altogether, once they are looking at their own place again.
    onView: () => {
      avatars?.publish();
      redraw();
    },
    // A HAND THAT CHANGED SIZE without anybody having moved: a card landing in one is a change to
    // the furniture alone, and the ring has to be re-measured against what is now in it.
    onDeskChanged: () => {
      avatars?.settled();
      redraw();
    },
    // A SHUT HAND CANNOT BE REACHED INTO. Refused at the PICK and not at the drop, because what a
    // shut hand refuses is the gesture ever starting — a card that lifted out and flew back would
    // read as the desk having dropped it.
    // ...and a RING is its owner's alone to move, which is not a grip: a grip cuts the subtree, so a
    // ring gripped to its owner would be a hand nobody could ever be dealt from (`mayTake`).
    may: (n: Node) => (seat ? mayTake(n, seat) : true),
    // A TAP ON ONE'S OWN RING TAKES THAT READER HOME. Anything else falls through to whatever this
    // desk already does with a tap.
    taps: (piece: Node) => (seat ? avatars?.tapped(seat, piece) === true : false),
  });
  standing = live;

  joinTable({
    game,
    ...(currentPlace.room ? { room: currentPlace.room } : {}),
    ...(account ? { account } : {}),
    seats: TABLE_SEATS,
  })
    .then((table) => {
      currentTable = table;
      seat = table.seat;
      // THE DESK OPENS AT ITS OWN PLACE, and it opens there NOW: which seat this glass is only
      // arrives here, and until it did the view was standing in the middle of the room looking at
      // the desk from nobody's side of it.
      //
      // The kit's own glide is what moves it (`live.idle`, built from the `seats` option above), so
      // "where home is" is one answer and not two — the same one a tap on the ring and a view left
      // alone both go to. IN ONE STEP, not eased: `avatars.publish()` runs synchronously a few lines
      // below and reads whatever the camera is worth AT THAT MOMENT (`isHome`), and a view still
      // easing home fails it — the ring stays empty and a stray disc is drawn instead.
      live.idle?.goHome();
      live.idle?.step(HOME_GLIDE_MS);
      live.motions?.redraw();
      // THE SAME CLOCK THE FLING BORROWS, joined for the whole life of the table rather than only
      // while something is moving: the idle countdown has to keep counting while the view is dead
      // still, which is exactly what the camera's own borrow (`clock` above) never does.
      leaveIdleClock = cameraClock.join((_seconds, dt) => {
        live.idle?.step(dt * 1000);
        // THE GLIDE MOVES THE CAMERA DIRECTLY (`idleReturn`), never through `wake`'s own repaint —
        // that path only runs while a fling is being stepped, and this join outlives every fling.
        live.motions?.redraw();
        // ...AND WHERE SOMEBODY IS LOOKING IS PART OF THIS DESK. `onView` is the FINGER's report and
        // the glide is not a finger: without this the view arrives home and the desk goes on drawing
        // this reader as having wandered off, disc and all.
        avatars?.publish();
        return false;
      });
      // WHOSE HAND DID WHAT, in a colour the desk actually has. The server names seats `p1`, `p2`…
      // and a mark is drawn in its actor's ink; asked for a paint called "p1" the painter threw, and
      // the throw happened inside `setRoot` — before the tree was ever sent, so the other player saw
      // nothing move. Seats get the shelf's own inks, own marks are not shown (see Live/Cards), and
      // the far player's marks fade after a while.
      const inks = Object.fromEntries(SEAT_INKS.map((ink, i) => [`p${i + 1}`, ink]));
      live.host.setViewer({
        ...live.host.viewer(),
        marks: { inks, ttlMs: 5000, showOwn: false, ...(table.seat ? { me: table.seat } : {}) },
      });
      if (table.code) {
        goTo(game, "replace", table.code);
      }
      let sRoot = table.root;
      if (sRoot.children.length === 0) {
        sRoot = initialRoot;
        setRev(sRoot, table.rev);
        table.send(sRoot);
      } else {
        initialRoot = sRoot;
        live.setRoot(sRoot, "net");
      }

      if (import.meta.env?.DEV || typeof window !== "undefined") {
        (window as any).__TABLE__ = { table, host: live.host };
      }

      unbindOnTree = table.onTree((newRoot) => {
        live.setRoot(newRoot, "net");
        // THE PEOPLE GO BACK ON THE TREE THAT JUST ARRIVED. The discs travel with it — every screen
        // places the same set out of the same messages — but the tree that came in was written a
        // round trip ago, and the reader whose view moved since is standing where they were then.
        avatars?.publish();
        redraw();
      });

      // THE PEOPLE AT THIS DESK, once the room can be asked who they are. Their discs and their
      // rings are the kit's own (`withAvatars`); what differs is only where the answers come from —
      // the wire (`peopleWire`, a relay transport), and not a second pane in this document.
      peopleWire = hubAvatarsTransport({
        mine: () => seat,
        view: () => viewNow(),
        send: (msg) => table.sendRelay(msg),
      });
      avatars = withAvatars({
        desk: () => live.host.root,
        seats: hubSeats(TABLE_SEATS),
        transport: peopleWire.transport,
        places: placesFor(game),
        // A HAND PER PERSON ON THE CARD TABLE, and none on a board: a piece on a board is on a
        // square, and a patch of felt beside a player would be a place the game has no word for.
        ...(game === "cards" ? { hands: ROUND_R } : {}),
        wall: peopleWall,
        // A TAP ON ONE'S OWN RING IS "TAKE ME BACK THERE" — the same glide the idle return runs, on
        // this screen's own tracker, asked for instead of fallen into.
        goHome: () => live.idle?.goHome(),
      });
      seated = table.roster.map((one) => one.seat).filter((s): s is string => typeof s === "string");
      if (game === "cards") syncSeatChairs(live.host.root, sitting(table.roster));
      peopleWire.roster(table.roster);
      avatars.publish();
      redraw();
      unbindOnRoster = table.onRoster((roster) => {
        seated = roster.map((one) => one.seat).filter((s): s is string => typeof s === "string");
        if (game === "cards") syncSeatChairs(live.host.root, sitting(roster));
        const gone = peopleWire?.roster(roster) ?? [];
        for (const s of gone) avatars?.forget(s);
        avatars?.publish();
        redraw();
      });
      // A HIDDEN TAB IS NOBODY'S SCREEN — the one piece of state a browser will actually tell us.
      stopWatching = watchPresence(document, (state) => {
        peopleWire?.state(state);
        avatars?.publish();
        redraw();
      });

      unbindOnRelay = table.onRelay((msg) => {
        if (peopleWire?.heard(msg)) {
          redraw();
          return;
        }
        if (msg.kind !== "hand" || typeof msg.from !== "string") return;
        // A FAR HAND, DRAWN WITH THE SAME CALLS THE NEAR ONE MAKES — and with the same feel: told
        // only the anchor, this screen would slide a piece where the other one lifts and leans it.
        const { items, at, done, feel } = msg as unknown as {
          items: readonly CarryItem[];
          at: Vec | undefined;
          done: boolean;
          feel: Parameters<Mirror<LiveStage>["hand"]>[3];
        };
        follow(farScreen(msg.from), items ?? [], at, done === true, held, feel, msg.from);
      });
    })
    .catch((err) => {
      console.error("joinTable error:", err);
    });

  return () => {
    unbindOnTree?.();
    unbindOnRelay?.();
    unbindOnRoster?.();
    stopWatching?.();
    currentTable?.leave();
    leaveIdleClock?.();
    cameraClock.stop();
    for (const dot of farDots.values()) dot.remove();
    // TELLS THE KIT'S OWN `Avatars` TO STOP LISTENING — see the marker's own comment above: without
    // this, the persistent `#stage` never disconnects and the wiring goes on hearing the relay.
    peopleWall.remove();
    live.stop();
    stopHold();
  };
}
