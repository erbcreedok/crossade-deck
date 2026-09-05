import { runOf, seatsOf, squareAt, pointUnder } from "@game-presets/desks";
import {
  attachMotion,
  wireDrag,
  unwireDrag,
  attachPainter,
  byId,
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
  type Node,
  type Vec,
} from "game-kit";
import { pixiPainter } from "game-kit/pixi";
import { storedAccount } from "../account/account.js";
import { goTo, placeOf } from "../hub/route.js";
import { joinTable, type Table } from "../online/table.js";
import type { Teardown } from "../hub/catalogue.js";
import { isTableGame, mapFor, type TableGame } from "./mapFor.js";

function buildInitialDesk(game: TableGame): Node {
  installStockSurfaces();
  installStockLayouts();
  installStockCarries();
  installStockFlips();
  return mapFor(game);
}

/** The zone a run is over, per game — the same question `zoneAt` and a drop both ask. */
function zoneAtFor(game: TableGame): ((root: Node, at: Vec, lead: Node) => Node | undefined) | undefined {
  if (game === "chess") return (root, at) => squareAt(root, at);
  if (game === "nardy") return (root, at, lead) => pointUnder(root, at, lead);
  return undefined;
}

/** The inks seats are marked in, in seat order — the same pair every live page on the shelf uses. */
const SEAT_INKS = ["accent", "alert", "textMuted", "text"] as const;

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
  const stopPainter = attachPainter(host, painter);
  const motions = attachMotion(host, painter);

  // FIT THE BOARD TO WHATEVER SCREEN IT LANDED ON. The three boards are drawn at very different
  // sizes in their own units (a nardy felt is nearly three times a chess one across), and the
  // fixed default `hudUnit` a plain `mount` picks is tuned to neither — a phone would show a
  // handful of points and nothing else. Refit on every resize, the same way the hub's shelf does.
  let lastFitUnit = -1;
  const fitToRoot = (): void => {
    const shape = footprint(host.root);
    if (!shape) return;
    const { w, h } = extentOf(shape);
    if (w <= 0 || h <= 0) return;
    const v = host.viewport();
    const unit = Math.max(8, Math.min(v.width / (w * 1.06), v.height / (h * 1.06)));
    if (Math.abs(unit - lastFitUnit) < 0.5) return;
    lastFitUnit = unit;
    host.setViewer({ ...host.viewer(), hudUnit: unit });
  };
  fitToRoot();
  const stopFitting = host.onChange(fitToRoot);

  // THE PICTURE OF WHERE A CARRIED RUN WILL COME DOWN — one per view, shown while a hand moves and
  // ended the instant it lets go (`onCarry` below).
  const landingPic = landingPicture({ host, motions }, { shown: true });

  const zoneAt = zoneAtFor(game);

  // ONE wiring per view, not two. wireDrag is idempotent on the same element: a second call with
  // the same `el` only replaces the options object, never attaches more listeners. So we call it
  // once here to register the pointer handlers, and again after joinTable — with { actor } — to
  // hand the seat to every subsequent gesture. Two calls on different scene objects but the same
  // view would still be one set of listeners; two calls on the same scene object are the same thing.
  const dragScene = { host, motions, el: host.view };
  const dragOptions = {
    ...(zoneAt ? { zoneAt } : {}),
    // A COLUMN OF CHECKERS IS ONE RUN, and the hand's whole answer to "what stood above the one I
    // touched" (`runOf`) and "where does each of them sit, relative to the anchor" (`seatsOf`, the
    // point's own idea of a column). Chess and cards move one piece at a time and need neither.
    ...(game === "nardy" ? { runOf, offsetOf: seatsOf } : {}),
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
    unwireDrag(dragScene.el);
    motions.stop();
    stopPainter();
    host.unmount();
    stopHold();
  };
}
