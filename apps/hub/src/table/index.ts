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
} from "@game-presets/desks";
import { throwFromCarry } from "@game-presets/dice";
import {
  alsoInTheWay,
  attachMotion,
  bumped,
  Camera,
  wireCamera,
  wireDrag,
  unwireDrag,
  attachPainter,
  byId,
  caps,
  compose,
  draggable,
  dropOf,
  extentOf,
  fieldsOf,
  footprint,
  GRIP_SPEC,
  heapOf,
  holdThePage,
  installStockCarries,
  installStockFlips,
  installStockLayouts,
  installStockSurfaces,
  installTheme,
  isDrawn,
  isGrip,
  landed,
  landingPicture,
  mapWalls,
  mount,
  regrasp,
  regrip,
  seatIn,
  setRev,
  shoves,
  Transformable,
  type CameraContent,
  type CarryItem,
  type Node,
  type TransformableFields,
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

export function startTable(container: HTMLElement): Teardown {
  installTheme(document, "dark");
  const stopHold = holdThePage();

  const currentPlace = placeOf();
  const game: TableGame = isTableGame(currentPlace.game) ? currentPlace.game : "cards";
  const account = storedAccount();

  let unbindOnTree: (() => void) | undefined;
  let currentTable: Table | null = null;
  let isNetworkUpdate = false;

  // THE DECK'S OWN HANDLE, cards only — see `heapKindOf`. `heaps` is what each tab currently holds,
  // read by the drag wiring's `runOf` below; `inHand` is the tab a local gesture is carrying, kept
  // out of the next redraw exactly the way `gestureScene.ts` keeps it (`regrip`'s own `keep` arg).
  let heaps: Map<string, readonly Node[]> = new Map();
  let inHand: string | undefined;

  let initialRoot = buildInitialDesk(game);
  // THE FIRST TAB, before there is a glass or a network tree to draw it into — one screen dealing a
  // fresh table needs it from the very first frame, not from the first gesture.
  if (game === "cards") heaps = regrip(initialRoot, heapKindOf, GRIP_SPEC);
  const host = mount(container, initialRoot);
  const vp = host.viewport();
  const painter = pixiPainter(host.view, { width: vp.width, height: vp.height, resolution: vp.dpr });

  // THE CAMERA — the board opens FIT, with room round it for a captured piece or a thrown die
  // (`roomFor`), and a finger over bare felt pans and pinches the view instead of dragging nothing
  // (`docs/design/camera.md`, the same wiring the catalog's `Live/*` stories open under).
  const camera = new Camera(CAM_ZOOM);
  const view = (): ReturnType<Camera["transform"]> => camera.transform();
  const pitch = (): number => camera.pitch;
  const rotation = (): number => camera.rotation;
  const stopPainter = attachPainter(host, painter, { view, pitch, rotation });
  const motions = attachMotion(host, painter, { view, pitch, rotation });

  /** Nothing in the air or in a hand ever counts as lying on the felt — the same guard `gestureScene.ts` reads off its own clock. */
  const aloftCards = (id: string): boolean => motions.busy(id);
  /** MY OWN CHANGE: throw every tab away and draw it afresh — see `regrip`. */
  const regripCards = (root: Node): void => {
    heaps = regrip(root, heapKindOf, GRIP_SPEC, aloftCards, inHand);
  };
  /**
   * A CHANGE THAT ARRIVED OVER THE WIRE: the tabs in `root` are whichever screen made the change's
   * own, already sitting in the tree it sent — `regrasp` only relabels which pieces each already
   * holds, so a tab this screen's own finger is on is never pulled out from under it mid-gesture.
   */
  const regraspCards = (root: Node): void => {
    heaps = regrasp(root, heapKindOf, aloftCards);
  };

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
  const unitOf = (): number => {
    const v = host.viewport();
    const room = roomFor(game, host.root);
    return Math.max(1, Math.min(v.width / room.w, v.height / room.h));
  };
  // ONE UNIT FOR THE CAMERA AND THE PLAN. A `Screened` node (the dice handle) measures itself
  // against the HOST's unit — and the host's own is the shelf's, tuned for a hand of cards and
  // several times the camera's. Against that etalon the handle was told the view had shrunk
  // sixfold and grew sixfold to make up for it: a bar across half the glass. Told the camera's
  // unit, "zoom 1" is the same number to both and the handle is its drawn size.
  let unitTold = -1;
  const tellUnit = (): void => {
    const u = unitOf();
    if (Math.abs(u - unitTold) < 0.01) return;
    unitTold = u;
    host.setViewer({ ...host.viewer(), hudUnit: u });
  };
  const cameraControl = wireCamera({
    host,
    camera,
    content: () => roomFor(game, host.root),
    // A UNIT IS WHAT MAKES THE ROOM FILL THE GLASS AT ZOOM 1. The host's own unit is the shelf's
    // (tuned for a hand of cards), and a nardy desk measured in it wants a zoom of a quarter to fit —
    // below the floor the limits allow, so the clamp left the board four times too big. Sized off
    // the room instead, "fit" is zoom 1 and the limits are a real range round it.
    unit: unitOf,
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
  /**
   * WHICH SEAT THIS GLASS IS, once the server has said — `p1`/`p2`, never a game's own names: the
   * room is one server room for every game, and chess is the only one that cares which of the two
   * it is. Known only after `joinTable` resolves, which is AFTER the camera has usually already
   * opened (`openCamera` is a latch on the first real layout, and the network round trip is slower
   * than that on any connection worth calling one) — so the turn below is applied twice: once here,
   * for the rare case the seat is already known, and once where the seat actually arrives.
   */
  let seat: string | null = null;
  /** Chess only: the second seat looks at the SAME board turned 180°, own back rank nearest it. */
  const seatTurn = (): number => (game === "chess" && seat === "p2" ? 180 : 0);
  const openCamera = (): void => {
    const v = host.viewport();
    if (cameraOpened || v.width <= 1 || v.height <= 1) return;
    cameraOpened = true;
    const room = roomFor(game, host.root);
    tellUnit();
    cameraControl.refresh(); // the glass and the room must be known before a fit is measured
    // THE ROOM IS WHERE THE EYE MAY GO; THE BOARD IS WHAT IT OPENS ON. Fitted to the whole room a
    // chess board came up a third of a phone wide — the room is the felt, the zone under it and
    // the margins, most of it empty on the first frame. So the opening zoom fits the BOARD plus a
    // rim of `OPEN_RIM` units — enough to see a taken piece set down beside it — and the room stays
    // the limit a pan runs into, not the picture.
    // ...AND A DESK WHOSE ROOT IS THE PLAYING AREA HAS NO SEPARATE FACE. The round table is one
    // felt: asked for a "board face" it has none, and the fit fell back to the whole ROOM — the
    // circle plus two margins — which opens a table twelve units across on a glass measured for
    // twenty. Its own footprint is the face, and it is the same picture the other two open on.
    const face = byId(host.root, "board face");
    const box = face ? footprint(face) : game === "cards" ? footprint(host.root) : undefined;
    let { w: bw, h: bh } = box ? extentOf(box) : { w: room.w, h: room.h };
    // THE DICE LIVE OUTSIDE THE BOARD — in the band beside it — and an opening fitted to the board
    // alone put them past the edge of a phone. The view opens centred on the board, so the farthest
    // die counts twice: as far as it sits on one side, that much room on the other.
    for (const piece of host.root.children) {
      if (!caps(piece).has("Rollable")) continue;
      const { x, y } = seatOf(piece);
      bw = Math.max(bw, 2 * (Math.abs(x) + 0.8));
      bh = Math.max(bh, 2 * (Math.abs(y) + 0.8));
    }
    const unit = unitOf();
    // THE ROUND TABLE OPENS OVERFILLING THE GLASS ON PURPOSE — a fit that shows the whole rim reads
    // as a coin on a phone; the owner wants the circle wider than the screen, its sides run off the
    // edges and only the top is ever in view. `bw` here is the circle's own diameter (its footprint
    // is square), so the target is that diameter times `CARDS_OVERFILL`, not the usual board+rim fit.
    const open =
      game === "cards"
        ? (v.width * CARDS_OVERFILL) / (bw * unit)
        : Math.min(v.width / ((bw + OPEN_RIM * 2) * unit), v.height / ((bh + OPEN_RIM * 2) * unit));
    camera.setZoom(Math.max(camera.fitZoom(), Math.min(open, CAM_ZOOM.maxZoom)));
    camera.lookAt({ x: room.x + room.w / 2, y: room.y + room.h / 2 });
    camera.turnTo(seatTurn());
    repaintCamera();
  };
  openCamera();
  const stopFitting = host.onChange(() => {
    tellUnit();
    cameraControl.refresh(); // a resize is a new glass, and the clamp has to know
    openCamera();
  });

  // THE PICTURE OF WHERE A CARRIED RUN WILL COME DOWN — one per view, shown while a hand moves and
  // ended the instant it lets go (`onCarry` below).
  const landingPic = landingPicture({ host, motions }, { shown: true });
  /**
   * HOW FAR THE LOAD IS HANGING ABOVE THE FINGER, kept from the release until the drop is written.
   *
   * The card is drawn CLEAR of the hand (`CARRY_CLEAR`) so the picture of the landing is not hidden
   * under the very thing it is a picture of — and a card drawn a card-height above the finger would
   * otherwise be put down a card-height above it too, which is the picture lying by exactly the
   * clearance that made it visible. So the drop takes the clearance back off and the card comes down
   * ON the outline, easing there from the hand's height like anything else the tree moves.
   *
   * Read at the release, because `landingPic.end()` throws the number away with the picture.
   */
  let carriedClear: Vec = { x: 0, y: 0 };

  const zoneAt = zoneAtFor(game);

  // NARDY'S DICE THROW: a die is `Rollable`, and letting go of it WITH SPEED rolls a fresh face and
  // slides it across the band it was thrown in (`wallsOf` — the board or whichever side of it); a
  // gentle let-go falls through and the die is simply put down, face as it was. `mayThrow` keeps a
  // column of checkers out of this branch — the one thing this shelf never throws.
  // THE SAME `Bump` THE CATALOG PASSES INTO `letFall` (`NARDY_BUMP`), applied here by hand: this
  // release goes through `throwFromCarry`, not `letFall`, so the room a die and a checker take from
  // each other (`bumped`) and the pieces already lying there (`alsoInTheWay`) are wired in on this
  // path too — a die thrown here must knock the same way it does in the catalog's own story.
  const feelOf = (n: Node) => bumped(dropOf(n), n, NARDY_BUMP);
  const onDiceRelease = (velocity: Vec | undefined, items: readonly CarryItem[]): boolean => {
    const root = host.root;
    if (!mayThrow(items, root)) return false;
    const poses = motions.poses();
    const speed = velocity ? Math.hypot(velocity.x, velocity.y) : 0;
    let inFlight = 0;
    let threw = false;
    for (const it of items) {
      const piece = byId(root, it.id);
      if (!piece || !caps(piece).has("Rollable")) continue;
      const pose = poses?.get(it.id);
      const at = pose ? { x: pose.e, y: pose.f } : { x: 0, y: 0 };
      const walls = nardyWallsOf(piece, at);
      const feel = feelOf(piece);
      inFlight += 1;
      const face = throwFromCarry(motions, root, piece, {
        outcome: { rng: Math.random },
        ...(walls ? { walls } : {}),
        ...(feel.girth > 0 ? { girth: feel.girth } : {}),
        ...(feel.solid ? { solid: feel.solid } : {}),
        ...(feel.bodyBounce === undefined ? {} : { bodyBounce: feel.bodyBounce }),
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
    if (threw) {
      // WHAT THE THROW MAY KNOCK INTO: everything else in the die's own world (`"nardy-piece"`) —
      // the other die if it settled first, and every checker still on the board.
      const thrownIds = new Set(items.map((it) => it.id));
      const standing = alsoInTheWay(root, thrownIds, new Set(["nardy-piece"]), feelOf);
      const knocking = shoves(speed, NARDY_BUMP.holds);
      for (const still of standing) {
        const feel = feelOf(still);
        motions.slide(still.id, {
          speed: 0,
          angle: 0,
          girth: feel.girth,
          solid: feel.solid,
          ...(knocking ? {} : { anchored: true }),
          bodyBounce: feel.bodyBounce ?? feel.bounce,
          walls: mapWalls(still),
          wallKick: 0,
          onDone: (at) => landed({ host }, still.id, at),
        });
      }
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
    // THE ROUND FELT IS A WALL AND NOT A DRAWING: a card may be carried to the edge of the circle
    // and no further, and the tray the hand is held inside is the very one a throw bounces off
    // (`roundWalls`) — asked twice, the two could differ, and a card carried somewhere it cannot be
    // thrown is a border in two places.
    ...(game === "cards"
      ? {
          trayOf: (_root: Node, hit: Node) => roundWalls(hit),
          // NOT `underFinger`: the felt has no zones to aim at (`roundMap.ts` — "NO HAND AREAS"), so
          // there is nobody for a finger-locked anchor to help aim at, only the ordinary cost of one
          // — the anchor keeps the offset between the finger and wherever on the card it landed
          // (`wireDrag`'s own `delta`), so a card carried away and brought back to the very point it
          // was picked up from comes down exactly where it stood, a hair off the finger if the finger
          // never was dead centre on it. Locked to the finger instead, that same hair is baked into
          // the SEAT the drop writes — the card returns under the finger, not into the pile it left,
          // and a stack a finger did not land on dead centre never closes back up.
          // ...AND THE PICTURE IS MADE AT THE LIFT. `show` moves a mark that already exists; nothing
          // in the hub ever made one, so every carry on this table showed nothing. A card lifted
          // alone gets one too: it is drawn bigger and higher than it will lie, so a hand carrying
          // one is no better placed to answer "where does this land" than a hand carrying thirty-six.
          runOf: (_root: Node, hit: Node) => {
            landingPic.end(); // whatever the last gesture left, if anything ever does
            // A HANDLE LIFTS THE HEAP IT STANDS UNDER, itself included — left behind, the tab would
            // hang under felt the heap has just walked away from (`gestureScene.ts`'s own `runOf`
            // for a grip). A card that is not a handle still lifts alone, same as before.
            if (isGrip(hit)) {
              inHand = hit.id;
              return [hit, ...(heaps.get(hit.id) ?? [])];
            }
            inHand = undefined;
            const picture = landingPic.mark([hit], [{ x: 0, y: 0 }], seatIn(hit));
            return picture ? [hit, picture] : [hit];
          },
          // The picture is the desk's own and takes no lift and no lean: it stays the size it will
          // be and lies flat on the felt while the card rides at the hand's height.
          stillOf: (_root: Node, _hit: Node, run: readonly Node[]) => run.map((n) => isDrawn(n)),
          // ...AND THE LOAD IS PUSHED CLEAR OF THE PICTURE. Both hang off the same finger, so drawn
          // at the same point the card covers the outline exactly and the gesture shows nothing.
          // The picture keeps the finger's own place, because that is where the card is going.
          //
          // A HANDLE CARRIES ITS HEAP RIGID: the deck already lies all but on top of itself
          // (`roundMap.ts`'s own sliver offsets), so every piece under the tab keeps the finger's
          // own point rather than the landing picture's, which only ever tracked a single lifted
          // card.
          offsetOf: (_root: Node, hit: Node, run: readonly Node[]) => {
            if (isGrip(hit)) return run.map(() => ({ x: 0, y: 0 }));
            const clear = landingPic.current?.hover ?? { x: 0, y: 0 };
            return run.map((n) => (isDrawn(n) ? { x: 0, y: 0 } : clear));
          },
          // WHERE IT ACTUALLY COMES DOWN — see `carriedClear`. The wiring puts a piece down where it
          // was drawn, and where it was drawn is the clearance above the outline.
          onSettled: (root: Node, ids: readonly string[]) => {
            inHand = undefined;
            if (carriedClear.x !== 0 || carriedClear.y !== 0) {
              const lead = ids[0] ? byId(root, ids[0]) : undefined;
              const own = lead ? fieldsOf<TransformableFields>(lead, "Transformable") : undefined;
              const clear = carriedClear;
              carriedClear = { x: 0, y: 0 };
              if (lead && own?.at) {
                compose(lead, Transformable({ ...own, at: { x: own.at.x - clear.x, y: own.at.y - clear.y } }));
              }
            }
            // THE TABS ARE REDRAWN AFTER EVERY DROP, whichever card moved — the heap a handle stands
            // under is an accident of what is touching what right now, and a drop is the moment that
            // can change.
            regripCards(root);
            host.setRoot(root);
          },
        }
      : {}),
    onCarry: ({ ids, at, done, feel }: { ids: readonly string[]; at: Vec; done: boolean; feel: any }) => {
      if (done) {
        carriedClear = landingPic.current?.hover ?? { x: 0, y: 0 };
        landingPic.end();
        return;
      }
      // A DESK WITH NO ZONES STILL HAS A LANDING. The picture answers "where will this be when I
      // let go", and that question is asked of every desk here — gated on `zoneAt`, the one desk
      // whose felt takes a card anywhere showed no outline at all, which is the desk that needed
      // it most: there is no zone lighting up to say it instead.
      const root = host.root;
      const lead = ids[0] ? byId(root, ids[0]) : undefined;
      const zone = zoneAt && lead ? zoneAt(root, at, lead) : undefined;
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
      seat = table.seat;
      // THE TURN, NOW THAT THE SEAT IS ACTUALLY KNOWN — `openCamera` already applied it if the seat
      // happened to arrive first; this is the ordinary case, where the glass was already open and
      // looking at the board from the wrong side of it for however long the round trip took.
      if (cameraOpened) {
        camera.turnTo(seatTurn());
        repaintCamera();
      }
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
        if (game === "cards") regraspCards(sRoot);
        isNetworkUpdate = true;
        host.setRoot(sRoot);
        isNetworkUpdate = false;
      }

      if (import.meta.env?.DEV || typeof window !== "undefined") {
        (window as any).__TABLE__ = { table, host };
      }

      unbindOnTree = table.onTree((newRoot) => {
        if (game === "cards") regraspCards(newRoot);
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
