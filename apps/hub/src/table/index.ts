import {
  chessRoom,
  mayThrow,
  nardyRoom,
  runOf,
  seatsOf,
  settled,
  squareAt,
  pointUnder,
  wallsOf as nardyWallsOf,
} from "@game-presets/desks";
import { throwFromCarry } from "@game-presets/dice";
import {
  attachMotion,
  Camera,
  wireCamera,
  wireDrag,
  unwireDrag,
  attachPainter,
  byId,
  caps,
  draggable,
  extentOf,
  footprint,
  holdThePage,
  installStockCarries,
  installStockFlips,
  installStockLayouts,
  installStockSurfaces,
  installTheme,
  landingPicture,
  mount,
  setRev,
  type CameraContent,
  type CarryItem,
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
  const root = mapFor(game);
  // Re-dresses the board's own backdrop in the hub's look — AFTER the map above has registered its
  // own, so the override is the one left standing.
  installTableLook();
  return root;
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

/**
 * THE STRETCH THE CAMERA IS HELD INSIDE — the board's own room (chess and nardy already draw a
 * felt wider than their board face) plus a further margin, wide enough that a captured piece or a
 * thrown die has somewhere to land beside the board rather than off the glass.
 *
 * Cards has no room of its own: its root IS the playing area, so the margin is drawn round its
 * footprint directly.
 */
function roomFor(game: TableGame, root: Node): CameraContent {
  const room = game === "chess" ? chessRoom() : game === "nardy" ? nardyRoom() : undefined;
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

export function startTable(container: HTMLElement): Teardown {
  installTheme(document, "dark");
  const stopHold = holdThePage();

  const currentPlace = placeOf();
  const game: TableGame = isTableGame(currentPlace.game) ? currentPlace.game : "cards";
  const account = storedAccount();

  let unbindOnTree: (() => void) | undefined;
  let currentTable: Table | null = null;
  let isNetworkUpdate = false;

  let initialRoot = buildInitialDesk(game);
  const host = mount(container, initialRoot);
  const vp = host.viewport();
  const painter = pixiPainter(host.view, { width: vp.width, height: vp.height, resolution: vp.dpr });

  // THE CAMERA — the board opens FIT, with room round it for a captured piece or a thrown die
  // (`roomFor`), and a finger over bare felt pans and pinches the view instead of dragging nothing
  // (`docs/design/camera.md`, the same wiring the catalog's `Live/*` stories open under).
  const camera = new Camera(CAM_ZOOM);
  const view = (): ReturnType<Camera["transform"]> => camera.transform();
  const pitch = (): number => camera.pitch;
  const stopPainter = attachPainter(host, painter, { view, pitch });
  const motions = attachMotion(host, painter, { view, pitch });

  // A THROW OR A PINCH NEEDS A CLOCK, and the camera has none of its own (`guard.one-clock`): the
  // table keeps its own `beat` (`hub.one-clock` guards a HUB shelf against a second loop of its
  // own, and this screen is not the shelf), joined only while a fling is actually moving.
  const repaintCamera = (): void => motions.redraw();
  const cameraClock = beat(repaintCamera);
  let leaveClock: (() => void) | undefined;
  const wakeCamera = (): void => {
    if (leaveClock) return;
    leaveClock = cameraClock.join((_seconds, dt) => {
      const going = cameraControl.step(dt);
      if (!going) {
        leaveClock?.();
        leaveClock = undefined;
      }
      return true;
    });
  };
  const cameraControl = wireCamera({
    host,
    camera,
    content: () => roomFor(game, host.root),
    // A FINGER OVER A PIECE MOVES THE PIECE; over bare felt it pans and pinches the view — the same
    // arbitration the catalog's map opens with, read off the same `draggable` capability `wireDrag`
    // already asks the tree for.
    claims: draggable,
    onView: wakeCamera,
  });

  // WHERE THE VIEW OPENS — once, and not before there is a glass to open it on (a Storybook-style
  // shell hands the element back before it is laid out, and a host asked for its size that early
  // reports one pixel by one). A LATCH, not a line: re-applying it on every resize would drag a
  // reader who has already panned back to the middle of the board.
  let cameraOpened = false;
  const openCamera = (): void => {
    const v = host.viewport();
    if (cameraOpened || v.width <= 1 || v.height <= 1) return;
    cameraOpened = true;
    const room = roomFor(game, host.root);
    camera.setZoom(camera.fitZoom());
    camera.lookAt({ x: room.x + room.w / 2, y: room.y + room.h / 2 });
    repaintCamera();
  };
  openCamera();
  const stopFitting = host.onChange(() => {
    cameraControl.refresh(); // a resize is a new glass, and the clamp has to know
    openCamera();
  });

  // THE PICTURE OF WHERE A CARRIED RUN WILL COME DOWN — one per view, shown while a hand moves and
  // ended the instant it lets go (`onCarry` below).
  const landingPic = landingPicture({ host, motions }, { shown: true });

  const zoneAt = zoneAtFor(game);

  // NARDY'S DICE THROW: a die is `Rollable`, and letting go of it WITH SPEED rolls a fresh face and
  // slides it across the band it was thrown in (`wallsOf` — the board or whichever side of it); a
  // gentle let-go falls through and the die is simply put down, face as it was. `mayThrow` keeps a
  // column of checkers out of this branch — the one thing this shelf never throws.
  const onDiceRelease = (velocity: Vec | undefined, items: readonly CarryItem[]): boolean => {
    const root = host.root;
    if (!mayThrow(items, root)) return false;
    const poses = motions.poses();
    let inFlight = 0;
    let threw = false;
    for (const it of items) {
      const piece = byId(root, it.id);
      if (!piece || !caps(piece).has("Rollable")) continue;
      const pose = poses?.get(it.id);
      const at = pose ? { x: pose.e, y: pose.f } : { x: 0, y: 0 };
      const walls = nardyWallsOf(piece, at);
      inFlight += 1;
      const face = throwFromCarry(motions, root, piece, {
        outcome: { rng: Math.random },
        ...(walls ? { walls } : {}),
        onRest: () => {
          inFlight -= 1;
          if (inFlight <= 0) {
            settled(root);
            host.setRoot(root);
          }
        },
      });
      if (face !== undefined) threw = true;
    }
    return threw;
  };

  // ONE wiring per view, not two. wireDrag is idempotent on the same element: a second call with
  // the same `el` only replaces the options object, never attaches more listeners. So we call it
  // once here to register the pointer handlers, and again after joinTable — with { actor } — to
  // hand the seat to every subsequent gesture. Two calls on different scene objects but the same
  // view would still be one set of listeners; two calls on the same scene object are the same thing.
  const dragScene = { host, motions, el: host.view };
  const dragOptions = {
    // A FINGER'S TOUCH IS READ THROUGH THE SAME CAMERA THE PAINTER DRAWS THROUGH, or a tap and the
    // picture it landed on would disagree the moment the view is panned or zoomed off its rest.
    view,
    ...(zoneAt ? { zoneAt } : {}),
    // A COLUMN OF CHECKERS IS ONE RUN, and the hand's whole answer to "what stood above the one I
    // touched" (`runOf`) and "where does each of them sit, relative to the anchor" (`seatsOf`, the
    // point's own idea of a column). Chess and cards move one piece at a time and need neither.
    ...(game === "nardy"
      ? {
          runOf,
          offsetOf: seatsOf,
          onRelease: onDiceRelease,
          // A DIE PUT DOWN GENTLY never reaches `onDiceRelease`'s throw (it falls through to the
          // ordinary drop below), and a checker moved off the head can leave the handle floating
          // over empty felt — so every settle, thrown or not, puts it back under the pair.
          onSettled: (r: Node) => {
            settled(r);
            host.setRoot(r);
          },
        }
      : {}),
    onCarry: ({ ids, at, done, feel }: { ids: readonly string[]; at: Vec; done: boolean; feel: any }) => {
      if (done) {
        landingPic.end();
        return;
      }
      if (!zoneAt) return;
      const root = host.root;
      const lead = ids[0] ? byId(root, ids[0]) : undefined;
      const zone = lead ? zoneAt(root, at, lead) : undefined;
      landingPic.show(at, zone, feel, []);
    },
  };
  wireDrag(dragScene, dragOptions);

  joinTable({
    game,
    ...(currentPlace.room ? { room: currentPlace.room } : {}),
    ...(account ? { account } : {}),
    seats: 2,
  })
    .then((table) => {
      currentTable = table;
      if (table.seat) {
        wireDrag(dragScene, { ...dragOptions, actor: table.seat });
      }
      // WHOSE HAND DID WHAT, in a colour the desk actually has. The server names seats `p1`, `p2`…
      // and a mark is drawn in its actor's ink; asked for a paint called "p1" the painter threw, and
      // the throw happened inside `setRoot` — before the tree was ever sent, so the other player saw
      // nothing move. Seats get the shelf's own inks, own marks are not shown (see Live/Cards), and
      // the far player's marks fade after a while.
      const inks = Object.fromEntries(SEAT_INKS.map((ink, i) => [`p${i + 1}`, ink]));
      host.setViewer({ ...host.viewer(), marks: { inks, ttlMs: 5000, showOwn: false, ...(table.seat ? { me: table.seat } : {}) } });
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
        isNetworkUpdate = true;
        host.setRoot(sRoot);
        isNetworkUpdate = false;
      }

      if (import.meta.env?.DEV || typeof window !== "undefined") {
        (window as any).__TABLE__ = { table, host };
      }

      unbindOnTree = table.onTree((newRoot) => {
        isNetworkUpdate = true;
        host.setRoot(newRoot);
        isNetworkUpdate = false;
      });
    })
    .catch((err) => {
      console.error("joinTable error:", err);
    });

  const originalSetRoot = host.setRoot.bind(host);
  host.setRoot = (nextRoot) => {
    originalSetRoot(nextRoot);
    if (!isNetworkUpdate && currentTable) {
      currentTable.send(nextRoot);
    }
  };

  return () => {
    unbindOnTree?.();
    currentTable?.leave();
    stopFitting();
    cameraClock.stop();
    cameraControl.stop();
    unwireDrag(dragScene.el);
    motions.stop();
    stopPainter();
    host.unmount();
    stopHold();
  };
}
