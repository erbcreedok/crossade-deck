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
  mayThrow,
  nardyPlaces,
  nardyRoom,
  NARDY_BUMP,
  ROUND_R,
  roundPlaces,
  runOf,
  seatOf,
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
  byId,
  caps,
  DEFAULT_TUNING,
  follow,
  watchPresence,
  zoneNear,
  type CarryItem,
  type PresenceView,
  type Screen,
  extentOf,
  footprint,
  GRIP_SPEC,
  heapOf,
  holdThePage,
  idleReturn,
  installStockCarries,
  installStockFlips,
  installStockLayouts,
  installStockSurfaces,
  installTheme,
  liveTable,
  Camera,
  setRev,
  t,
  type CameraContent,
  type Palette,
  type IdleReturnTracker,
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
import { joinTable, type Table } from "../online/table.js";
import type { Teardown } from "../hub/catalogue.js";
import { installTableLook } from "../look/surfaces.js";
import { isTableGame, mapFor, TABLE_SEATS, type TableGame } from "./mapFor.js";
import { hubPeople, inkOf, SEAT_INKS, type HubPeople } from "./people.js";

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

/** Room round the board's own room, in units, so there is somewhere to lay a piece taken off it. */
const CAM_MARGIN = 2.5;
/** Felt shown round the board when the table opens, units — room for a piece taken off it. */
const OPEN_RIM = 1.2;

/** How far the round table's circle overfills the glass at opening, cards only — no side seen. */
const CARDS_OVERFILL = 1.5;

/**
 * THE STRETCH THE CAMERA IS HELD INSIDE — the board's own room (each desk on this shelf draws a
 * felt wider than the board face) plus a further margin, wide enough that a captured piece or a
 * thrown die has somewhere to land beside the board rather than off the glass.
 *
 * A desk with no room of its own falls back to its own footprint with the margin round it.
 */
function roomFor(game: TableGame, root: Node): CameraContent {
  const room = game === "chess" ? chessRoom() : game === "nardy" ? nardyRoom() : game === "cards" ? roundRoom() : undefined;
  if (room) {
    return {
      x: room.x - CAM_MARGIN,
      y: room.y - CAM_MARGIN,
      w: room.w + CAM_MARGIN * 2,
      h: room.h + CAM_MARGIN * 2,
    };
  }
  const shape = footprint(root);
  const { w, h } = shape ? extentOf(shape) : { w: 0, h: 0 };
  return { x: -w / 2 - CAM_MARGIN, y: -h / 2 - CAM_MARGIN, w: w + CAM_MARGIN * 2, h: h + CAM_MARGIN * 2 };
}

/**
 * WHERE THE VIEW OPENS on this desk — the zoom, and only the zoom; the point is the room's middle,
 * which is the kit's own answer and the same on every desk here.
 *
 * THE ROOM IS WHERE THE EYE MAY GO; THE BOARD IS WHAT IT OPENS ON. Fitted to the whole room a chess
 * board came up a third of a phone wide — the room is the felt, the zone under it and the margins,
 * most of it empty on the first frame. So the opening zoom fits the BOARD plus a rim of `OPEN_RIM`
 * units — enough to see a taken piece set down beside it — and the room stays the limit a pan runs
 * into, not the picture.
 */
function openZoom(
  game: TableGame,
  ctx: { readonly root: Node; readonly room: CameraContent; readonly unit: number; readonly view: { readonly width: number; readonly height: number } },
): number {
  // ...AND A DESK WHOSE ROOT IS THE PLAYING AREA HAS NO SEPARATE FACE. The round table is one felt:
  // asked for a "board face" it has none, and the fit fell back to the whole ROOM — the circle plus
  // two margins — which opens a table twelve units across on a glass measured for twenty. Its own
  // footprint is the face, and it is the same picture the other two open on.
  const face = byId(ctx.root, "board face");
  const box = face ? footprint(face) : game === "cards" ? footprint(ctx.root) : undefined;
  let { w: bw, h: bh } = box ? extentOf(box) : { w: ctx.room.w, h: ctx.room.h };
  // THE DICE LIVE OUTSIDE THE BOARD — in the band beside it — and an opening fitted to the board
  // alone put them past the edge of a phone. The view opens centred on the board, so the farthest
  // die counts twice: as far as it sits on one side, that much room on the other.
  for (const piece of ctx.root.children) {
    if (!caps(piece).has("Rollable")) continue;
    const { x, y } = seatOf(piece);
    bw = Math.max(bw, 2 * (Math.abs(x) + 0.8));
    bh = Math.max(bh, 2 * (Math.abs(y) + 0.8));
  }
  // THE ROUND TABLE OPENS OVERFILLING THE GLASS ON PURPOSE — a fit that shows the whole rim reads
  // as a coin on a phone; the owner wants the circle wider than the screen, its sides run off the
  // edges and only the top is ever in view. `bw` here is the circle's own diameter (its footprint
  // is square), so the target is that diameter times `CARDS_OVERFILL`, not the usual board+rim fit.
  return game === "cards"
    ? (ctx.view.width * CARDS_OVERFILL) / (bw * ctx.unit)
    : Math.min(ctx.view.width / ((bw + OPEN_RIM * 2) * ctx.unit), ctx.view.height / ((bh + OPEN_RIM * 2) * ctx.unit));
}

/**
 * A UNIT IS WHAT MAKES THE ROOM FILL THE GLASS AT ZOOM 1 — see the `unit` option below, which is
 * where the number is actually handed to the wiring. Named here because the idle glide has to work
 * out the same opening zoom the view opened on, and an opening measured against a second, slightly
 * different etalon would come home to a picture the desk never opened on.
 */
function unitFor(game: TableGame, root: Node, view: { readonly width: number; readonly height: number }): number {
  const room = roomFor(game, root);
  return Math.max(1, Math.min(view.width / room.w, view.height / room.h));
}

/**
 * THE CAMERA THE IDLE GLIDE IS GIVEN — this very one, answering ONE question differently.
 *
 * `idleReturn` brings a view nobody has touched home to `camera.fitZoom()`: the whole room on the
 * glass. That is home for a desk that OPENS fitted, and it is not home for any desk here — the
 * round table opens overfilling the glass on purpose (`CARDS_OVERFILL`) and a board opens on the
 * board rather than on the room. Left to the fit, a table nobody had touched for six seconds shrank
 * to a coin by itself, undoing the opening while the player watched.
 *
 * So the glide is handed a view of this same camera whose "fit" is the zoom the desk actually opened
 * on. Every other read and every write goes straight through to the camera itself — the glide still
 * moves the eye to its seat and turns it the seat's way.
 */
export function homeAt(camera: Camera, zoom: () => number): Camera {
  return new Proxy(camera, {
    get: (target, key) => (key === "fitZoom" ? zoom : Reflect.get(target, key, target)),
  });
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
  /** Chess only: the second seat looks at the SAME board turned 180°, own back rank nearest it. */
  const seatTurn = (): number => (game === "chess" && seat === "p2" ? 180 : 0);

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
  /**
   * THE IDLE GLIDE, once the seat is known — the hub has no avatar to hand `liveTable`'s own `seats`
   * option (that option asks for a `mine` INDEX at construction time, and the seat only arrives from
   * `joinTable` afterwards), so it is built directly on the same camera and joined to the same clock
   * the hub already runs its fling on. Absent until `joinTable` resolves.
   */
  let idle: IdleReturnTracker | undefined;
  let leaveIdleClock: (() => void) | undefined;
  let stopIdlePointer: (() => void) | undefined;
  /** The people at this desk, once the room has said who they are. */
  let people: HubPeople | undefined;
  let stopWatching: (() => void) | undefined;
  let unbindOnRelay: (() => void) | undefined;
  let unbindOnRoster: (() => void) | undefined;
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
        `background:${t(inkOf(seat, people?.seats() ?? []) as keyof Palette)};box-shadow:0 0 0 2px ${t("sunkBg")}`;
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
  const mirror: Mirror<LiveStage> = {
    ready: () => {},
    changed: () => {
      if (currentTable && standing) currentTable.send(standing.host.root);
    },
    hand: (items, at, done, feel) => {
      currentTable?.sendRelay({ kind: "hand", items: items as unknown as CarryItem[], at, done, feel });
      people?.handed(items, at, done);
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
    room: (root) => roomFor(game, root),
    // A UNIT IS WHAT MAKES THE ROOM FILL THE GLASS AT ZOOM 1. The host's own unit is the shelf's
    // (tuned for a hand of cards), and a nardy desk measured in it wants a zoom of a quarter to fit —
    // below the floor the limits allow, so the clamp left the board four times too big. Sized off
    // the room instead, "fit" is zoom 1 and the limits are a real range round it.
    unit: (root, view) => unitFor(game, root, view),
    // ...AND THE SAME NUMBER IS THE HUD ETALON. A `Screened` node (the dice handle) measures itself
    // against the host's own, several times the camera's: told the view had shrunk sixfold it grew
    // sixfold to make up for it, a bar across half the glass.
    hudUnit: true,
    open: (ctx) => openZoom(game, ctx),
    // WHERE SOMEBODY IS LOOKING IS PART OF THIS DESK, so a view that moved is news — it is what
    // puts the far reader's own disc where they are actually sitting — or takes it off the felt
    // altogether, once they are looking at their own place again.
    onView: () => people?.publish(),
    // A HAND THAT CHANGED SIZE without anybody having moved: a card landing in one is a change to
    // the furniture alone, and the ring has to be re-measured against what is now in it.
    onDeskChanged: () => people?.settled(),
    // A SHUT HAND CANNOT BE REACHED INTO. Refused at the PICK and not at the drop, because what a
    // shut hand refuses is the gesture ever starting — a card that lifted out and flew back would
    // read as the desk having dropped it.
    // ...and a RING is its owner's alone to move, which is not a grip: a grip cuts the subtree, so a
    // ring gripped to its owner would be a hand nobody could ever be dealt from (`mayTake`).
    may: (n: Node) => (seat ? mayTake(n, seat) : true),
    // A TAP ON ONE'S OWN RING TAKES THAT READER HOME. Anything else falls through to whatever this
    // desk already does with a tap.
    taps: (piece: Node) => people?.tapped(piece) === true,
  });
  standing = live;

  /**
   * THE ZOOM THIS DESK OPENED ON, worked out again from the glass as it stands now — the very sum
   * `liveTable`'s own opening does (`open`, then held between the room's fit and the far limit),
   * so "home" and "opening" cannot drift apart into two different pictures.
   */
  const openHome = (): number => {
    const view = live.host.viewport();
    const root = live.host.root;
    const wish = openZoom(game, { root, room: roomFor(game, root), unit: unitFor(game, root, view), view });
    return live.camera ? Math.max(live.camera.fitZoom(), Math.min(wish, CAM_ZOOM.maxZoom)) : wish;
  };

  joinTable({
    game,
    ...(currentPlace.room ? { room: currentPlace.room } : {}),
    ...(account ? { account } : {}),
    seats: TABLE_SEATS,
  })
    .then((table) => {
      currentTable = table;
      seat = table.seat;
      // THE TURN, NOW THAT THE SEAT IS ACTUALLY KNOWN — the glass was already open and looking at
      // the board from the wrong side of it for however long the round trip took.
      live.camera?.turnTo(seatTurn());
      live.motions?.redraw();
      // ...AND THE IDLE GLIDE, ON THE SAME SEAT — WITHOUT AN AVATAR ON THE FELT. This is the "only
      // idle return" half of `seats`, built straight off `idleReturn` rather than off `liveTable`'s
      // own option, for the reason above the declaration.
      const seatIndex = seat === "p2" ? 1 : 0;
      const place = placesFor(game)[seatIndex];
      if (live.camera && place) {
        idle = idleReturn(
          // HOME IS WHERE THE VIEW OPENED, not the fit — see `homeAt`. Measured afresh on each
          // step rather than remembered from the opening, because the glass may have been turned
          // over since, and a remembered number would bring the eye home to the old phone.
          homeAt(live.camera, () => openHome()),
          // WHERE MY PLACE IS NOW, asked every step and never remembered: a chair can be dragged,
          // and a home read once would bring the eye back to a seat I have since got up from.
          () => {
            const home = people?.placeOf(seat ?? "") ?? place;
            return {
              seat: "",
              place: home,
              name: "",
              ink: "accent",
              state: "online",
              holding: false,
              view: { target: { x: 0, y: 0 }, zoom: 1, rotation: 0, glass: { w: 0, h: 0 } },
            };
          },
          {},
        );
        // ANY POINTER DOWN ON THIS GLASS IS AN INPUT — see `liveTable.ts`'s own listener for `seats`.
        const onDown = (): void => idle?.input();
        container.addEventListener("pointerdown", onDown, true);
        stopIdlePointer = () => container.removeEventListener("pointerdown", onDown, true);
        // THE SAME CLOCK THE FLING BORROWS, joined for the whole life of the table rather than only
        // while something is moving: the idle countdown has to keep counting while the view is dead
        // still, which is exactly what the camera's own borrow (`clock` above) never does.
        leaveIdleClock = cameraClock.join((_seconds, dt) => {
          idle?.step(dt * 1000);
          // THE GLIDE MOVES THE CAMERA DIRECTLY (`idleReturn`), never through `wake`'s own repaint —
          // that path only runs while a fling is being stepped, and this join outlives every fling.
          live.motions?.redraw();
          return false;
        });
      }
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
        people?.publish();
      });

      // THE PEOPLE AT THIS DESK, once the room can be asked who they are. Their discs and their
      // rings are the catalog's (`Live/Cards — with avatars`); what differs is only where the
      // answers come from — the wire, and not a second pane in this document.
      people = hubPeople({
        desk: () => live.host.root,
        mine: () => seat,
        places: placesFor(game),
        view: () => viewNow(),
        // A HAND PER PERSON ON THE CARD TABLE, and none on a board: a piece on a board is on a
        // square, and a patch of felt beside a player would be a place the game has no word for.
        ...(game === "cards" ? { hands: ROUND_R } : {}),
        send: (msg) => table.sendRelay(msg),
        draw: () => {
          live.setRoot(live.host.root, "net");
        },
        // A TAP ON ONE'S OWN RING IS "TAKE ME BACK THERE" — the same glide the idle return runs, on
        // this screen's own tracker, asked for instead of fallen into.
        goHome: () => idle?.goHome(),
      });
      people.roster(table.roster);
      unbindOnRoster = table.onRoster((roster) => people?.roster(roster));
      // A HIDDEN TAB IS NOBODY'S SCREEN — the one piece of state a browser will actually tell us.
      stopWatching = watchPresence(document, (state) => people?.state(state));

      unbindOnRelay = table.onRelay((msg) => {
        if (people?.heard(msg)) return;
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
    stopIdlePointer?.();
    cameraClock.stop();
    for (const dot of farDots.values()) dot.remove();
    live.stop();
    stopHold();
  };
}
