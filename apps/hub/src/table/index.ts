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
  chessRoom,
  mayThrow,
  nardyRoom,
  NARDY_BUMP,
  runOf,
  seatOf,
  seatsOf,
  settled,
  squareAt,
  pointUnder,
  roundRoom,
  roundWalls,
  wallsOf as nardyWallsOf,
  ANCHOR_MARK,
} from "@game-presets/desks";
import { throwDie } from "@game-presets/dice";
import {
  byId,
  caps,
  extentOf,
  footprint,
  GRIP_SPEC,
  heapOf,
  holdThePage,
  installStockCarries,
  installStockFlips,
  installStockLayouts,
  installStockSurfaces,
  installTheme,
  liveTable,
  setRev,
  type CameraContent,
  type LiveClock,
  type LiveStage,
  type LiveTableOptions,
  type Mirror,
  type Node,
  type Vec,
} from "game-kit";
import { pixiPainter } from "game-kit/pixi";
import { storedAccount } from "../account/account.js";
import { beat } from "../hub/beat.js";
import { goTo, placeOf } from "../hub/route.js";
import { joinTable, type Table } from "../online/table.js";
import type { Teardown } from "../hub/catalogue.js";
import { installTableLook } from "../look/surfaces.js";
import { isTableGame, mapFor, type TableGame } from "./mapFor.js";

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
function zoneAtFor(game: TableGame): ((root: Node, at: Vec, lead: Node) => Node | undefined) | undefined {
  if (game === "chess") return (root, at) => squareAt(root, at);
  if (game === "nardy") return (root, at, lead) => pointUnder(root, at, lead);
  return undefined;
}

/** The inks seats are marked in, in seat order — the same pair every live page on the shelf uses. */
const SEAT_INKS = ["accent", "alert", "textMuted", "text"] as const;

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
 * HOW THIS DESK IS PLAYED — the whole difference between the three, as data.
 *
 * Every field here is a `liveTable` option under the name the catalog's own `Live/*` story passes it
 * by, so "the hub plays the desk the shelf shows" is something a reader can check line by line
 * rather than take on trust.
 */
function playFor(game: TableGame): LiveTableOptions<LiveStage> {
  const zones = zoneAtFor(game);
  if (game === "cards") {
    return {
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
   * one that had just arrived. A hand in flight is not mirrored yet: the server carries trees, not
   * gestures, and the far screen sees the piece land rather than travel.
   */
  /**
   * The desk, once it exists — and it does not while it is being built. The wiring announces its
   * first tree write from INSIDE the call that returns it (the deck's handles are drawn before a
   * frame is), so a mirror reaching for the desk by name would be reading a binding that has not
   * been assigned yet. There is no room to tell at that moment either: the wire is joined later.
   */
  let standing: ReturnType<typeof liveTable> | undefined;
  const mirror: Mirror<LiveStage> = {
    ready: () => {},
    changed: () => {
      if (currentTable && standing) currentTable.send(standing.host.root);
    },
    hand: () => {},
  };

  const live = liveTable<LiveStage>(container, initialRoot, {
    ...playFor(game),
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
    unit: (root, view) => {
      const room = roomFor(game, root);
      return Math.max(1, Math.min(view.width / room.w, view.height / room.h));
    },
    // ...AND THE SAME NUMBER IS THE HUD ETALON. A `Screened` node (the dice handle) measures itself
    // against the host's own, several times the camera's: told the view had shrunk sixfold it grew
    // sixfold to make up for it, a bar across half the glass.
    hudUnit: true,
    open: (ctx) => openZoom(game, ctx),
  });
  standing = live;

  joinTable({
    game,
    ...(currentPlace.room ? { room: currentPlace.room } : {}),
    ...(account ? { account } : {}),
    seats: 2,
  })
    .then((table) => {
      currentTable = table;
      seat = table.seat;
      // THE TURN, NOW THAT THE SEAT IS ACTUALLY KNOWN — the glass was already open and looking at
      // the board from the wrong side of it for however long the round trip took.
      live.camera?.turnTo(seatTurn());
      live.motions?.redraw();
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
      });
    })
    .catch((err) => {
      console.error("joinTable error:", err);
    });

  return () => {
    unbindOnTree?.();
    currentTable?.leave();
    cameraClock.stop();
    live.stop();
    stopHold();
  };
}
