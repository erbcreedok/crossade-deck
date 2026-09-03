// LIVE / CHESS — the desk where a place is a CELL, and the two people at it are looking at the same
// eight by eight.
//
// Every desk on this shelf so far has been about things that lie WHERE THEY WERE PUT: a heap is an
// accident of what is touching what, a zone is a place with a size that forgives a near miss, and a
// release lands wherever the hand left it. A board is the other kind of desk entirely. It is made of
// sixty-four places that were there before anything was on them, each one exactly one piece wide,
// and a piece is never between two of them: it is on e4 or it is on d4, and there is no third answer.
//
// WHICH IS WHY THIS IS THE PAGE THAT PROVES THE SEAMS. Nothing here is new machinery. A cell is an
// `Acceptor` like any area; the picture of where a lifted piece will land (`landingAt`) moves into
// the cell the anchor is over; the cell lights up because it is the cell that would take it; and a
// piece dropped on an occupied square sends the sitter to its owner's tray, which is what the kit's
// own `capture(to)` was written for. The only thing the board adds is the one question a grid asks
// differently from a felt: WHICH ONE, answered by the square the anchor stands in and never by
// whatever happens to be nearest.
//
// AND NO RULES. Whose turn it is, what a knight may do and whether that was check are a game's
// rules, and this shelf has none — the same law the shared-desk page states. A board with rules is
// a chess PROGRAM; a board without them is the thing every chess program is built on, and it is the
// thing a kit has to get right first.

import {
  Acceptor,
  add,
  Bounded,
  compose,
  Container,
  Displacer,
  fieldsOf,
  freeLayout,
  Grabber,
  Inviting,
  installStockGrabs,
  installStockOccupied,
  node,
  NO_COAT,
  Owned,
  Reaching,
  rect,
  registerAsset,
  registerLayout,
  registerOccupied,
  registerSurface,
  rowLayout,
  Surfaced,
  paint,
  Transformable,
  Valued,
  capture,
  type Node,
  type TransformableFields,
  type ValuedFields,
  type Vec,
} from "../../src/index.js";
import { svg } from "./stockAssets.js";
import { currentSettings } from "../devtools/catalogSettings.js";
import { CASTS, installMapArt, LAMP, MAP, PUT_DOWN, warmingNodes, zoneKeen } from "./gestureMap.js";

/** The two players, and the colour each is drawn in — a seat's ink is its cursor's and its cells'. */
export const CHESS_SEATS = [
  { seat: "white", ink: "accent" },
  { seat: "black", ink: "alert" },
] as const;

/** Eight by eight, one unit a cell — the board IS the desk, so the felt and the grid are one thing. */
export const BOARD = 8;

/**
 * WHAT ONE UNIT IS WORTH ON A CHESS PANE, in pixels.
 *
 * Smaller than the shared desk's, and for one more reason than that page has: a board must be seen
 * WHOLE. A hand of cards read a crop at a time is still a hand of cards, but a board is a shape —
 * where a piece is means nothing except against the other sixty-three squares — so a page showing
 * five files of it is showing something that is not chess. Eight squares and a tray a side is
 * twelve units across, and this is what puts twelve units on a phone.
 */
export const CHESS_UNIT = 34;

/** How much of a cell a piece takes up. Under one, so the cell's own colour reads all round it. */
const PIECE = 0.78;

/**
 * WHERE THE TAKEN PIECES GO — one tray a side, off the board.
 *
 * Because a capture has to put the piece SOMEWHERE, and "nowhere" is not a place: a piece that
 * vanished would be a piece nobody can count, and the first question anybody asks after a trade is
 * what has been taken. The kit's own word for this is `capture(to)`, and the example in its doc is
 * this exact tray.
 */
const TRAY = { w: 2.2, h: 8 };
export const trayOf = (seat: string): string => `${seat} tray`;

const LIGHT = "chess.cell.light";
const DARK = "chess.cell.dark";
const CELL_LAYOUT = "chess.cell";
const TRAY_LAYOUT = "chess.tray";
const BOARD_LAYOUT = "chess.board";
const TAKEN = "chess.taken";

/**
 * THE SIX FIGURES, as the glyphs everybody already knows.
 *
 * Drawn as text inside the picture rather than as paths, for the reason the knight on the gesture
 * map is drawn at all: the kit ships no pictures, so the catalog draws its own — and a chess set
 * drawn by hand here would be twelve hand-drawn silhouettes, every one of them a worse version of
 * a shape that has been settled for two hundred years and is in every font on every machine.
 *
 * THE OUTLINED GLYPHS FOR BOTH SIDES, tinted, rather than the solid ones for black. The solid
 * glyphs are a different WEIGHT, not a different colour: side by side they read as two sets from
 * two boxes. Same outline, two inks, and which is which is never in doubt on a dark desk where a
 * "white" piece cannot be white.
 */
const FIGURES = { king: "♔", queen: "♕", rook: "♖", bishop: "♗", knight: "♘", pawn: "♙" } as const;
export type Figure = keyof typeof FIGURES;

/**
 * A HEX AND NOT A TOKEN, and this is the one place the kit sanctions it (`paint`).
 *
 * A picture is a data URI — its own little document — so a CSS variable written into it resolves
 * against nothing at all and the glyph comes out the browser's default black on a black desk. The
 * palette still holds the only hexes there are; this asks it for one rather than declaring it.
 */
const outline = (): string => paint(currentSettings().viewer.theme ?? "dark", "sunkBg");

const figure = (glyph: string, ink: string): string =>
  svg(
    100,
    100,
    `<text x="50" y="52" text-anchor="middle" dominant-baseline="central" font-size="92" ` +
      `fill="${ink}" stroke="${outline()}" stroke-width="2.5" paint-order="stroke" ` +
      `font-family="'Apple Symbols','Segoe UI Symbol','Noto Sans Symbols 2',serif">${glyph}</text>`,
  );

/** A piece's picture is named by what it IS and whose it is — nothing reads the name but the registry. */
const pictureOf = (seat: string, what: Figure): string => `chess.${seat}.${what}`;

/**
 * THE INK EACH SIDE'S FIGURES ARE DRAWN IN — theme tokens, asked at install time.
 *
 * Not `accent`/`alert`: those are the SEATS' colours, worn by a player's cursor and by the square
 * they are aiming at, and a piece wearing them would say "this is being pointed at" all game long.
 * A chess set is light men and dark men, so the desk's own lightest and darkest are exactly right —
 * and on a dark desk the light man is the page's text colour, which is the one thing on it that is
 * guaranteed to read.
 */
const inkOf = (seat: string): string => paint(currentSettings().viewer.theme ?? "dark", seat === "white" ? "text" : "stageBg");

export function installChessArt(): void {
  installMapArt();
  installStockGrabs();
  installStockOccupied();
  registerLayout(BOARD_LAYOUT, freeLayout);
  // A CELL HOLDS ONE PIECE, IN THE MIDDLE OF IT. A row of one is a piece centred, which is the whole
  // arrangement a square needs — and it stays right if a desk ever puts two there.
  registerLayout(CELL_LAYOUT, rowLayout({ gap: 0.04, align: "center" }));
  // A tray is a column, because what is in it is a LIST: taken pieces are counted, not arranged.
  registerLayout(TRAY_LAYOUT, rowLayout({ gap: 0.06, padding: 0.12, align: "center", direction: "column" }));
  registerSurface(LIGHT, { layers: [{ paint: "panelBg" }] });
  registerSurface(DARK, { layers: [{ paint: "sunkBg" }] });
  registerSurface("chess.tray", {
    layers: [{ paint: "sunkBg" }],
    radius: 0.16,
    stroke: { color: "panelBorder", width: 0.03, opacity: 0.7, dash: { on: 0.18, off: 0.14, corner: "dash" } },
  });
  for (const { seat } of CHESS_SEATS) {
    for (const [what, glyph] of Object.entries(FIGURES)) {
      const name = pictureOf(seat, what as Figure);
      registerAsset(name, { src: figure(glyph, inkOf(seat)), w: PIECE, h: PIECE });
      registerSurface(name, { layers: [{ image: name, fit: "contain" }] });
    }
  }
}

/**
 * A PIECE PUT DOWN ON AN OCCUPIED SQUARE TAKES WHAT IS THERE — and what is taken goes to a tray.
 *
 * Registered per side because a capture has to name the place the sitter goes, and where it goes
 * depends on WHOSE it is. Two records, and the square picks by the colour of the piece standing on
 * it — which is the one thing about chess that is not a rule but an arrangement: nobody's tray holds
 * anybody else's men.
 */
const takenTo = (seat: string): string => `${TAKEN}.${seat}`;

/** The back rank, in the order everybody sets it up in. */
const BACK: readonly Figure[] = ["rook", "knight", "bishop", "queen", "king", "bishop", "knight", "rook"];

/** Where a cell stands, in root units — the board is laid out around zero like every desk here. */
const cellAt = (file: number, rank: number): Vec => ({ x: file - (BOARD - 1) / 2, y: rank - (BOARD - 1) / 2 });

/** A cell's name. Ids are NAMES and nothing reads them — where a piece is is looked up, never parsed. */
const cellId = (file: number, rank: number): string => `cell ${String.fromCharCode(97 + file)}${BOARD - rank}`;

/**
 * THE BOARD, SET UP — sixty-four cells, thirty-two pieces standing on them, and a tray a side.
 *
 * `reach` is the cells' own forgiveness and it is ZERO by default, which is what a board means: a
 * piece is ON a square or it is on the next one. Raise it and the desk behaves like the magnetism
 * page — worth having as a knob, because the difference between a board and a felt is exactly this
 * number, and a reader who has never thought about that can find it out by moving it.
 */
export function chessMap(reach = 0): Node {
  installChessArt();
  for (const { seat } of CHESS_SEATS) registerOccupied(takenTo(seat), capture(trayOf(seat)));
  const desk = node(
    "board",
    Bounded({ bounds: rect(MAP.w, MAP.h) }),
    Container({ layout: BOARD_LAYOUT }),
    LAMP,
    // A finger on a piece takes that piece — never the square under it, and never the board.
    Grabber({ grab: "one" }),
  );
  for (let rank = 0; rank < BOARD; rank++) {
    for (let file = 0; file < BOARD; file++) {
      add(desk, cell(file, rank, reach));
    }
  }
  for (const { seat } of CHESS_SEATS) {
    const home = seat === "white" ? BOARD - 1 : 0;
    const pawns = seat === "white" ? BOARD - 2 : 1;
    BACK.forEach((what, file) => {
      stand(desk, file, home, seat, what);
      stand(desk, file, pawns, seat, "pawn");
    });
    add(desk, tray(seat));
  }
  for (const warm of warmingNodes()) add(desk, warm);
  return desk;
}

/**
 * ONE CELL. An `Acceptor` like any area on this shelf — which is the whole point: a board is not a
 * new kind of place, it is sixty-four small ones with no forgiveness.
 */
function cell(file: number, rank: number, reach: number): Node {
  const dark = (file + rank) % 2 === 1;
  return node(
    cellId(file, rank),
    Bounded({ bounds: rect(1, 1) }),
    Surfaced({ surface: dark ? DARK : LIGHT }),
    Transformable({ at: cellAt(file, rank) }),
    Container({ layout: CELL_LAYOUT }),
    // A CELL SAYS SO ON ITSELF. Its id is a NAME and nothing reads it (`guard.id-is-opaque`): what
    // makes a node a square of this board is that it says it is one, not that it is called `cell e4`.
    Valued({ values: { cell: 1 } }),
    Acceptor({}),
    Grabber({ grab: "one" }),
    Reaching({ reach }),
    // ...AND IT SAYS SO WHILE THE HAND IS OVER IT. Nothing for being merely willing: every cell on
    // the board would take the piece, so "you may put it here" is true sixty-four times over and is
    // not news. What is news is WHICH ONE, and that is true of one cell at a time.
    Inviting({ coat: NO_COAT, keen: zoneKeen("accent") }),
  );
}

/** A tray, off the board, holding what its owner has lost. */
function tray(seat: string): Node {
  return node(
    trayOf(seat),
    Bounded({ bounds: rect(TRAY.w, TRAY.h) }),
    Surfaced({ surface: "chess.tray" }),
    Transformable({ at: { x: (seat === "white" ? 1 : -1) * (MAP.w / 2 + TRAY.w / 2 + 0.4), y: 0 } }),
    Container({ layout: TRAY_LAYOUT }),
    Acceptor({}),
    Grabber({ grab: "one" }),
  );
}

/** Put a piece on a square. It is the cell's CHILD, so where it stands is the cell's arrangement. */
function stand(desk: Node, file: number, rank: number, seat: string, what: Figure): void {
  const spot = desk.children.find((n) => n.id === cellId(file, rank));
  if (!spot) return;
  const piece = node(
    `${seat} ${what} ${cellId(file, rank)}`,
    Bounded({ bounds: rect(PIECE, PIECE) }),
    Surfaced({ surface: pictureOf(seat, what) }),
    Valued({ values: { chess: 1 } }),
    // WHOSE IT IS, said on the piece — a capture has to send it to its own side's tray, and the
    // side is a fact about the man, not about the square he happened to be standing on.
    Owned({ box: trayOf(seat) }),
    PUT_DOWN,
    CASTS,
  );
  compose(spot, Displacer({ occupied: takenTo(seat === "white" ? "black" : "white") }));
  add(spot, piece);
}

/**
 * WHICH CELL THE ANCHOR IS STANDING IN — the board's answer to the question every place-desk asks.
 *
 * NOT THE NEAREST, which is what a felt with zones answers (`zoneNear`): on a board the cells touch,
 * so every one of them is nought away from a piece lying across four, and "nearest" collapses into
 * whichever the desk happened to build first. A grid is asked a different question and it has an
 * exact answer — the square the point is INSIDE — and the anchor is the point, because the anchor is
 * what the hand aimed.
 */
export function squareAt(root: Node, at: Vec): Node | undefined {
  for (const spot of root.children) {
    if (!isCell(spot)) continue;
    const own = fieldsOf<TransformableFields>(spot, "Transformable")?.at;
    if (own && Math.abs(at.x - own.x) <= 0.5 && Math.abs(at.y - own.y) <= 0.5) return spot;
  }
  return undefined;
}

/** A square of this board says so on itself — its id is a name, and nothing reads names. */
export const isCell = (n: Node): boolean => fieldsOf<ValuedFields>(n, "Valued")?.values?.["cell"] !== undefined;
