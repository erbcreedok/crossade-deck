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
  handRule,
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
  HOME_ANCHOR,
  holdThePage,
  installStockCarries,
  installStockFlips,
  installStockLayouts,
  installStockSurfaces,
  installTheme,
  liveTable,
  liveCameraHud,
  ROUND_HOME_SPAN,
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
import { storedAccount } from "@crossade/wire";
import { beat } from "../hub/beat.js";
import { goTo, placeOf } from "../hub/route.js";
import { joinTable, type RosterItem, type Table } from "@crossade/wire";
import type { Teardown } from "../hub/catalogue.js";
import { installTableLook } from "../look/surfaces.js";
import { PALETTE } from "../look/palette.js";
import { isTableGame, mapFor, TABLE_SEATS, type TableGame } from "./mapFor.js";
import { syncSeatChairs } from "@game-presets/hand";
import type { SeatedPerson } from "@game-presets/desk";
import { curtain, deskAvatarsTransport, deskSeats, inkOf, SEAT_INKS, type DeskAvatarsTransport } from "@game-presets/desk";
import { chairId, courtLift, handHud, HUD_COURT, untuck, type HandHud } from "@game-presets/desks";
import { apply, byId, composeTransforms, extentOf, fieldsOf, footprint, type CameraHud, type TransformableFields } from "game-kit";

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
function zoneAtFor(
  game: TableGame,
  seat: () => string | null,
  /**
   * THE HAND ON THE GLASS, asked FIRST — a drop aimed at the strip at the foot of the screen is a
   * drop into the box on the felt (`handHud`). It comes first because it is the aim the reader can
   * SEE they are making: the picture is over everything, and a card let go on top of it must not
   * fall through to whatever happens to be lying on the felt underneath.
   */
  onGlass: (at: Vec) => Node | undefined = () => undefined,
): ((root: Node, at: Vec, lead: Node, from?: Node) => Node | undefined) | undefined {
  // A SQUARE OR A POINT A PIECE WAS LIFTED FROM is not put back into by the zone's own hand-over:
  // the ordinary drop already sets the piece down on the seat it left, and a board's places do not
  // reach, so there is no pull to give back through.
  const notFrom = (zone: Node | undefined, from: Node | undefined): Node | undefined => (zone && zone === from ? undefined : zone);
  if (game === "chess") return (root, at, _lead, from) => notFrom(squareAt(root, at), from);
  if (game === "nardy") return (root, at, lead, from) => notFrom(pointUnder(root, at, lead), from);
  // THE NEAREST HAND WITHIN REACH, AND ONLY IF IT WOULD TAKE THE CARD FROM THIS SEAT. One question
  // asked once: a hand the drop is going to refuse must not light up inviting the card first, and
  // both the light and the drop read this line (see the catalog's `Live/Cards`). THE HAND A CARD
  // CAME OUT OF takes it back when it is aimed at — its picture on the glass, or the card put down
  // on it — and never by its pull (`zoneNear`'s `from`).
  return (root, at, lead, from) => {
    const mine = seat();
    if (!mine) return undefined;
    const shown = onGlass(at);
    if (shown && handTakes(shown, lead, mine)) return shown;
    const zone = zoneNear(root, at, lead, from);
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
 * HOW FAR THIS DESK MAY BE ZOOMED, on THIS glass — the shelf's own limits, and the floor let down
 * as far as it takes for the WHOLE PAGE to fit the glass: the owner's rule, "the view can take in
 * the whole game zone". A desk whose page already fits at the shelf's floor keeps the floor.
 */
export function limitsOf(game: TableGame, glass: { readonly width: number; readonly height: number }): { readonly minZoom: number; readonly maxZoom: number } {
  const room = game === "chess" ? chessRoom() : game === "nardy" ? nardyRoom() : roundRoom();
  const unit = unitOfDesk(game);
  const fit = Math.min(glass.width / (room.w * unit), glass.height / (room.h * unit));
  return { minZoom: Math.min(CAM_ZOOM.minZoom, fit > 0 ? fit : CAM_ZOOM.minZoom), maxZoom: CAM_ZOOM.maxZoom };
}

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
 * sitting at it means having it on the HOME ANCHOR of one's own glass — which is what `isHome` reads,
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
  const floor = limitsOf(game, glass).minZoom;
  const behind = Math.max(glass.width, glass.height) / 2 / (unitOfDesk(game) * floor);
  // ...AND THE EYE IS NOT AIMED AT THE SEAT. A place stands at the LOW middle of its owner's glass
  // (`HOME_ANCHOR`), so the point the camera is actually asked to look at is that much FURTHER back
  // than the ring — and it is the AIM the clamp refuses, not the ring. Measured at the widest the
  // view may ever be, exactly as `behind` is, because that is where the drop is worth the most felt.
  const drop = (HOME_ANCHOR.y - 0.5) * glass.height / (unitOfDesk(game) * floor);
  const reach = Math.max(...placesFor(game).map(({ at }) => Math.hypot(at.x, at.y))) + behind + drop;
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
/**
 * WHAT "HOME" IS WORTH AS A ZOOM ON THIS DESK — the kit's own number (`ROUND_HOME_SPAN`, owner: the
 * round table's diameter is 1.5× the glass), and what that number is measured ACROSS.
 *
 * ONE READING FOR BOTH MOMENTS a view can arrive home: `liveTable` hands it to the opening zoom and
 * to the idle glide alike (`seats.homeSpan`), so the desk opens exactly where a tap on the ring — or
 * a view left alone — takes it right back to. Without it the hub opened fitted to its own room and
 * the glide landed on the same fit, which on a phone is the whole table seen from across the room.
 *
 * MEASURED ACROSS THE FELT AND NOT THE ROOM. This desk's room is the felt PLUS half a glass behind
 * every seat (`roomOfDesk`), which is the only reason a place can be brought under its reader at
 * all; a span measured across THAT would say "the table is 1.5 glasses" about a stretch of empty
 * felt three times the table, and the table would open at a third of the size that was asked for.
 *
 * A BOARD NAMES NONE. Chess and nardy are played on the whole board at once, and the fit the kit
 * falls back to is the picture wanted there.
 */
export function homeZoomOfDesk(game: TableGame): { readonly span: number; readonly width: number } | undefined {
  if (game === "chess" || game === "nardy") return undefined;
  return { span: ROUND_HOME_SPAN, width: ROUND_R * 2 };
}

/**
 * WHAT IS COVERING THE TOP OF THE DESK'S OWN REGION, in CSS pixels — handed to the kit
 * (`seats.insets`), which brings home in until the WHOLE desk fits under it (`homeZoom`). Without
 * it a phone with a short glass opened on a table whose far rim was off the top of the screen.
 *
 * THE HUB'S OWN STRIP WITH THE WAY BACK IS NOT IN THIS NUMBER, and that is the point of measuring
 * rather than adding one up: the game's region already starts below the strip (`#stage`, 56px in
 * the page's own stylesheet), so counting the strip here would take the same band off the desk
 * twice. What is here is whatever the page lays OVER that region — the Telegram banner, pinned to
 * the top of the stage and there only inside a webview.
 */
export function topInsetOfStage(container: Element, covers?: readonly Element[]): number {
  const over = covers ?? Array.from(document.querySelectorAll(STAGE_COVERS));
  const top = container.getBoundingClientRect().top;
  let inset = 0;
  for (const one of over) {
    if (getComputedStyle(one).display === "none") continue;
    const box = one.getBoundingClientRect();
    if (box.height <= 0) continue;
    inset = Math.max(inset, box.bottom - top);
  }
  return inset;
}

/** Everything the page is allowed to lay over a running desk — see `topInsetOfStage`. */
const STAGE_COVERS = "#tg-banner";

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
function playFor(game: TableGame, seat: () => string | null, onGlass: (at: Vec) => Node | undefined): LiveTableOptions<LiveStage> {
  const zones = zoneAtFor(game, seat, onGlass);
  if (game === "cards") {
    return {
      ...(zones ? { zones } : {}),
      // WHAT IS TOUCHING WHAT IS A HEAP, and a heap gets a handle — the deck's own tab.
      stacking: true,
      heapKindOf,
      // ...AND A HAND IS ITS OWNER'S ARRAY (`handRule`): its own handle lifts its cards and whatever
      // was thrown onto the box while it is open, and nothing on the felt is islanded with a card
      // inside a hand. The same rule the catalog's `Live/Cards` plays by.
      rule: handRule(),
      grip: GRIP_SPEC,
      // A THROW IS ON: a card flicked across the felt travels, which is the whole of a card table.
      letGo: "throw",
      // ...AND A TAP TURNS WHAT IT LANDED ON, which on a closed pile is the top of the deck.
      flipping: true,
      // THE PAGE IS A WALL TO A RELEASE AND THE FELT A TRAP (`roundWalls`) — and NOTHING to a hand:
      // a card is carried wherever the finger goes, off the page too, and it is the DROP that
      // decides. Let go over the hand on the glass, it goes into the hand; let go off the page, it
      // flies back to the nearest point on it (the picture of its landing already stands there);
      // a throw on the page bounces off the page's edge and may fly onto the table, a throw on the
      // table bounces off the felt's edge from inside and never leaves it. A tray on the carry
      // would end the gesture at the page's edge and fling the card back in the moment the finger
      // crossed it — which is the one thing a finger holding a card must never feel. Said outright
      // (`trayOf` answering nothing), because a desk that says nothing gets the kit's own box.
      trayOf: () => undefined,
      pieces: { wallsOf: (piece: Node) => roundWalls(piece) },
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
  /** What home is worth as a zoom here — read once, and by both moments a view arrives at it. */
  const homeZoom = homeZoomOfDesk(game);

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
  let peopleWire: DeskAvatarsTransport | undefined;
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
        `background:${t(inkOf(seat) as keyof Palette)};box-shadow:0 0 0 2px ${t("sunkBg")}`;
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
      liftedFromGlass(items, done);
      // ...AND WHAT IS IN THE AIR IS OUT OF THE PICTURE while it is: a card drawn under the finger
      // and still lying in the strip is one card shown twice.
      hand?.lifting(done ? [] : items.map((it) => it.id));
      // ...AND A CARD CARRIED DOWN OVER THE HAND ON THE GLASS COURTS IT (`courtHand`).
      courtHand(items, done, feel.lift);
      redraw();
    },
  };

  /**
   * HOW MUCH OF THE CARRIED CARD IS INSIDE THE HUD'S REACH, remembered from the last move — the
   * drop reads it: past `HUD_COURT`, a release is a release into the hand, wherever the finger is.
   */
  let entered = 0;
  /**
   * A CARRIED CARD COURTS THE HAND ON THE GLASS — the owner's rule (`handHud`): as the card comes
   * down over the HUD's reach it is hoisted, rising and growing with how much of it is inside,
   * until past `HUD_COURT` it is the hand's own card size; the hand shows the outline of the place
   * it would take, and comes out from under the bar if it was tucked. Measured on the card AS DRAWN
   * (the clock's own map, through the camera), because that is the card the eye is judging by.
   */
  const courtHand = (items: readonly { readonly id: string; readonly still?: boolean | undefined }[], done: boolean, liftFeel: number | undefined): void => {
    const lead = items.find((it) => !it.still);
    const camera = live.camera;
    if (!hand || !seat || !camera || !lead || done) {
      if (lead) live.motions?.hoist(lead.id);
      hand?.court(false);
      entered = 0;
      return;
    }
    const piece = byId(live.host.root, lead.id);
    const shape = piece ? footprint(piece) : undefined;
    const drawn = live.motions?.reach().get(lead.id);
    if (!shape || !drawn) return;
    const view = camera.transform();
    const onGlass = composeTransforms(view, drawn);
    const size = extentOf(shape);
    const px = Math.hypot(onGlass.a, onGlass.b);
    const turn = Math.atan2(onGlass.b, onGlass.a);
    const tall = (Math.abs(size.w * Math.sin(turn)) + Math.abs(size.h * Math.cos(turn))) * px;
    const centre = apply(onGlass, { x: 0, y: 0 });
    entered = hand.entering({ y: centre.y - tall / 2, h: tall });
    // THE HAND'S CARD OVER THE FELT'S — the size the card grows to, as a lift over its resting size.
    // A CARD OUT OF A CHAIR RESTS SMALL (`HAND_SCALE`, its own scale), and the lift is a factor over
    // that: so its base lift is the ordinary one over its own scale, which is the card at the size
    // it will have on the felt — hoisted from the first move, not only inside the reach.
    const feltPx = Math.hypot(view.a, view.b) * size.w;
    const drawnAt = (piece ? fieldsOf<TransformableFields>(piece, "Transformable")?.scale : undefined) ?? 1;
    const base = (liftFeel ?? DEFAULT_TUNING.lift) / (drawnAt > 0 ? drawnAt : 1);
    live.motions?.hoist(lead.id, entered > 0 ? courtLift(entered, base, feltPx > 0 ? hand.cardPx() / feltPx : base) : drawnAt !== 1 ? base : undefined);
    if (entered > 0) {
      const chair = byId(live.host.root, chairId(seat));
      if (chair && untuck(chair)) deskWritten();
    }
    hand.court(entered > 0);
  };

  /** What is in the air is out of the picture on the glass for as long as it is (`handHud`). */
  const liftedFromGlass = (items: readonly { readonly id: string }[], done: boolean): void => {
    hand?.lifting(done ? [] : items.map((it) => it.id));
  };

  // THE PLAYER'S OWN HAND AT THE FOOT OF THE GLASS (`handHud`) and the camera's own pair in the
  // corner — both named HERE, above the desk that will report to them.
  //
  // A desk reports its first change from INSIDE the call that builds it (the deck's handles are
  // drawn before a frame is), so `onDeskChanged` runs while this function is still on its way up:
  // named after the desk, these two would be read in the dead zone before their bindings exist and
  // the whole table would fall over on the way up — which is exactly how it fell over once.
  let hand: HandHud | undefined;
  let hud: CameraHud | undefined;
  /**
   * A HAND THAT CHANGED SIZE without anybody having moved: a card landing in one is a change to
   * the furniture alone, and the ring has to be re-measured against what is now in it — AND THE
   * PICTURE OF IT ON THE GLASS with it: the strip is the size of what is in the hand, and the
   * camera's own controls stand clear of whatever that came to (`floor`).
   */
  const deskChanged = (): void => {
    avatars?.settled();
    hand?.refresh();
    hud?.fit();
    redraw();
  };
  /** MY OWN WRITE ON THE DESK outside a gesture — re-dressed here, and told to the room like a drop. */
  const deskWritten = (): void => {
    deskChanged();
    mirror.changed();
  };
  const live = liveTable<LiveStage>(container, initialRoot, {
    ...playFor(game, () => seat, (at) => handUnderFinger(at)),
    // A PICTURE OF A CARD ON THE GLASS IS A WAY OF REACHING THE CARD: a finger landing on the strip
    // at the foot of the screen takes the card that lies in the box on the felt (`handHud`).
    standIn: (n: Node) => hand?.standFor(n),
    painter: (view, size) => pixiPainter(view, size),
    clock,
    mirror,
    limits: limitsOf(game, { width: container.clientWidth, height: container.clientHeight }),
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
      ...(homeZoom ? { homeSpan: homeZoom.span, homeWidth: homeZoom.width } : {}),
      // WHAT IS OVER THE TOP OF THIS REGION, so the desk opens WHOLE under it (`topInsetOfStage`).
      insets: { top: topInsetOfStage(container) },
    },
    // WHERE SOMEBODY IS LOOKING IS PART OF THIS DESK, so a view that moved is news — it is what
    // puts the far reader's own disc where they are actually sitting — or takes it off the felt
    // altogether, once they are looking at their own place again.
    onView: () => {
      avatars?.publish();
      // A TWO-FINGER TILT CHANGES THE CAMERA WITHOUT TOUCHING THE BUTTON — `fit()` re-reads
      // `tilted()` off the camera the same way it already re-reads the hand's own `floor()`.
      hud?.fit();
      redraw();
    },
    onDeskChanged: () => deskChanged(),
    // A SHUT HAND CANNOT BE REACHED INTO. Refused at the PICK and not at the drop, because what a
    // shut hand refuses is the gesture ever starting — a card that lifted out and flew back would
    // read as the desk having dropped it.
    // ...and a RING is its owner's alone to move, which is not a grip: a grip cuts the subtree, so a
    // ring gripped to its owner would be a hand nobody could ever be dealt from (`mayTake`).
    // ...AND THE CARDS AT A CHAIR ARE AN INDICATOR, not pieces to lift off the felt: a card in a
    // hand is taken through its picture on the owner's glass (`via`) and never off the chair.
    may: (n: Node, via?: Node) => (via === undefined && n.parent !== null && isHand(n.parent) ? false : seat ? mayTake(n, seat) : true),
    // A TAP ON ONE'S OWN RING TAKES THAT READER HOME. Anything else falls through to whatever this
    // desk already does with a tap.
    // ...AND A TAP ON A CARD AT A CHAIR TURNS NOTHING: the indicator is looked at, not played.
    taps: (piece: Node) => (piece.parent !== null && isHand(piece.parent)) || (seat ? avatars?.tapped(seat, piece) === true : false),
    // THE BAR ABOVE ONE'S OWN HAND — shut, hide, turn over, pin — answered for the owner only; the
    // wiring tells the room the way it tells it a drop (`settle`).
    presses: (_meaning, control: Node) => {
      if (!seat) return false;
      // WHERE MY OWN HAND IS DRAWN IS THIS SCREEN'S BUSINESS, not the desk's: the control that puts
      // it on the glass is answered here and never sent to the room, because nothing about the felt
      // changed. Everything else on the bar is a fact about the desk and goes to the people wiring.
      return avatars?.pressed(seat, control) === true;
    },
  });
  standing = live;
  /**
   * THE DESK IS COVERED UNTIL IT KNOWS WHOSE SIDE IT IS SEEN FROM — raised once the seat has
   * arrived and the view has been taken home, and never before (`curtain.ts`).
   */
  const cover = curtain(container, PALETTE.felt);
  // THE CAMERA'S OWN TWO CONTROLS IN THE CORNER — the kit's, wired in one line. North is on every
  // desk; the place button appears because this desk names seats, and it asks for exactly what a tap
  // on one's own ring asks for, so the two can never take a reader to two different places.
  hud = liveCameraHud(live, { floor: () => hand?.floor() ?? 0 });
  /**
   * A DROP AIMED AT THE STRIP ON THE GLASS IS A DROP INTO THE HAND ON THE FELT — the same box, asked
   * for by pointing at its picture. There is one hand, so there is one answer: the chair.
   */
  const handUnderFinger = (at: Vec): Node | undefined => {
    // NOT GATED ON THE HAND BEING PINNED YET: while the anchor is up the drop belongs here too, and
    // `overHand` is the one that knows which of the two is under the finger.
    if (!hand || !seat || !live.camera) return undefined;
    // A CARD THAT IS MOSTLY IN THE HUD IS THE HAND'S, wherever the finger is (`courtHand`).
    if (entered >= HUD_COURT) return byId(live.host.root, chairId(seat));
    return hand.overHand(apply(live.camera.transform(), at)) ? byId(live.host.root, chairId(seat)) : undefined;
  };
  const handOnGlass = (): void => {
    if (hand || !seat || game !== "cards" || !hud) return;
    hand = handHud(live.host, { seat, desk: () => live.host.root, ink: inkOf(seat), screen: hud.root });
    hand.refresh();
    hud.fit();
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
      // ...AND THE PLAYER'S OWN HAND ON THE GLASS, now that this screen knows whose it is.
      handOnGlass();
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
        // ...AND THE HAND ON THE GLASS IS A PICTURE OF THAT TREE: a card somebody else dealt into
        // this hand arrives as a revision and nowhere else, so this is where the strip hears of it.
        hand?.refresh();
        hud?.fit();
        redraw();
      });

      // THE PEOPLE AT THIS DESK, once the room can be asked who they are. Their discs and their
      // rings are the kit's own (`withAvatars`); what differs is only where the answers come from —
      // the wire (`peopleWire`, a relay transport), and not a second pane in this document.
      peopleWire = deskAvatarsTransport({
        mine: () => seat,
        view: () => viewNow(),
        send: (msg) => table.sendRelay(msg),
      });
      avatars = withAvatars({
        desk: () => live.host.root,
        seats: deskSeats(TABLE_SEATS),
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
      if (game === "cards") syncSeatChairs(live.host.root, sitting(table.roster), placesFor(game));
      peopleWire.roster(table.roster);
      avatars.publish();
      // ...AND THE HAND ON THE GLASS, now that the chairs are standing: the strip is a picture of a
      // chair, and a picture drawn before there was one is an empty foot of the screen for ever.
      handOnGlass();
      hand?.refresh();
      hud?.fit();
      redraw();
      unbindOnRoster = table.onRoster((roster) => {
        if (game === "cards") syncSeatChairs(live.host.root, sitting(roster), placesFor(game));
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

      // THE COVER COMES OFF ON A FRAME THAT IS ALREADY HOME — the view was taken to this screen's
      // own place above, the tree that arrived is standing, and the chairs are up. Everything the
      // owner used to watch happen (a middle-of-the-room table, a chair popping in, the camera
      // sliding after it) happened while the desk was still hidden. See `curtain.ts`.
      cover.raise();

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
      // A DESK NOBODY COULD JOIN IS STILL SHOWN. The cover is there because the seat is not known
      // yet, and a join that failed is an answer too — held down, it would leave a player looking
      // at a blank rectangle with no way to tell it from a dead screen.
      cover.raise();
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
    cover.raise();
    peopleWall.remove();
    hand?.stop();
    hud?.stop();
    live.stop();
    stopHold();
  };
}
