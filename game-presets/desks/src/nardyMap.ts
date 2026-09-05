// A NARDY BOARD, AS THE SHARED DESK SEES IT — long nardy, the Caucasian and Central Asian kind,
// where nobody is hit and every checker of a colour starts on one point, the head.
//
// The board is the chess page's idea told again with a different LAW OF THE PLACE: a chess square
// holds one man and takes the one already there; a nardy point holds a COLUMN of one colour and
// squeezes when it is tall. Everything else is the same shelf — a felt with the board inside it, an
// `Acceptor` per place, the landing picture moving into the place that would take the run, the seats
// mirrored across two screens.
//
// WHAT THIS PAGE DECIDES AND WHAT IT DOES NOT. It decides what a point IS (`pileLayout`, the
// colour rule as data), what a hand takes off a point (the checker and every one above it —
// `runBelow`), and where a die may fly (the band it was thrown in — `wallsOf`). It does NOT decide
// whose turn it is, how far a die lets a checker go, or when a checker may leave the board: those are
// the rules of nardy, and this shelf is about the desk, not the game. Two people at one board are
// trusted with the rules exactly as they are at a real one.

import {
  Acceptor,
  add,
  Bounded,
  caps,
  Container,
  fieldsOf,
  freeLayout,
  Grabber,
  Inviting,
  Lit,
  installStockGrabs,
  node,
  NO_COAT,
  Owned,
  ShadowCaster,
  pileLayout,
  polyline,
  Reaching,
  rect,
  ellipse,
  registerLayout,
  registerSurface,
  runBelow,
  Surfaced,
  Transformable,
  Valued,
  compose,
  wouldAccept,
  mapWalls,
  extentOf,
  roundedRect,
  Draggable,
  GRIP,
  GRIP_RATIO,
  GRIP_GAP,
  GRIP_MISS,
  Screened,
  Forgiving,
  heapBox,
  isGrip,
  roomBy,
  DIE_SCATTER,
  type Bump,
  type CarryItem,
  type BoundedFields,
  type Node,
  type TransformableFields,
  type ValuedFields,
  type Vec,
  type BoxWalls,
} from "game-kit";
import { die } from "@game-presets/dice";
import { installMapArt, onTheDesk, PUT_DOWN, warmingNodes } from "./felt.js";
import { seatChairs } from "./seatPlace.js";

/** The two players, and the colour each is drawn in — a seat's ink is its cursor's and its marks'. */
export const NARDY_SEATS = [
  { seat: "white", ink: "accent" },
  { seat: "black", ink: "alert" },
] as const;

/**
 * WHAT ONE UNIT IS WORTH ON A NARDY PANE, in pixels — one checker across.
 *
 * A board must be seen WHOLE, like the chess page says, and this one is wider: twelve points, a bar
 * and a margin for the dice a side is twenty units across. Smaller units than chess, so that a phone
 * in landscape still holds the whole desk and a phone in portrait holds the board.
 */
export const NARDY_UNIT = 30;

/** A checker is a little under a unit across, so the point's own colour reads round a column. */
const CHECKER = 0.92;
/** How long a point is, in checkers — five, which is what a board draws and what a head squeezes into. */
const POINT_LENGTH = 5;
/** The gap between the two rows of points, in units — room for a die to lie in the middle. */
const MIDDLE = 2;
/** The bar down the middle of the board, in units. Scenery here: long nardy sends nobody to it. */
const BAR = 1;
/** The board's own face: twelve points and the bar, two rows and the middle. */
const BOARD = { w: 12 + BAR, h: POINT_LENGTH * 2 + MIDDLE };
/** The frame round the face, in units. */
const FRAME = 0.3;

/**
 * THE FELT IS THE DESK, and the board stands in the middle of it — wide enough that a die has a band
 * to be thrown in on every side. What is off the board is nobody's and holds anything: a checker put
 * down beside the board is wherever the hand left it, which is what a real table does with one.
 */
export const COMMON = "nardy desk";
export const FELT = { w: 22, h: 17 };

const LIGHT = "nardy.point.light";
const DARK = "nardy.point.dark";
const FACE = "nardy.board.face";
const BAR_SURFACE = "nardy.board.bar";
const FELT_SURFACE = "nardy.felt";
const POINT_LAYOUT_UP = "nardy.point.up";
const POINT_LAYOUT_DOWN = "nardy.point.down";
const BOARD_LAYOUT = "nardy.board";
const HEAD = { white: 24, black: 12 } as const;
/** How many checkers each side starts with — all of them on the head. */
const CHECKERS = 15;

/** A checker's picture is its colour, and the rim is the other colour, thinly, so both read on wood. */
export const checkerSurface = (seat: string): string => `nardy.checker.${seat}`;

export function installNardyArt(): void {
  installMapArt();
  installStockGrabs();
  registerLayout(BOARD_LAYOUT, freeLayout);
  // A POINT IS A PILE THAT GROWS FROM THE RIM. The bottom row grows up, the top row grows down, and
  // both squeeze when the column would run past the point — which is what the head does with fifteen.
  registerLayout(POINT_LAYOUT_UP, pileLayout({ direction: "up", step: CHECKER }));
  registerLayout(POINT_LAYOUT_DOWN, pileLayout({ direction: "down", step: CHECKER }));
  // WOOD, in named colours, for the reason the chess page gives: the theme owns the chrome and has
  // no board in it, and a literal hex is how a palette stops being one.
  registerSurface(LIGHT, { layers: [{ paint: "burlywood" }] });
  registerSurface(DARK, { layers: [{ paint: "sienna" }] });
  registerSurface(FACE, { layers: [{ paint: "saddlebrown" }], radius: 0.12, stroke: { color: "saddlebrown", width: 0.14 } });
  registerSurface(BAR_SURFACE, { layers: [{ paint: "peru" }], radius: 0.06 });
  registerSurface(FELT_SURFACE, {
    layers: [{ paint: "sunkBg" }],
    radius: 0.16,
    stroke: { color: "panelBorder", width: 0.04, opacity: 0.8 },
  });
  // IVORY AND EBONY, rimmed with each other — a light checker on a light point needs the dark rim,
  // and a dark one on a dark point needs the light.
  registerSurface(checkerSurface("white"), { layers: [{ paint: "oldlace" }], stroke: { color: "black", width: 0.05 } });
  registerSurface(checkerSurface("black"), { layers: [{ paint: "black" }], stroke: { color: "oldlace", width: 0.05 } });
}

/**
 * WHERE POINT `n` STANDS, and which way it grows. Numbered the way every board is: 1 at the bottom
 * right, 12 at the bottom left, 13 at the top left, 24 at the top right — so white's head (24) and
 * black's head (12) are opposite corners, and each colour walks the board the long way round.
 */
export function pointAt(n: number): { readonly at: Vec; readonly up: boolean } {
  const bottom = n <= 12;
  const column = bottom ? (n <= 6 ? 7 - n : 6 - n) : n <= 18 ? n - 19 : n - 18;
  const x = column;
  const y = bottom ? BOARD.h / 2 - POINT_LENGTH / 2 : -(BOARD.h / 2 - POINT_LENGTH / 2);
  return { at: { x, y }, up: bottom };
}

/** A point's triangle, in its own frame: the base on the rim, the tip toward the middle. */
function triangle(up: boolean): ReturnType<typeof polyline> {
  const half = POINT_LENGTH / 2;
  return up
    ? polyline([{ x: -0.5, y: half }, { x: 0.5, y: half }, { x: 0, y: -half }])
    : polyline([{ x: -0.5, y: -half }, { x: 0.5, y: -half }, { x: 0, y: half }]);
}

/** Felt shown round the whole desk when it opens fitted, units. */
const MARGIN = 0.4;

/** The stretch the view is held inside — the felt and a small margin. */
export function nardyRoom(): { x: number; y: number; w: number; h: number } {
  return { x: -FELT.w / 2 - MARGIN, y: -FELT.h / 2 - MARGIN, w: FELT.w + MARGIN * 2, h: FELT.h + MARGIN * 2 };
}

/**
 * THE BOARD, SET UP: the felt, the face, the bar, twenty-four points, fifteen checkers a side on the
 * heads, and two dice beside the board. `reach` is the points' own forgiveness, zero by default —
 * a point takes what is put ON it, and the magnetism page's knob is here for the reader who wants
 * to see what a little forgiveness does to a column.
 */
export function nardyMap(reach = 0): Node {
  installNardyArt();
  const desk = node(
    COMMON,
    Bounded({ bounds: rect(FELT.w, FELT.h) }),
    Surfaced({ surface: FELT_SURFACE }),
    Container({ layout: BOARD_LAYOUT }),
    // THE LAMP IS OFF UNTIL SOMETHING IS PICKED UP — a checker on a point casts nothing, a checker in
    // a hand casts, and that is the one thing a shadow says here (see the chess page).
    Lit({ shadow: { base: 0, perZ: 0, lifted: 0.3, opacity: 0.42 } }),
    Grabber({ grab: "one" }),
  );
  // THE PLACES THEMSELVES, before the board and the checkers: a seat is a thing on this felt and it
  // is under everything that is played on it (`seatPlace.ts`).
  seatChairs(desk, seatPlaces(NARDY_SEATS.length), NARDY_SEATS.map(({ seat, ink }) => ({ seat, ink, name: seat })));
  add(
    desk,
    node(
      "board face",
      Bounded({ bounds: rect(BOARD.w + FRAME * 2, BOARD.h + FRAME * 2) }),
      Surfaced({ surface: FACE }),
      Container({ layout: BOARD_LAYOUT }),
      Transformable({ at: { x: 0, y: 0 } }),
    ),
  );
  add(
    desk,
    node(
      "bar",
      Bounded({ bounds: rect(BAR * 0.8, BOARD.h) }),
      Surfaced({ surface: BAR_SURFACE }),
      Container({ layout: BOARD_LAYOUT }),
      Transformable({ at: { x: 0, y: 0 } }),
    ),
  );
  for (let n = 1; n <= 24; n++) add(desk, point(n, reach));
  for (const { seat } of NARDY_SEATS) {
    const head = desk.children.find((p) => numberOf(p) === HEAD[seat]);
    if (!head) continue;
    for (let i = 0; i < CHECKERS; i++) add(head, checker(seat, i));
  }
  // TWO DICE BESIDE THE BOARD, side by side in the band on the right, with a handle under the pair
  // — the pair is what a hand throws, and the handle is what it throws it by. Thrown from there they
  // stay there, thrown on the board they stay on the board (`wallsOf`); wherever they come to rest,
  // the handle is put back under them (`regripDice`).
  const dice: Node[] = [];
  for (const [i, face] of [3, 5].entries()) {
    const d6 = die(`die ${i + 1}`, { kind: "d6", at: { x: DICE_AT.x - 0.55 + i * 1.1, y: DICE_AT.y }, face });
    onTheDesk(d6);
    add(desk, d6);
    dice.push(d6);
  }
  add(desk, diceGrip());
  regripDice(desk);
  for (const warm of warmingNodes()) add(desk, warm);
  return desk;
}

/**
 * ONE POINT. An `Acceptor` like any place on this shelf, with the one rule long nardy has about a
 * place: a colour lies on its own colour, or on nothing. Said as DATA — the pile is empty, or the
 * checker matches the one on top — because that is what a rule of a place is here.
 */
function point(n: number, reach: number): Node {
  const { at, up } = pointAt(n);
  return node(
    `point ${n}`,
    Bounded({ bounds: triangle(up) }),
    Surfaced({ surface: n % 2 === 0 ? DARK : LIGHT }),
    Transformable({ at }),
    Container({ layout: up ? POINT_LAYOUT_UP : POINT_LAYOUT_DOWN }),
    // A POINT SAYS SO ON ITSELF — its number is a value, and nothing reads names.
    Valued({ values: { point: n } }),
    Acceptor({
      accept: {
        or: [{ eq: ["target.count", 0] }, { eq: ["el.values.color", { path: "target.top.values.color" }] }],
      },
    }),
    Grabber({ grab: "one" }),
    Reaching({ reach }),
    // A WASH while the hand is over it, nothing for being merely willing — half the points would
    // take a checker, and "you may put it here" twelve times over is not news. WHICH one is.
    Inviting({ coat: NO_COAT, keen: { recipe: "wash", level: 0.5, tint: "accent" } }),
  );
}

/** A checker. Whose it is and what colour it is are the same fact, said twice for two readers. */
function checker(seat: string, nth: number): Node {
  return node(
    `${seat} checker ${nth}`,
    Bounded({ bounds: ellipse(CHECKER / 2, CHECKER / 2) }),
    Surfaced({ surface: checkerSurface(seat) }),
    Transformable({ at: { x: 0, y: 0 } }),
    // A CHIP to the desk (it falls and flies like one), a COLOUR to the point (the rule reads it),
    // and a seat's own to the marks and the mirror (`Owned`).
    Valued({ values: { chip: 1, color: seat } }),
    Owned({ box: seat }),
    PUT_DOWN,
    ShadowCaster({ from: "silhouette" }),
  );
}

/** Where the pair of dice lies to begin with: in the band to the right of the board. */
const DICE_AT = { x: BOARD.w / 2 + FRAME + 2.2, y: 0 };

/**
 * THE HANDLE UNDER THE DICE — a stack handle like the shelf's own (`grips`), drawn once for the pair
 * rather than found by touching: two dice are one throw whether or not they lie against each other,
 * and a handle that vanished the moment they scattered would be gone exactly when it is wanted.
 *
 * `Screened({ min: 1, max: 1 })`, NOT `GRIP_HOLD` — this board is far bigger in units than the
 * shelf's stock desks, so a camera that fits it lands on a scale much smaller than the HUD etalon
 * `GRIP_HOLD`'s floor was written against; the floor kept lifting the tab back up to that etalon's
 * own size, and on a board this size that reads as a bar with no edge, not a handle under a pair.
 * Locked to `1`, the tab is always its own drawn width — the pair plus a little — at whatever scale
 * the board itself is drawn at, on the catalog's pane and on a phone alike.
 */
function diceGrip(): Node {
  const h = GRIP.w / GRIP_RATIO;
  return node(
    "dice handle",
    Bounded({ bounds: roundedRect(GRIP.w * 2, h, h / 2) }),
    Surfaced({ surface: "gesture.map.grip" }),
    Transformable({ at: { x: 0, y: 0 } }),
    Valued({ values: { grip: 0, dice: 1 } }),
    Screened({ min: 1, max: 1 }),
    Forgiving({ miss: GRIP_MISS }),
    Draggable({ onReject: "stay" }),
  );
}

const isDiceGrip = (n: Node): boolean => fieldsOf<ValuedFields>(n, "Valued")?.values?.["dice"] !== undefined;
const diceOf = (root: Node): Node[] => root.children.filter(isDie);

/** Put the handle back under the pair, wherever the pair has come to lie. */
export function regripDice(root: Node): void {
  const grip = root.children.find(isDiceGrip);
  const dice = diceOf(root);
  if (!grip || dice.length === 0) return;
  const { mid, bottom } = heapBox(root, dice);
  const h = GRIP.w / GRIP_RATIO;
  const own = fieldsOf<TransformableFields>(grip, "Transformable");
  compose(grip, Transformable({ ...(own ?? {}), at: { x: mid, y: bottom + GRIP_GAP + h / 2 } }));
}

/** Which point this is, or nothing for anything that is not a point. */
export const numberOf = (n: Node): number | undefined => {
  const v = fieldsOf<ValuedFields>(n, "Valued")?.values?.["point"];
  return typeof v === "number" ? v : undefined;
};
export const isPoint = (n: Node): boolean => numberOf(n) !== undefined;
export const isChecker = (n: Node): boolean => fieldsOf<ValuedFields>(n, "Valued")?.values?.["color"] !== undefined;
const isDie = (n: Node): boolean => caps(n).has("Rollable");

/**
 * WHAT A HAND TAKES OFF A POINT: the checker it touched and every one above it — the touched one
 * is the grip of the column, exactly as the bottom card of a run is in solitaire (`runBelow`). Off
 * a point a checker is alone, and a die is always alone.
 */
export function runOf(root: Node, hit: Node): readonly Node[] {
  if (isDiceGrip(hit)) return [hit, ...diceOf(root)];
  if (!isChecker(hit) || !hit.parent || !isPoint(hit.parent)) return [hit];
  return runBelow(root, hit);
}

/**
 * HOW THE COLUMN STANDS IN THE HAND: one checker over the next, the way it stood on the point and
 * growing the same way — a column lifted off the bottom row rises, one off the top row hangs down.
 * A little tighter than on the point, so a hand of five reads as a hand and not a ladder.
 */
export function seatsOf(_root: Node, hit: Node, run: readonly Node[]): readonly Vec[] {
  // THE PAIR HANGS OVER ITS HANDLE, side by side, as it lay: the handle is the anchor and takes no
  // lift, the dice ride above it at the hand's height.
  if (isDiceGrip(hit)) {
    const dice = run.filter(isDie);
    const h = GRIP.w / GRIP_RATIO;
    return run.map((n) => (isDie(n) ? { x: (dice.indexOf(n) - (dice.length - 1) / 2) * 1.1, y: -(GRIP_GAP + h / 2 + 0.5) } : { x: 0, y: 0 }));
  }
  const from = hit.parent && isPoint(hit.parent) ? pointAt(numberOf(hit.parent)!).up : true;
  const sign = from ? -1 : 1;
  // `|| 0` folds the −0 of the first seat back to +0, as every layout on this shelf does.
  return run.map((_, i) => ({ x: 0, y: sign * CHECKER * 0.7 * i || 0 }));
}

/**
 * THE PLACE A RELEASE IS AIMED AT: the point the anchor stands over, within its reach; nothing for a
 * die (a die lies where it falls, and a point is not for dice); nothing off the points — the felt
 * is not a zone here, a checker let go beside the board simply lies where it was let go.
 *
 * The point is named whether or not it would TAKE the run: the refusal is the acceptor's to say,
 * and saying it there is what sends a refused checker home rather than leaving it on the felt.
 */
export function pointUnder(root: Node, at: Vec, lead: Node): Node | undefined {
  if (isDie(lead) || isDiceGrip(lead)) return undefined;
  let best: Node | undefined;
  let nearest = Infinity;
  for (const p of root.children) {
    const n = numberOf(p);
    if (n === undefined) continue;
    const { at: own, up } = pointAt(n);
    const reach = fieldsOf<{ reach: number }>(p, "Reaching")?.reach ?? 0;
    const dx = Math.abs(at.x - own.x);
    const dy = up ? at.y - own.y : own.y - at.y; // positive toward the rim
    const inside = dx <= 0.5 + reach && dy >= -POINT_LENGTH / 2 - reach && dy <= POINT_LENGTH / 2 + reach;
    if (!inside) continue;
    const d = dx + Math.max(0, -dy - POINT_LENGTH / 2);
    if (d < nearest) {
      nearest = d;
      best = p;
    }
  }
  return best;
}

/** Would this point take this checker — the acceptor's word, asked before a run is handed over. */
export function takes(zone: Node, lead: Node): boolean {
  return wouldAccept(zone, lead);
}

/**
 * WHAT TAKES UP ROOM ON THIS BOARD — a die off a die and a checker off a checker, the same law
 * `Mechanics/Collision` teaches, said as this board's own data rather than left unset.
 *
 * Thrown beside a board this crowded, two dice used to be able to land one over the other — one die
 * with a shadow and the second result gone — and a die thrown into the head shoved fifteen checkers
 * nobody asked to move. `roomFor` gives both a girth (`roomBy`, a touch under edge-to-edge, so a
 * pair lies snug rather than spaced) and a WORLD: dice and checkers share one, so a die still knocks
 * a checker aside, and a handle — asked with nothing else lying about this shelf's controls — takes
 * none at all.
 */
export const NARDY_BUMP: Bump = {
  roomFor: (piece) => (isDie(piece) || isChecker(piece) ? { girth: roomBy(piece, 0.9), solid: "nardy-piece" } : undefined),
  bounce: 0.7,
  scatter: DIE_SCATTER,
  holds: false,
};

/**
 * WHERE A THROWN PIECE MAY FLY. A die thrown on the board stays on the board; a die thrown beside it
 * stays in the band it was thrown in — left, right, above or below the board — and the board's edge
 * is a wall to it, as the felt's is. Decided at the throw, from where the die is let go: while it is
 * being carried it crosses the edge freely, because a hand can carry a die anywhere.
 *
 * A checker gets the felt: it may fly across the board and off it, and only the felt's edge stops it.
 */
export function wallsOf(piece: Node, at: Vec): BoxWalls | undefined {
  if (!isDie(piece)) return mapWalls(piece, 1, FELT);
  const shape = fieldsOf<BoundedFields>(piece, "Bounded")?.bounds;
  const size = shape ? extentOf(shape) : { w: 1, h: 1 };
  const rx = size.w / 2;
  const ry = size.h / 2;
  const bw = BOARD.w / 2 + FRAME;
  const bh = BOARD.h / 2 + FRAME;
  const fw = FELT.w / 2;
  const fh = FELT.h / 2;
  const inset = (x0: number, y0: number, x1: number, y1: number): BoxWalls => ({ x0: x0 + rx, y0: y0 + ry, x1: x1 - rx, y1: y1 - ry });
  if (Math.abs(at.x) <= bw && Math.abs(at.y) <= bh) return inset(-bw, -bh, bw, bh);
  if (at.x < -bw) return inset(-fw, -fh, -bw, fh);
  if (at.x > bw) return inset(bw, -fh, fw, fh);
  if (at.y < -bh) return inset(-fw, -fh, fw, -bh);
  return inset(-fw, bh, fw, fh);
}

/**
 * WHAT MAY BE THROWN: one checker, and the dice — never a column. A column let go of fast is set
 * down where it is; a hand that wanted to throw checkers across the board throws them one at a time.
 */
export function mayThrow(items: readonly CarryItem[], root: Node): boolean {
  const pieces = items.map((it) => root.children.find((n) => n.id === it.id) ?? byIdDeep(root, it.id)).filter((n): n is Node => n !== undefined && !isGrip(n) && !isDiceGrip(n));
  return pieces.every(isDie) || pieces.filter(isChecker).length <= 1;
}

function byIdDeep(root: Node, id: string): Node | undefined {
  for (const c of root.children) {
    if (c.id === id) return c;
    const deep = byIdDeep(c, id);
    if (deep) return deep;
  }
  return undefined;
}

/** After anything comes to rest, the handle goes back under the dice. */
export function settled(root: Node): void {
  regripDice(root);
}

/** Where a node stands, for the tests: its own `at`. */
export const seatOf = (n: Node): Vec => fieldsOf<TransformableFields>(n, "Transformable")?.at ?? { x: 0, y: 0 };

export function seatPlaces(_n: number): readonly { readonly at: Vec; readonly facing: number }[] {
  return [
    { at: { x: 0, y: BOARD.h / 2 + 1 }, facing: 0 },
    { at: { x: 0, y: -(BOARD.h / 2 + 1) }, facing: 180 },
  ];
}
