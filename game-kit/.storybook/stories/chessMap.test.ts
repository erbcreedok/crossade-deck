// @vitest-environment jsdom
// THE BOARD — what is true of a desk made of PLACES, before anybody looks at it.
//
// Pure and headless: sixty-four cells and thirty-two men are a set-up, and which cell a point falls
// in is arithmetic. What needs a screen — the light, the picture of the landing, the mirroring — is
// the shelf's own and is guarded where it lives.

import { describe, expect, it } from "vitest";
import { byId, caps, fieldsOf, extentOf, type BoundedFields, type Node, type TransformableFields } from "../../src/index.js";
import { BOARD, chessMap, CHESS_SEATS, COMMON, isCell, squareAt } from "./chessMap.js";
import { scene as buildScene } from "../devtools/scene.js";
import { wireDrag } from "../devtools/drag.js";
import { currentSettings } from "../devtools/catalogSettings.js";
import { HUD_UNIT_CHOICES } from "../devtools/hudUnitChoices.js";
import type { Painter } from "../../src/index.js";

const cells = (desk: Node): Node[] => desk.children.filter(isCell);
const men = (desk: Node): Node[] => cells(desk).flatMap((spot) => spot.children);
const seatOf = (n: Node) => fieldsOf<TransformableFields>(n, "Transformable")!.at!;

describe("a board is a desk made of places", () => {
  it("chess.sixty-four-places-that-were-there-first — one piece wide, and nothing between them", () => {
    // Every other desk on the shelf is about things that lie WHERE THEY WERE PUT. A board is the
    // other kind: the places exist before anything is on them, each is exactly one piece wide, and
    // a piece is never between two of them. That is not a rule of chess — it is what a board IS.
    const desk = chessMap();
    expect(cells(desk).length, "eight by eight").toBe(BOARD * BOARD);
    for (const spot of cells(desk)) {
      expect(caps(spot).has("Acceptor"), "a cell is an acceptor like any area on this shelf").toBe(true);
      const box = extentOf(fieldsOf<BoundedFields>(spot, "Bounded")!.bounds);
      expect(box.w, "one unit a cell").toBeCloseTo(1, 9);
      expect(box.h).toBeCloseTo(1, 9);
    }
    // THEY TILE, with no gap and no overlap: the eight files stand a unit apart, so the board is a
    // grid rather than sixty-four things that happen to be near each other.
    const files = [...new Set(cells(desk).map((spot) => Math.round(seatOf(spot).x * 100) / 100))].sort((a, b) => a - b);
    expect(files.length).toBe(BOARD);
    for (let i = 1; i < files.length; i++) expect(files[i]! - files[i - 1]!, "a unit apart").toBeCloseTo(1, 9);
    // ...and laid out AROUND zero, like every desk here, so the camera's rect and the board's agree.
    expect(files[0]! + files[files.length - 1]!, "centred on the desk").toBeCloseTo(0, 9);
  });

  it("chess.the-square-the-anchor-is-IN-and-never-the-nearest", () => {
    // A felt with areas answers "which place" by NEAREST, and forgives a near miss, because a hand
    // aiming at an area is aiming at somewhere with a size. On a board that answer is meaningless:
    // the cells touch, so a piece lying across four is nought away from all four, and "nearest"
    // collapses into whichever square the desk happened to build first.
    //
    // A grid is asked a different question and has an exact answer: the square the point is INSIDE.
    const desk = chessMap();
    const spot = cells(desk)[27]!;
    const home = seatOf(spot);
    expect(squareAt(desk, home), "dead centre").toBe(spot);
    // Anywhere inside its own square, including a hair from the edge.
    expect(squareAt(desk, { x: home.x + 0.49, y: home.y - 0.49 }), "a hair inside the corner").toBe(spot);
    // ...and a hair PAST the edge is the next square, not this one forgiving a miss.
    const over = squareAt(desk, { x: home.x + 0.6, y: home.y });
    expect(over, "past the edge there is another square, not a gap").toBeDefined();
    expect(over, "and it is not this one").not.toBe(spot);
    expect(seatOf(over!).x - home.x, "the very next file").toBeCloseTo(1, 9);
    // Off the board entirely is nothing — a board has an edge, and beyond it there are no places.
    expect(squareAt(desk, { x: BOARD, y: BOARD }), "off the board").toBeUndefined();
  });

  it("chess.a-set-of-thirty-two-standing-where-everybody-sets-them-up", () => {
    // A board with the wrong men on it is a page about nothing: the first thing anybody checks is
    // the back rank, and getting it wrong reads as a bug in the desk rather than in the set-up.
    const desk = chessMap();
    expect(men(desk).length, "sixteen a side").toBe(32);
    for (const spot of cells(desk)) expect(spot.children.length, "one to a square, never two").toBeLessThanOrEqual(1);
    // Each side's men stand on two ranks, and they are the two ranks that side starts on.
    for (const { seat } of CHESS_SEATS) {
      const mine = men(desk).filter((one) => one.parent && ownedBy(one, seat));
      expect(mine.length, `${seat} has sixteen`).toBe(16);
      const ranks = [...new Set(mine.map((one) => Math.round(seatOf(one.parent!).y * 100) / 100))];
      expect(ranks.length, `${seat} stands on two ranks`).toBe(2);
    }
    // ...AND ONE COMMON ZONE, off the board and belonging to nobody. A capture has to put the man
    // SOMEWHERE — one that vanished is one nobody can count — and ONE place rather than a tray a
    // side, because two of them is two PRIVATE places, and a private place is a rule: it says whose
    // a taken man is and where he may be put, which this shelf does not decide.
    const zone = desk.children.find((n) => n.id === COMMON);
    expect(zone, "the common zone").toBeDefined();
    expect(caps(zone!).has("Acceptor"), "and it takes what is sent to it").toBe(true);
    expect(Math.abs(seatOf(zone!).y), "off the board, not on it").toBeGreaterThan(BOARD / 2);
    expect(desk.children.filter((n) => caps(n).has("Acceptor") && !isCell(n)).length, "one, not one each").toBe(1);
  });
});


describe("a move on the real board, end to end", () => {
  // The wiring's own fixture: no WebGL, a painter that draws nothing, and the hud unit pinned so a
  // desk point is a known number of glass pixels. ANIMATED, because a carry lives on the clock: a
  // scene without motions has nothing to grab with, and the wiring — rightly — starts no drag at all.
  const stubPainter = (): Painter => ({ ready: Promise.resolve(), draw: () => {}, resize: () => {}, destroy: () => {} });
  const scene = (root: Node) => buildScene(root, { animate: true }, currentSettings(), stubPainter);
  const measure = (el: HTMLElement): void => {
    const select = el.querySelector("[data-hud-unit]") as HTMLSelectElement;
    select.value = String(HUD_UNIT_CHOICES.find((c) => c === 60) ?? "auto");
    select.dispatchEvent(new Event("change"));
  };
  const stand = (desk: Node) => {
    document.body.innerHTML = "";
    const s = scene(desk);
    document.body.appendChild(s.el);
    measure(s.el);
    wireDrag(s, { zoneAt: (root, at) => squareAt(root, at) });
    return s;
  };

  /** A finger on the glass: the wiring reads a client point and a pointer id, nothing more. */
  const finger = (type: string, x: number, y: number): MouseEvent =>
    Object.assign(new MouseEvent(type, { clientX: x, clientY: y }), { pointerId: 1 });

  /** Glass pixels of a desk point, through the scene's own unit — the board is laid out around zero. */
  const glassOf = (s: ReturnType<typeof stand>, at: { x: number; y: number }) => {
    const v = s.host.viewport();
    const u = s.host.unit();
    return { x: v.width / 2 + at.x * u, y: v.height / 2 + at.y * u };
  };

  const dragTo = (s: ReturnType<typeof stand>, from: { x: number; y: number }, to: { x: number; y: number }): void => {
    const a = glassOf(s, from);
    const b = glassOf(s, to);
    s.host.view.dispatchEvent(finger("pointerdown", a.x, a.y));
    for (let i = 1; i <= 4; i++) s.host.view.dispatchEvent(finger("pointermove", a.x + ((b.x - a.x) * i) / 4, a.y + ((b.y - a.y) * i) / 4));
    s.host.view.dispatchEvent(finger("pointerup", b.x, b.y));
  };

  const cellAt = (desk: Node, at: { x: number; y: number }): Node => squareAt(desk, at)!;

  it("chess.a-man-put-on-an-occupied-square-takes-it — and the sitter goes to the common zone", () => {
    // Declared on the square (`Displacer` → `capture(COMMON)`) and, until the runtime did it, only
    // declared: a board got two men on one square. This drives the REAL desk through the REAL wiring,
    // because the jsdom guard on the wiring proves the mechanism and this proves the board uses it.
    const desk = chessMap();
    const s = stand(desk);
    const e2 = cellAt(desk, { x: 0.5, y: 2.5 });
    const e7 = cellAt(desk, { x: 0.5, y: -2.5 });
    const white = e2.children[0]!;
    const black = e7.children[0]!;
    expect(white && black, "both pawns stand where they were set up").toBeTruthy();
    dragTo(s, { x: 0.5, y: 2.5 }, { x: 0.5, y: -2.5 });
    expect(white.parent, "the man who arrived takes the square").toBe(e7);
    expect(black.parent?.id, "and the man who was there goes to the common zone").toBe(COMMON);
    expect(e7.children.length, "one to a square, never two").toBe(1);
    s.dispose();
  });

  it("chess.off-the-board-a-man-goes-anywhere-in-the-zone — where the hand left him", () => {
    // On the board a man is on a square or the next one. In the common zone there is no grid and no
    // reason for one: what is in it is a heap of taken men, and a player setting one beside another
    // is arranging nothing. So the zone takes him and leaves him exactly where he was put down.
    const desk = chessMap();
    const s = stand(desk);
    const zone = byId(desk, COMMON)!;
    const home = fieldsOf<TransformableFields>(zone, "Transformable")!.at!;
    const a1 = cellAt(desk, { x: -3.5, y: 3.5 });
    const rook = a1.children[0]!;
    const spot = { x: home.x - 2, y: home.y + 0.5 };
    dragTo(s, { x: -3.5, y: 3.5 }, spot);
    expect(rook.parent, "the zone took him").toBe(zone);
    const at = fieldsOf<TransformableFields>(rook, "Transformable")!.at!;
    expect(at.x, "where the hand left him, in the zone's own space").toBeCloseTo(spot.x - home.x, 3);
    expect(at.y).toBeCloseTo(spot.y - home.y, 3);
    s.dispose();
  });
});

/** Whose man this is — said on the man himself, never parsed out of his name. */
function ownedBy(piece: Node, seat: string): boolean {
  return fieldsOf<{ readonly box: string }>(piece, "Owned")?.box === seat;
}
