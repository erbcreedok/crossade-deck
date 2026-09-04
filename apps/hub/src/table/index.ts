import { cards, installClassicSkin } from "@game-presets/cards";
import {
  attachMotion,
  wireDrag,
  add,
  attachPainter,
  Bounded,
  compose,
  Container,
  Draggable,
  freeLayout,
  holdThePage,
  installStockCarries,
  installStockFlips,
  installStockLayouts,
  installStockSurfaces,
  installTheme,
  mount,
  node,
  registerLayout,
  setRev,
  Transformable,
} from "game-kit";
import { pixiPainter } from "game-kit/pixi";
import { storedAccount } from "../account/account.js";
import { goTo, placeOf } from "../hub/route.js";
import { joinTable, type Table } from "../online/table.js";
import type { Teardown } from "../hub/catalogue.js";

function buildInitialDesk() {
  installClassicSkin();
  installStockSurfaces();
  installStockLayouts();
  installStockCarries();
  installStockFlips();
  registerLayout("table.free", freeLayout);

  const deskNode = node("desk", Container({ layout: "table.free" }));
  const deckCards = cards().slice(0, 36);
  deckCards.forEach((c, idx) => {
    compose(c, Transformable({ at: { x: (idx % 9) * 1.3 - 5.2, y: Math.floor(idx / 9) * 1.6 - 2.4 } }));
    compose(c, Draggable());
    add(deskNode, c);
  });
  return deskNode;
}

export function startTable(container: HTMLElement): Teardown {
  installTheme(document, "dark");
  const stopHold = holdThePage();

  const currentPlace = placeOf();
  const account = storedAccount();

  let unbindOnTree: (() => void) | undefined;
  let currentTable: Table | null = null;
  let isNetworkUpdate = false;

  let initialRoot = buildInitialDesk();
  const host = mount(container, initialRoot);
  const vp = host.viewport();
  const painter = pixiPainter(host.view, { width: vp.width, height: vp.height, resolution: vp.dpr });
  const stopPainter = attachPainter(host, painter);
  const motions = attachMotion(host, painter);
  
  const actor = account?.id;
  wireDrag({ host, motions, el: host.view, actor }, { actor });


  joinTable({
    game: "table",
    ...(currentPlace.room ? { room: currentPlace.room } : {}),
    ...(account ? { account } : {}),
    seats: 2,
  })
    .then((table) => {
      currentTable = table;
      if (table.code) {
        goTo("table", "replace", table.code);
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
    motions.stop();
    stopPainter();
    host.unmount();
    stopHold();
  };
}
