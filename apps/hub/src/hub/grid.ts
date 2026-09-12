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
  Container,
  Coated,
  ellipse,
  freeLayout,
  gridLayout,
  Labeled,
  Lit,
  node,
  rect,
  registerLayout,
  registerSurface,
  ShadowCaster,
  Surfaced,
  Transformable,
  Valued,
  type Node,
} from "game-kit";
import { crossade, deckBackSurface, deckFaceSurface, installDeckBacks, installDeckSkin, type DeckStyle } from "@game-presets/cards";
import { checkerSurface, installChessArt, installNardyArt, pictureOf } from "@game-presets/desks";
import { die } from "@game-presets/dice";
import { CATALOGUE, type GameEntry } from "./catalogue.js";
import { RING_U } from "@crossade/look";
import { GROUND, MAIN, NOTE, RING, SLOT, SPARKLE, SPARKLE_DIM, TILE, TITLE } from "@crossade/look";

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
  // The games' own art, so a tile shows the same chessman, checker or card back the game plays with.
  installDeckSkin(DECK);
  installDeckBacks();
  installChessArt();
  installNardyArt();
}

/** Three cards, splayed, sharing one surface each — a back for a cascade, a face for a hand. */
function fannedCards(id: string, surfaces: readonly [string, string, string]): Node {
  const holder = node(`${id}/art`, Container({ layout: FAN }), Transformable({ at: { x: 0, y: -0.34 } }));
  const card = (name: string, at: { x: number; y: number }, angle: number, surface: string): Node =>
    node(name, Bounded({ bounds: rect(0.46, 0.66) }), Surfaced({ surface }), Transformable({ at, angle }));
  add(holder, card(`${id}/art/l`, { x: -0.3, y: 0.05 }, -18, surfaces[0]));
  add(holder, card(`${id}/art/r`, { x: 0.3, y: 0.05 }, 18, surfaces[1]));
  add(holder, card(`${id}/art/m`, { x: 0, y: -0.05 }, 0, surfaces[2]));
  return holder;
}

/** The look the hub shows its card games in: the deck design's classic style, on the plaid back. */
const DECK: DeckStyle = { layout: "classic", fourColour: false, cyrillic: false };
const BACK = deckBackSurface("plaid");

/** Three real backs, splayed — what a cascade of patience looks like, face down. */
function backsOf(id: string): Node {
  return fannedCards(id, [BACK, BACK, BACK]);
}

/** The set's own faces — an ace, a king and a queen — splayed the way a hand fans out. */
function facesOf(id: string): Node {
  const specOf = (cardId: string) => crossade().find((c) => c.id === cardId)!;
  return fannedCards(id, [
    deckFaceSurface(specOf("spade-A"), DECK),
    deckFaceSurface(specOf("heart-K"), DECK),
    deckFaceSurface(specOf("diamond-Q"), DECK),
  ]);
}

/** A white knight and a black king, standing — the pieces the board plays with, at tile size. */
function chessArtOf(id: string): Node {
  const holder = node(`${id}/art`, Container({ layout: FREE }), Transformable({ at: { x: 0, y: -0.28 } }));
  add(holder, node(`${id}/art/knight`, Bounded({ bounds: rect(0.6, 0.6) }), Surfaced({ surface: pictureOf("white", "knight") }), Transformable({ at: { x: -0.32, y: 0 } })));
  add(holder, node(`${id}/art/king`, Bounded({ bounds: rect(0.6, 0.6) }), Surfaced({ surface: pictureOf("black", "king") }), Transformable({ at: { x: 0.32, y: 0 } })));
  return holder;
}

/** A white and a black checker with a die between them — the board's own pieces, at tile size. */
function nardyArtOf(id: string): Node {
  const holder = node(`${id}/art`, Container({ layout: FREE }), Transformable({ at: { x: 0, y: -0.24 } }));
  add(holder, node(`${id}/art/checkerA`, Bounded({ bounds: ellipse(0.13, 0.13) }), Surfaced({ surface: checkerSurface("white") }), Transformable({ at: { x: -0.34, y: 0.12 } })));
  add(holder, node(`${id}/art/checkerB`, Bounded({ bounds: ellipse(0.13, 0.13) }), Surfaced({ surface: checkerSurface("black") }), Transformable({ at: { x: 0, y: 0.12 } })));
  const dieHolder = node(`${id}/art/dieHolder`, Container({ layout: FREE }), Transformable({ at: { x: 0.36, y: 0.12 }, scale: 0.4 }));
  add(dieHolder, die(`${id}/art/die`, { kind: "d6", face: 6 }));
  add(holder, dieHolder);
  return holder;
}

/** Which art a tile draws, by the catalogue id `Valued.game` names — a registry, not a switch. */
const TILE_ART: Record<string, (id: string) => Node> = {
  klondike: backsOf,
  cards: facesOf,
  chess: chessArtOf,
  nardy: nardyArtOf,
};

/** The art a tile shows: the game's own registered look, or the cascade every unlisted game gets. */
function artOf(entryId: string, id: string): Node {
  const build = TILE_ART[entryId] ?? backsOf;
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

/**
 * THE SPARKLE — a diamond scatter over the felt, its own node so the shimmer (`twinkle.ts`, wired
 * in `shell.ts`) can paint it without touching the felt underneath.
 *
 * THE SAME ID in both trees, for the same reason `FELT` is: `shell.ts` looks it up by name every
 * frame and must not care whether the shelf or the game's bar is up. Only the SURFACE differs —
 * bright in the lobby, muted on the table — because that is the one thing client1's `.pixel-bg--game`
 * changes and the felt underneath does not.
 */
export const SPARKLE_ID = "sparkle";

function sparkleOf(surface: string): Node {
  return node(SPARKLE_ID, Bounded({ bounds: rect(60, 60) }), Surfaced({ surface }), Transformable());
}

/**
 * The shelf: the title over a row of places, the first of which are the games there are.
 *
 * `shiftY` moves the title and the shelf down, in units — what the first page's own header takes
 * off the top of the glass (`home/`). The shelf stands in the middle of WHAT IS LEFT rather than in
 * the middle of the canvas: a header drawn over a centred shelf sits on the title.
 */
export function hubTree(columns: number = PLACES, shiftY = 0): Node {
  installLayouts();
  const desk = node(
    "desk",
    Container({ layout: FREE }),
    // The desk's one lamp. `opacity` is client1's `rgba(0,0,0,.55)` drop; the stock 0.28 is too
    // soft for a look whose shadows are hard offsets.
    Lit({ shadow: { base: 0.16, perZ: 0.1, lifted: 0.12, opacity: 0.55 } }),
  );
  add(desk, feltOf());
  add(desk, sparkleOf(SPARKLE));

  add(
    desk,
    node(
      "title",
      Bounded({ bounds: rect(7, 0.9) }),
      Labeled({ label: "Crossade", style: TITLE }),
      // Above the shelf, however tall the shelf is: two rows of tiles stand taller than one.
      Transformable({ at: { x: 0, y: -shelfSize(columns).h / 2 - 1.0 + shiftY } }),
    ),
  );

  const shelf = node(
    "shelf",
    Container({ layout: columns < PLACES ? GRID_NARROW : GRID }),
    Transformable({ at: { x: 0, y: 0.3 + shiftY } }),
  );
  add(desk, shelf);
  for (const entry of CATALOGUE) add(shelf, tileOf(entry));
  for (let i = CATALOGUE.length; i < PLACES; i++) add(shelf, slotOf(i));
  return desk;
}

/**
 * ГДЕ КОНЧАЕТСЯ ЗАГОЛОВОК, В ПИКСЕЛЯХ ЭКРАНА — чтобы ряд «куда зайти» встал ПОД ним, а не над.
 *
 * «Crossade» — имя места, и оно встречает первым; подсказки идут следом, между именем и полкой, где
 * их и ищут глазами. Считается по той же арифметике, что рисует заголовок, — иначе ряд поедет от
 * любой правки полки.
 */
export function titleBottom(view: { height: number }, unit: number, columns: number, shiftY: number): number {
  const y = -shelfSize(columns).h / 2 - 1.0 + shiftY + 0.45;
  return Math.round(view.height / 2 + unit * y);
}

/**
 * WHAT THE HUB'S OWN CANVAS SHOWS WHILE A GAME RUNS: the felt and a muted sparkle, and nothing to
 * press.
 *
 * The strip along the top belongs to the GAME now (`@game-presets/tophud`) — the same strip in all
 * four games and in a game opened at its own URL — and the hub tells it only the one thing a hub
 * knows: that there is a way out of here and where it leads. So the hub's canvas keeps no ribbon
 * of its own, and the game's region covers the whole viewport.
 */
export function tableTree(): Node {
  installLayouts();
  const table = node("table", Container({ layout: FREE }));
  add(table, feltOf());
  add(table, sparkleOf(SPARKLE_DIM));
  return table;
}
