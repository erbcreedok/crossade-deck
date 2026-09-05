// THE HUB'S TREE — a title, a row of tiles, and nothing that is not an ordinary node.
//
// A tile is TWO nodes because one quad carries one stroke, and client1's motif is a black keyline
// INSIDE a gold ring: the outer node is the gold plate, the inner one the panel with the keyline.
// The face is a hair smaller on every side, so what shows between them is the ring.
//
// Which game a tile means is carried by `Valued`, not by its id. Behaviour reads capabilities, not
// names — an id is opaque by law, and the day tiles are built from a server's list, nothing here
// would have a name to parse anyway.

import {
  add,
  Bounded,
  circle,
  Container,
  Coated,
  freeLayout,
  gridLayout,
  Labeled,
  Lit,
  node,
  polygon,
  rect,
  registerLayout,
  registerSurface,
  ShadowCaster,
  Surfaced,
  Transformable,
  Valued,
  type Node,
} from "game-kit";
import { CATALOGUE, type GameEntry } from "./catalogue.js";
import { PALETTE, RING_U } from "../look/palette.js";
import { GROUND, MAIN, NOTE, RING, SLOT, TILE, TITLE } from "../look/surfaces.js";

/** A tile's outer plate, in units. The face is `RING_U` smaller on every side. */
const TILE_W = 2.6;
const TILE_H = 2.2;
/** How many places the shelf shows. Empty ones say where the next game goes. */
const PLACES = 4;

const FREE = "hub/free";
const GRID = "hub/grid";
/** The same shelf folded in two — a phone held upright has no room for four tiles abreast. */
const GRID_NARROW = "hub/grid/narrow";
const GAP = 0.42;

/**
 * HOW THE SHELF IS LAID OUT for a given glass: four abreast where there is room, two by two where
 * there is not. Decided by the glass's own shape, not by pixels: a phone upright is narrower than
 * it is tall, and that is the whole of what "no room abreast" means.
 */
export function shelfColumns(v: { readonly width: number; readonly height: number }): number {
  return v.width < v.height ? 2 : PLACES;
}

/** The shelf's own size in units, for `columns` across — what a fit has to make room for. */
export function shelfSize(columns: number): { readonly w: number; readonly h: number } {
  const rows = Math.ceil(PLACES / columns);
  return { w: columns * TILE_W + (columns - 1) * GAP, h: rows * TILE_H + (rows - 1) * GAP };
}
const INSET = "hub/inset";
const FAN = "hub/fan";
/** A card's back, face down — for the tile that shows a hand rather than a game of patience. */
const CARD_BACK = "hub/fan/back";
/** A chess piece's silhouette — simple shapes, no art asset, recognisable at tile size. */
const PIECE = "hub/piece";
/** Nardy: a lunka (the board's own triangle) and a checker sitting in one. */
const PIT = "hub/pit";
const CHECKER_A = "hub/checker/a";
const CHECKER_B = "hub/checker/b";

let laid = false;

function installLayouts(): void {
  if (laid) return;
  laid = true;
  registerLayout(FREE, freeLayout);
  registerLayout(GRID, gridLayout({ columns: PLACES, gap: GAP, padding: 0 }));
  registerLayout(GRID_NARROW, gridLayout({ columns: 2, gap: GAP, padding: 0 }));
  // The face sits dead centre of its plate; so does a caption inside the face.
  registerLayout(INSET, { place: (children) => children.map(() => ({ x: 0, y: 0 })) });
  registerLayout(FAN, freeLayout);
  registerSurface(FAN, { layers: [{ paint: PALETTE.ink }], stroke: { color: PALETTE.black, width: 0.05, alignment: 1 } });
  registerSurface(`${FAN}/pip`, { layers: [{ paint: PALETTE.danger }] });
  registerSurface(CARD_BACK, { layers: [{ paint: PALETTE.gold }], stroke: { color: PALETTE.black, width: 0.05, alignment: 1 } });
  registerSurface(PIECE, { layers: [{ paint: PALETTE.ink }], stroke: { color: PALETTE.black, width: 0.04, alignment: 1 } });
  registerSurface(PIT, { layers: [{ paint: PALETTE.gold }], stroke: { color: PALETTE.black, width: 0.04, alignment: 1 } });
  registerSurface(CHECKER_A, { layers: [{ paint: PALETTE.ink }], stroke: { color: PALETTE.black, width: 0.04, alignment: 1 } });
  registerSurface(CHECKER_B, { layers: [{ paint: PALETTE.danger }], stroke: { color: PALETTE.black, width: 0.04, alignment: 1 } });
}

/** Three little cards, splayed — what a game of patience looks like at tile size. */
function fanOf(id: string): Node {
  const holder = node(`${id}/art`, Container({ layout: FAN }), Transformable({ at: { x: 0, y: -0.34 } }));
  const card = (name: string, at: { x: number; y: number }, angle: number): Node =>
    node(name, Bounded({ bounds: rect(0.46, 0.66) }), Surfaced({ surface: FAN }), Transformable({ at, angle }));
  add(holder, card(`${id}/art/l`, { x: -0.3, y: 0.05 }, -18));
  add(holder, card(`${id}/art/r`, { x: 0.3, y: 0.05 }, 18));
  const middle = card(`${id}/art/m`, { x: 0, y: -0.05 }, 0);
  add(middle, node(`${id}/art/pip`, Bounded({ bounds: rect(0.14, 0.14) }), Surfaced({ surface: `${FAN}/pip` })));
  add(holder, middle);
  return holder;
}

/** Two cards face down and one turned up — a hand of cards, not a cascade of them. */
function handOf(id: string): Node {
  const holder = node(`${id}/art`, Container({ layout: FAN }), Transformable({ at: { x: 0, y: -0.34 } }));
  const back = (name: string, at: { x: number; y: number }, angle: number): Node =>
    node(name, Bounded({ bounds: rect(0.46, 0.66) }), Surfaced({ surface: CARD_BACK }), Transformable({ at, angle }));
  add(holder, back(`${id}/art/l`, { x: -0.3, y: 0.05 }, -18));
  add(holder, back(`${id}/art/r`, { x: 0.3, y: 0.05 }, 18));
  const up = node(`${id}/art/m`, Bounded({ bounds: rect(0.46, 0.66) }), Surfaced({ surface: FAN }), Transformable({ at: { x: 0, y: -0.05 } }));
  add(up, node(`${id}/art/pip`, Bounded({ bounds: rect(0.14, 0.14) }), Surfaced({ surface: `${FAN}/pip` })));
  add(holder, up);
  return holder;
}

/** A king and a pawn, standing — what a chessboard looks like at tile size. */
function chessArtOf(id: string): Node {
  const holder = node(`${id}/art`, Container({ layout: FREE }), Transformable({ at: { x: 0, y: -0.28 } }));
  const king = node(`${id}/art/king`, Container({ layout: FREE }), Transformable({ at: { x: -0.32, y: 0 } }));
  add(king, node(`${id}/art/king/body`, Bounded({ bounds: rect(0.24, 0.5) }), Surfaced({ surface: PIECE }), Transformable({ at: { x: 0, y: 0.1 } })));
  add(king, node(`${id}/art/king/head`, Bounded({ bounds: circle(0.1) }), Surfaced({ surface: PIECE }), Transformable({ at: { x: 0, y: -0.2 } })));
  add(king, node(`${id}/art/king/crossV`, Bounded({ bounds: rect(0.04, 0.14) }), Surfaced({ surface: PIECE }), Transformable({ at: { x: 0, y: -0.35 } })));
  add(king, node(`${id}/art/king/crossH`, Bounded({ bounds: rect(0.12, 0.04) }), Surfaced({ surface: PIECE }), Transformable({ at: { x: 0, y: -0.35 } })));
  add(holder, king);
  const pawn = node(`${id}/art/pawn`, Container({ layout: FREE }), Transformable({ at: { x: 0.32, y: 0.1 } }));
  add(pawn, node(`${id}/art/pawn/body`, Bounded({ bounds: rect(0.2, 0.34) }), Surfaced({ surface: PIECE }), Transformable({ at: { x: 0, y: 0.08 } })));
  add(pawn, node(`${id}/art/pawn/head`, Bounded({ bounds: circle(0.08) }), Surfaced({ surface: PIECE }), Transformable({ at: { x: 0, y: -0.12 } })));
  add(holder, pawn);
  return holder;
}

/** Three lunki with a checker apiece — what a nardy board looks like at tile size. */
function nardyArtOf(id: string): Node {
  const holder = node(`${id}/art`, Container({ layout: FREE }), Transformable({ at: { x: 0, y: -0.24 } }));
  const pit = (i: number, x: number): Node =>
    node(`${id}/art/pit${i}`, Bounded({ bounds: polygon(3, 0.24) }), Surfaced({ surface: PIT }), Transformable({ at: { x, y: 0.12 } }));
  add(holder, pit(0, -0.42));
  add(holder, pit(1, 0));
  add(holder, pit(2, 0.42));
  add(holder, node(`${id}/art/checkerA`, Bounded({ bounds: circle(0.1) }), Surfaced({ surface: CHECKER_A }), Transformable({ at: { x: -0.42, y: 0.16 } })));
  add(holder, node(`${id}/art/checkerB`, Bounded({ bounds: circle(0.1) }), Surfaced({ surface: CHECKER_B }), Transformable({ at: { x: 0, y: 0.16 } })));
  return holder;
}

/** Which art a tile draws, by the catalogue id `Valued.game` names — a registry, not a switch. */
const TILE_ART: Record<string, (id: string) => Node> = {
  cards: handOf,
  chess: chessArtOf,
  nardy: nardyArtOf,
};

/** The art a tile shows: the game's own registered look, or the fan every unlisted game gets. */
function artOf(entryId: string, id: string): Node {
  const build = TILE_ART[entryId] ?? fanOf;
  return build(id);
}

/** One tile: the gold plate, the panel inside it, the art and the caption inside that. */
function tileOf(entry: GameEntry): Node {
  const plate = node(
    `tile/${entry.id}`,
    Bounded({ bounds: rect(TILE_W, TILE_H) }),
    Surfaced({ surface: RING }),
    Container({ layout: INSET }),
    Transformable({ at: { x: 0, y: 0 } }),
    // What a press means, as data a reader can see — never parsed out of the id.
    Valued({ values: { game: entry.id } }),
    ShadowCaster({ from: "silhouette" }),
  );
  const face = node(
    `tile/${entry.id}/face`,
    Bounded({ bounds: rect(TILE_W - RING_U * 2, TILE_H - RING_U * 2) }),
    Surfaced({ surface: TILE }),
    // FREE, not INSET: a layout wins where it spoke, and `INSET` speaks for every child — the art
    // and the caption would both be dumped on the centre, on top of each other.
    Container({ layout: FREE }),
    // The loading coat is worn HERE, on the face, so the gold ring is not covered by it.
    Coated(),
  );
  add(plate, face);
  add(face, artOf(entry.id, `tile/${entry.id}`));
  add(
    face,
    node(
      `tile/${entry.id}/cap`,
      Bounded({ bounds: rect(TILE_W - RING_U * 2 - 0.2, 0.5) }),
      Labeled({ label: entry.label, style: MAIN }),
      Transformable({ at: { x: 0, y: 0.72 } }),
    ),
  );
  return plate;
}

/** An empty place — where the next game goes, and a reason the shelf does not look half-built. */
function slotOf(i: number): Node {
  const plate = node(
    `slot/${i}`,
    Bounded({ bounds: rect(TILE_W, TILE_H) }),
    Surfaced({ surface: SLOT }),
    Container({ layout: INSET }),
    Transformable({ at: { x: 0, y: 0 } }),
  );
  add(
    plate,
    node(
      `slot/${i}/cap`,
      Bounded({ bounds: rect(TILE_W - 0.4, 0.5) }),
      Labeled({ label: "скоро", style: NOTE }),
    ),
  );
  return plate;
}

/**
 * THE FELT — the tiled ground, and a node of its own so that it can MOVE while the desk does not.
 *
 * client1 crawls this pattern across the screen and stands its menu still on top; the same thing
 * here is the ground's own pose, written by the drift each frame (`drift.ts`). Were the surface
 * still worn by the desk, drifting it would carry the title and the shelf along with it.
 *
 * A BOX OF ITS OWN, and a generous one. Without it the area is the extent of what the node holds,
 * so the felt would stop at the edge of the shelf and the tiled club would never reach the corners
 * of a screen. Sized past any viewport rather than recomputed on resize: it costs one quad and one
 * tiled texture either way, and a number that never has to be right is a number that cannot go
 * wrong. The margin is also what the drift travels in — a tile's worth of movement never uncovers
 * an edge.
 *
 * The SAME id in both trees on purpose: the drift looks its node up by name every frame and must
 * not care whether the shelf or a running game's bar is up.
 */
export const FELT = "felt";

function feltOf(): Node {
  return node(FELT, Bounded({ bounds: rect(60, 60) }), Surfaced({ surface: GROUND }), Transformable());
}

/** The shelf: the title over a row of places, the first of which are the games there are. */
export function hubTree(columns: number = PLACES): Node {
  installLayouts();
  const desk = node(
    "desk",
    Container({ layout: FREE }),
    // The desk's one lamp. `opacity` is client1's `rgba(0,0,0,.55)` drop; the stock 0.28 is too
    // soft for a look whose shadows are hard offsets.
    Lit({ shadow: { base: 0.16, perZ: 0.1, lifted: 0.12, opacity: 0.55 } }),
  );
  add(desk, feltOf());

  add(
    desk,
    node(
      "title",
      Bounded({ bounds: rect(7, 0.9) }),
      Labeled({ label: "Crossade", style: TITLE }),
      // Above the shelf, however tall the shelf is: two rows of tiles stand taller than one.
      Transformable({ at: { x: 0, y: -shelfSize(columns).h / 2 - 1.0 } }),
    ),
  );

  const shelf = node("shelf", Container({ layout: columns < PLACES ? GRID_NARROW : GRID }), Transformable({ at: { x: 0, y: 0.3 } }));
  add(desk, shelf);
  for (const entry of CATALOGUE) add(shelf, tileOf(entry));
  for (let i = CATALOGUE.length; i < PLACES; i++) add(shelf, slotOf(i));
  return desk;
}

/**
 * The bar shown while a game is running: one control, saying the way back.
 *
 * It is a tile like any other — the same plate, face and caption — because a control is an ELEMENT
 * and there is no second world of widgets. What it MEANS is `Valued`, read by the same press
 * wiring that reads a game tile's, so the shell needs no second gesture path.
 *
 * The hub's canvas is the whole viewport even while a game runs, and the game covers everything
 * below the strip — so the control is placed at `topY`, which the shell works out from the strip's
 * height and the unit in force. Horizontally it is centred: that needs no measurement at all.
 */
export function barTree(strip: { readonly topY: number; readonly height: number }): Node {
  installLayouts();
  const bar = node("bar", Container({ layout: FREE }));
  add(bar, feltOf());
  // Measured against the STRIP, not against the shelf: the unit in force is the shelf's, and a
  // control sized in shelf units would stand taller than the ribbon it lives in.
  const w = strip.height * 2.8;
  const h = strip.height;
  const plate = node(
    "nav/back",
    Bounded({ bounds: rect(w, h) }),
    Surfaced({ surface: RING }),
    Container({ layout: INSET }),
    Transformable({ at: { x: 0, y: strip.topY } }),
    Valued({ values: { nav: "back" } }),
    ShadowCaster({ from: "silhouette" }),
  );
  const face = node(
    "nav/back/face",
    Bounded({ bounds: rect(w - RING_U * 2, h - RING_U * 2) }),
    Surfaced({ surface: TILE }),
    Container({ layout: INSET }),
  );
  add(plate, face);
  add(face, node("nav/back/cap", Bounded({ bounds: rect(w - 0.2, h * 0.6) }), Labeled({ label: "Назад", style: MAIN })));
  add(bar, plate);
  return bar;
}
