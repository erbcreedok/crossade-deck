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
  caps,
  compose,
  Container,
  Displacer,
  fieldsOf,
  freeLayout,
  Grabber,
  Inviting,
  Lit,
  installStockGrabs,
  installStockOccupied,
  node,
  NO_COAT,
  Oriented,
  Owned,
  ShadowCaster,
  Reaching,
  rect,
  registerAsset,
  registerLanding,
  registerLayout,
  registerOccupied,
  registerSurface,
  rowLayout,
  Surfaced,
  Transformable,
  Valued,
  capture,
  type Node,
  type TransformableFields,
  type ValuedFields,
  type Vec,
} from "game-kit";
import { installMapArt, PUT_DOWN, svg } from "./felt.js";
import { seatChairs } from "./seatPlace.js";

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
export const CHESS_UNIT = 38;

/** How much of a cell a piece takes up. Under one, so the cell's own colour reads all round it. */
const PIECE = 0.94;

/**
 * THE COMMON ZONE IS THE DESK, and the board stands in the middle of it.
 *
 * Not a place beside the board that men are sent to — a place with the board INSIDE it, that every
 * man may cross freely. A separate tray, however big, has a wall between it and the board: a man put
 * down on the felt beside it belongs to nobody, keeps a seat he cannot be laid out by, and cannot be
 * got back. One felt with the squares in the middle of it has no wall anywhere: on a square a man is
 * on that square, off the squares he is wherever the hand left him, and both are the same desk.
 *
 * ONE and not a tray a side. Two of them is two private places, and a private place is a rule: it
 * says whose a taken man is and where he may be put, which this shelf does not decide. The placement
 * within the common zone is determined by the `chess.beside` landing record, placing captured white pieces
 * on the left and black pieces on the right.
 *
 * ROOMY, with a margin round the board on every side, so a camera has felt to stand on and a man has
 * somewhere to be that is not a square.
 */
export const COMMON = "common zone";
export const FELT = { w: 14, h: 14 };

const LIGHT = "chess.cell.light";
const DARK = "chess.cell.dark";
const CELL_LAYOUT = "chess.cell";
const TRAY_LAYOUT = "chess.tray";
const BOARD_LAYOUT = "chess.board";
const BOARD_SURFACE = "chess.board.face";
const TRAY_SURFACE = "chess.tray";
const TAKEN = "chess.taken";

/**
 * THE SIX FIGURES, as the glyphs everybody already knows.
 *
 * Drawn as text inside the picture rather than as paths, for the reason the knight on the gesture
 * map is drawn at all: the kit ships no pictures, so the catalog draws its own — and a chess set
 * drawn by hand here would be twelve hand-drawn silhouettes, every one of them a worse version of
 * a shape that has been settled for two hundred years and is in every font on every machine.
 *
 * THE SOLID GLYPHS FOR BOTH SIDES, tinted — never the outlined ones for white and the solid ones
 * for black. Those two are different WEIGHTS, not different colours: an outline is a hairline at the
 * size a square is on a phone, and next to a filled man it reads as a ghost rather than as the other
 * army. One shape, two inks, and a thin rim of the opposite one so a dark man reads on a dark square
 * and a light man on a light one.
 */
const FIGURES = { king: "♚", queen: "♛", rook: "♜", bishop: "♝", knight: "♞", pawn: "♟" } as const;
export type Figure = keyof typeof FIGURES;

/**
 * A COLOUR THE PICTURE CAN READ. A picture is a data URI — its own little document — so a CSS
 * variable written into it resolves against nothing at all and the glyph comes out the browser's
 * default black on whatever it is standing on. A CSS NAME is a colour with a name, which is what
 * `guard.no-raw-colour` is asking for, and it survives the crossing into a document of its own.
 */
/**
 * HOW THICK THE HAIRLINE ROUND A MAN IS — and it is not the same for both armies.
 *
 * A rim is there to keep a man off the square he stands on, and the two armies need different
 * amounts of that. The light man is a solid pale shape and needs a dark edge to sit on a pale
 * square. The dark man needs almost nothing: given a light rim at the same weight, the rim WINS at
 * the size a square is on a phone — the fill vanishes into the line and both sides come out white,
 * which is what they did.
 */
const rimWidth = (seat: string): number => (seat === "white" ? 2.5 : 1);

const figure = (glyph: string, ink: string, rim: string, width: number): string =>
  svg(
    100,
    100,
    `<text x="50" y="55" text-anchor="middle" dominant-baseline="central" font-size="98" ` +
      `fill="${ink}" stroke="${rim}" stroke-width="${width}" paint-order="stroke" ` +
      `font-family="'Apple Symbols','Segoe UI Symbol','Noto Sans Symbols 2',serif">${glyph}</text>`,
  );

/** A piece's picture is named by what it IS and whose it is — nothing reads the name but the registry. */
export const pictureOf = (seat: string, what: Figure): string => `chess.${seat}.${what}`;
/** THE SHADOW OF A PIECE IS THE PIECE: the same glyph, filled with shadow, one per figure and nobody's. */
export const shadowOf = (what: Figure): string => `chess.shadow.${what}`;

/**
 * IVORY AND EBONY, which is what a chess set is made of — and on a wooden board both read at a
 * glance, which two greys on two greys never did.
 *
 * The rim is the OTHER man's colour, thinly: it is what keeps the ivory man off a light square and
 * the ebony man off a dark one, and it is the whole reason a set has two colours rather than one
 * shape in two sizes.
 */
const inkOf = (seat: string): string => (seat === "white" ? "oldlace" : "black");
const rimOf = (seat: string): string => (seat === "white" ? "black" : "oldlace");

export function installChessArt(): void {
  installMapArt();
  installStockGrabs();
  installStockOccupied();
  registerLayout(BOARD_LAYOUT, freeLayout);
  // A CELL HOLDS ONE PIECE, IN THE MIDDLE OF IT. A row of one is a piece centred, which is the whole
  // arrangement a square needs — and it stays right if a desk ever puts two there.
  registerLayout(CELL_LAYOUT, rowLayout({ gap: 0.04, align: "center" }));
  // A TRAY TAKES A MAN ANYWHERE IN IT. Off the board there is no grid and no reason for one: what
  // is in a tray is a heap of taken men, and a player putting one down beside another is arranging
  // nothing. A column would be the tray having an opinion about a thing nobody is playing.
  registerLayout(TRAY_LAYOUT, freeLayout);
  // A BOARD HAS TO READ AS A BOARD. Every grey this theme owns lives between `#11` and `#2c` — a
  // panel beside a sunken well, which is a difference nobody was ever meant to see across a whole
  // surface — so two of them side by side gave sixty-four squares of one dark slab. The light square
  // is therefore BUILT: the desk's own text colour, laid thinly over the sunken ground, which is the
  // same trick the kit uses for every wash and invents no colour of its own.
  // A BOARD IS WOOD, and the desk's palette has none.
  //
  // The theme owns the CHROME — panels, wells, borders, one gold — and every grey it holds sits
  // between `#11` and `#2c`, because that is what a dark instrument panel is made of. A chessboard
  // built out of two of them is two shades of the same near-black, which is what it was: legible as
  // a diagram and unrecognisable as a board.
  //
  // NAMED COLOURS, not hexes. A game's own board is not the theme's business and never will be —
  // no palette that has to serve a HUD is going to grow a burlywood — but a literal hex here is
  // how a palette stops being one (`guard.no-raw-colour`). A CSS name is a colour with a NAME, which
  // is the whole of what that rule is asking for.
  registerSurface(LIGHT, { layers: [{ paint: "burlywood" }] });
  registerSurface(DARK, { layers: [{ paint: "sienna" }] });
  // THE BOARD'S OWN EDGE. Sixty-four squares with nothing around them float; a frame is what says
  // where the board ends and the room begins, and it is the one thing the trays stand outside of.
  registerSurface(BOARD_SURFACE, {
    layers: [{ paint: "saddlebrown" }],
    radius: 0.1,
    stroke: { color: "saddlebrown", width: 0.14 },
  });
  registerSurface(TRAY_SURFACE, {
    layers: [{ paint: "sunkBg" }],
    radius: 0.16,
    stroke: { color: "panelBorder", width: 0.04, opacity: 0.8 },
  });
  for (const { seat } of CHESS_SEATS) {
    for (const [what, glyph] of Object.entries(FIGURES)) {
      const name = pictureOf(seat, what as Figure);
      registerAsset(name, { src: figure(glyph, inkOf(seat), rimOf(seat), rimWidth(seat)), w: PIECE, h: PIECE });
      registerSurface(name, { layers: [{ image: name, fit: "contain" }] });
    }
  }
  // ...AND WHAT EACH FIGURE LAYS ON THE DESK: itself, in shadow. Not a spot, not an oval, not a box —
  // a knight's shadow is knight-shaped, and the only honest way to a knight-shaped shadow is to draw
  // the knight again in shadow ink. The lamp's opacity makes it a shadow; the glyph makes it his.
  for (const [what, glyph] of Object.entries(FIGURES))
    registerAsset(shadowOf(what as Figure), { src: figure(glyph, "black", "black", 0), w: PIECE, h: PIECE });

  registerLanding("chess.beside", (sitter: Node, zone: Node, _room: { w: number; h: number }): Vec => {
    const seat = fieldsOf<{ readonly box: string }>(sitter, "Owned")?.box;
    const siblings = zone.children.filter(
      (n) => n !== sitter && caps(n).has("Draggable") && fieldsOf<{ readonly box: string }>(n, "Owned")?.box === seat,
    );
    const nth = siblings.length;
    const col = Math.floor(nth / BOARD);
    const row = nth % BOARD;
    const sign = seat === "white" ? -1 : 1;
    const x = sign * (BOARD / 2 + PIECE * 0.9 + col * PIECE);
    const y = -BOARD / 2 + PIECE / 2 + row * PIECE;
    return { x, y };
  });
}

/**
 * A PIECE PUT DOWN ON AN OCCUPIED SQUARE TAKES WHAT IS THERE — and what is taken goes to the common
 * zone. One record, because there is one place: the zone is nobody's.
 */


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
/**
 * THE STRETCH THE VIEW IS HELD INSIDE — the board, the zone beside it, and a margin round the lot.
 *
 * Told only the board, the camera stops at its edge and the zone is past the wall: it is drawn, and
 * it cannot be reached or looked at. Told this, the whole desk is somewhere the eye can go.
 */
export function chessRoom(): { x: number; y: number; w: number; h: number } {
  // THE FELT AND A SMALL MARGIN. A desk that opens fitted is a desk whose margin is shown all the
  // time, so it is a modest one and not the shelf's roam: a quarter of the room shown all the time
  // is a board at half size.
  return { x: -FELT.w / 2 - MARGIN, y: -FELT.h / 2 - MARGIN, w: FELT.w + MARGIN * 2, h: FELT.h + MARGIN * 2 };
}

/** Felt shown round the whole desk when it opens fitted, units. */
const MARGIN = 0.4;

export function chessMap(reach = 0): Node {
  installChessArt();
  registerOccupied(TAKEN, capture(COMMON, "chess.beside"));
  const desk = node(
    COMMON,
    Bounded({ bounds: rect(FELT.w, FELT.h) }),
    Surfaced({ surface: TRAY_SURFACE }),
    Container({ layout: BOARD_LAYOUT }),
    // THE FELT TAKES A MAN ANYWHERE ON IT — that is what makes it a zone and not scenery. Off the
    // squares there is no grid and no reason for one; a man is wherever the hand left him.
    Acceptor({}),
    // THE BOARD'S OWN LAMP, AND IT IS OFF UNTIL SOMETHING IS PICKED UP.
    //
    // A man standing on a square casts NOTHING. He is not hovering over the board, he is ON it, and
    // a shadow under a resting piece is a smear under every one of thirty-two — thirty-two of them
    // and the board reads as dirty rather than as lit. Height is the only thing a shadow says here,
    // and at rest there is no height to say.
    //
    // In the air he casts, because then there IS something to say: he is up, and the square he is
    // over is not the square he came from.
    Lit({ shadow: { base: 0, perZ: 0, lifted: 0.3, opacity: 0.42 } }),
    // A finger on a piece takes that piece — never the square under it, and never the board.
    Grabber({ grab: "one" }),
  );
  // THE PLACES THEMSELVES, before the board and the men: a seat is a thing on this felt and it is
  // under everything that is played on it (`seatPlace.ts`).
  seatChairs(desk, seatPlaces(CHESS_SEATS.length), CHESS_SEATS.map(({ seat, ink }) => ({ seat, ink, name: seat })));
  // THE BOARD'S FACE IS GROUND, like the cells on it. The plan paints everything that HOLDS things
  // first and everything that stands on them after — and a cell is a container, so it is ground. A
  // face that was not would be painted after the cells, over them: one brown square with sixty-four
  // squares underneath it that nobody could see. Which is what it was.
  add(
    desk,
    node(
      "board face",
      Bounded({ bounds: rect(BOARD + 0.24, BOARD + 0.24) }),
      Surfaced({ surface: BOARD_SURFACE }),
      Container({ layout: BOARD_LAYOUT }),
      Transformable({ at: { x: 0, y: 0 } }),
    ),
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
  }

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
    // EVERY SQUARE TAKES, not only the ones set up with a man on them. The record used to be composed
    // onto a square as its first man was stood on it, so the thirty-two starting squares captured
    // and the thirty-two empty ones in the middle quietly stacked two, three men on one place —
    // and the whole middle of the board, where the game actually happens, was not a board. What a
    // square does about a sitter is the SQUARE'S law, said once where the square is made.
    // WHOEVER IS TAKEN GOES TO HIS OWN SIDE, so the record names what happens to the man STANDING
    // there — nobody's men land on the wrong side. Named the other way round, white's losses piled up
    // on black's side, which is a scoreboard that reads backwards.
    Displacer({ occupied: TAKEN }),
    Grabber({ grab: "one" }),
    Reaching({ reach }),
    // ...AND IT SAYS SO WHILE THE HAND IS OVER IT. Nothing for being merely willing: every cell on
    // the board would take the piece, so "you may put it here" is true sixty-four times over and is
    // not news. What is news is WHICH ONE, and that is true of one cell at a time.
    // A WASH, NOT A RING. The shelf's ring is a stroke half outside the contour — right for an area
    // standing alone on felt, and wrong on a grid, where half of it lies on the neighbours and the
    // lit square reads as a square drawn crooked. A wash fills exactly the cell and nothing else,
    // which on a board is the whole message: THIS one.
    Inviting({ coat: NO_COAT, keen: { recipe: "wash", level: 0.5, tint: "accent" } }),
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
    // WHOSE MAN HE IS, said on himself. Not read off his id — an id is a NAME and nothing parses one
    // (`guard.id-is-opaque`) — and not off the square, which he leaves the moment he is picked up.
    Owned({ box: seat }),
    // A FIGURE IS A PICTURE WITH A TOP, AND THE BOARD IS NOT. Black's seat looks at the board from
    // the far side — its camera is turned 180° so the pieces read as black's own men in front of it
    // — but a knight drawn upside down is not "the same knight, seen from the other side": it is a
    // broken glyph. `Oriented: "viewer"` is the billboard already used for captions and marks; here
    // it says the same thing about a chess piece — its own picture stands upright on WHICHEVER
    // screen it is drawn on, whatever the seat's camera does to the board underneath it.
    Oriented({ orientation: "viewer" }),
    PUT_DOWN,
    // HIS OWN SHAPE FALLS, and nothing at rest. Not the square box around a knight-shaped figure and
    // not a pool at his feet: the shadow is the man himself in shadow ink (`shadowOf`). The felt's
    // lamp gives a standing man no fall at all, so at rest nothing is painted (a fall of nothing is
    // no shadow). Lifted, he casts — the one thing a shadow is for here, and the thing the far screen
    // needs most: a man in somebody else's hand, plainly off the board.
    ShadowCaster({ picture: shadowOf(what) }),
  );
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
  const cell = root.children.find((spot) => isCell(spot) && within(spot, at, 0.5, 0.5));
  if (cell) return cell;
  // ...AND OFF THE SQUARES, THE FELT ITSELF. A man may be put down anywhere on it: off the board
  // there is no grid and no reason for one, and where he ends up is where the hand left him. The
  // felt is the desk, so a man lifted from it and put back on it has not changed hands at all.
  return within(root, at, FELT.w / 2, FELT.h / 2) ? root : undefined;
}

/** Is this point inside that node's box, by its own half-widths? */
function within(n: Node, at: Vec, halfW: number, halfH: number): boolean {
  // The desk itself has no pose: it IS the origin everything else is laid out around.
  const own = fieldsOf<TransformableFields>(n, "Transformable")?.at ?? { x: 0, y: 0 };
  return Math.abs(at.x - own.x) <= halfW && Math.abs(at.y - own.y) <= halfH;
}

/** A square of this board says so on itself — its id is a name, and nothing reads names. */
export const isCell = (n: Node): boolean => fieldsOf<ValuedFields>(n, "Valued")?.values?.["cell"] !== undefined;

export function seatPlaces(_n: number): readonly { readonly at: Vec; readonly facing: number }[] {
  return [
    { at: { x: 0, y: BOARD / 2 + 1 }, facing: 0 },
    { at: { x: 0, y: -(BOARD / 2 + 1) }, facing: 180 },
  ];
}
