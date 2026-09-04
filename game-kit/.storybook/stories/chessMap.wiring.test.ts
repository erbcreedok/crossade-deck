// @vitest-environment jsdom
// THE BOARD, THROUGH THE REAL WIRING — what the pure test (`@game-presets/desks`'s own
// `chessMap.test.ts`) cannot check: the light, the picture of the landing, the mirroring, all of it
// the shelf's own and guarded HERE, in the catalog that owns the wiring.

import { describe, expect, it } from "vitest";
import { add, Bounded, caps, Container, Draggable, fieldsOf, extentOf, landingRecord, node, Owned, rect, Transformable, type BoundedFields, type Node, type TransformableFields } from "../../src/index.js";
import { BOARD, CHESS_COMMON as COMMON, chessMap, squareAt } from "@game-presets/desks";
import { scene as buildScene } from "../devtools/scene.js";
import { wireDrag } from "../devtools/drag.js";
import { currentSettings } from "../devtools/catalogSettings.js";
import { HUD_UNIT_CHOICES } from "../devtools/hudUnitChoices.js";
import type { Painter } from "../../src/index.js";

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
    // ...AND IS PUT DOWN ON THE FELT, OFF THE SQUARES. The felt holds sixty-four places and a face
    // before it holds one taken man; a row that counted those as men seated the first man taken
    // sixty places down, off the desk, and the owner saw the taken man simply vanish.
    const seat = fieldsOf<TransformableFields>(black, "Transformable")!.at!;
    const felt = extentOf(fieldsOf<BoundedFields>(desk, "Bounded")!.bounds);
    expect(Math.abs(seat.x), "inside the felt").toBeLessThan(felt.w / 2);
    expect(Math.abs(seat.y)).toBeLessThan(felt.h / 2);
    expect(squareAt(desk, seat), "and on no square — on the felt beside the board").toBe(desk);
    // ...IN THE FIRST PLACE OF THE ROW, which is the felt's top-left corner and nowhere near the
    // squares. The felt also holds a warming speck for every picture on the shelf; counted as men,
    // they seated the first man taken in the seventh row — on a4, standing on the board he had just
    // been taken off. The row is made of men, and he is the first.
    expect(seat.x, "black captured piece lands right of the board").toBeGreaterThan(BOARD / 2);
    expect(seat.y, "aligned near top of board").toBeCloseTo(-BOARD / 2 + 0.94 / 2, 3);
    s.dispose();
  });

  it("chess.an-empty-square-takes-too — the middle of the board is a board", () => {
    // The law is the square's, not the first man's: a square nobody was set up on must take a man
    // dropped on a man standing there, or the whole middle of the board stacks men three deep.
    const desk = chessMap();
    const s = stand(desk);
    const e4 = cellAt(desk, { x: 0.5, y: 0.5 });
    expect(e4.children.length, "e4 starts empty").toBe(0);
    dragTo(s, { x: 0.5, y: 2.5 }, { x: 0.5, y: 0.5 }); // white pawn e2 → e4
    dragTo(s, { x: 0.5, y: -2.5 }, { x: 0.5, y: 0.5 }); // black pawn e7 → e4: takes
    expect(e4.children.length, "one to a square, on a square that started empty too").toBe(1);
    expect(ownedBy(e4.children[0]!, "black"), "the man who arrived stands there").toBe(true);
    const taken = desk.children.filter((n) => caps(n).has("Draggable") && ownedBy(n, "white"));
    expect(taken.length, "the white pawn went to the common zone").toBe(1);
    s.dispose();
  });

  it("chess.beside-landing — white captured pieces land left, black land right, ninth in second column", () => {
    const desk = chessMap();
    const s = stand(desk);
    const e2 = cellAt(desk, { x: 0.5, y: 2.5 });
    const e7 = cellAt(desk, { x: 0.5, y: -2.5 });
    const whitePawn = e2.children[0]!;
    const blackPawn = e7.children[0]!;
    dragTo(s, { x: 0.5, y: 2.5 }, { x: 0.5, y: -2.5 });

    const blackSeat1 = fieldsOf<TransformableFields>(blackPawn, "Transformable")!.at!;
    expect(blackSeat1.x, "black captured piece lands right of board").toBeGreaterThan(BOARD / 2);

    dragTo(s, { x: -0.5, y: -3.5 }, { x: 0.5, y: -2.5 });
    const whiteSeat1 = fieldsOf<TransformableFields>(whitePawn, "Transformable")!.at!;
    expect(whiteSeat1.x, "white captured piece lands left of board").toBeLessThan(-BOARD / 2);

    // A SECOND WHITE MAN TAKEN — by the queen now standing on e7 coming down onto d2. The mover is
    // never the one who lands beside the board; the sitter is.
    const d2 = cellAt(desk, { x: -0.5, y: 2.5 });
    const whitePawn2 = d2.children[0]!;
    dragTo(s, { x: 0.5, y: -2.5 }, { x: -0.5, y: 2.5 });
    const whiteSeat2 = fieldsOf<TransformableFields>(whitePawn2, "Transformable")!.at!;
    expect(whiteSeat2.x).toBeCloseTo(whiteSeat1.x, 3);
    expect(whiteSeat2.y, "second white piece lands below the first").toBeGreaterThan(whiteSeat1.y);

    const landing = landingRecord("chess.beside")!;
    const zone = node("testZone", Container({ layout: "chess.tray" }));
    for (let i = 0; i < 8; i++) {
      add(zone, node(`w${i}`, Bounded({ bounds: rect(1, 1) }), Draggable(), Owned({ box: "white" }), Transformable({ at: { x: 0, y: 0 } })));
    }
    const piece9 = node("w8", Bounded({ bounds: rect(1, 1) }), Draggable(), Owned({ box: "white" }), Transformable({ at: { x: 0, y: 0 } }));
    add(zone, piece9);
    const pos9 = landing(piece9, zone, { w: 14, h: 14 });
    expect(pos9.x, "ninth white piece lands in second column further left").toBeLessThan(whiteSeat1.x);
    expect(pos9.y, "ninth white piece starts top row").toBeCloseTo(-BOARD / 2 + 0.94 / 2, 3);
    s.dispose();
  });

  it("chess.off-the-board-a-man-goes-anywhere-in-the-zone — where the hand left him", () => {
    // On the board a man is on a square or the next one. In the common zone there is no grid and no
    // reason for one: what is in it is a heap of taken men, and a player setting one beside another
    // is arranging nothing. So the zone takes him and leaves him exactly where he was put down.
    const desk = chessMap();
    const s = stand(desk);
    const a1 = cellAt(desk, { x: -3.5, y: 3.5 });
    const rook = a1.children[0]!;
    const spot = { x: -5.5, y: 2 };
    dragTo(s, { x: -3.5, y: 3.5 }, spot);
    expect(rook.parent, "the felt took him").toBe(desk);
    const at = fieldsOf<TransformableFields>(rook, "Transformable")!.at!;
    expect(at.x, "where the hand left him").toBeCloseTo(spot.x, 3);
    expect(at.y).toBeCloseTo(spot.y, 3);
    // ...AND BACK AGAIN: no wall between the felt and the board. What was taken off can be put on
    // — onto an EMPTY square here; taking is its own law and its own guard above. Taken from where
    // he is DRAWN: the seat is written at once and the clock eases him there, and a finger lands on
    // what the eye sees, not on what the tree says.
    const drawn = s.motions?.poses()?.get(rook.id) ?? { e: spot.x, f: spot.y };
    dragTo(s, { x: drawn.e, y: drawn.f }, { x: -3.5, y: 1.5 });
    expect(rook.parent, "and back onto a square").toBe(cellAt(desk, { x: -3.5, y: 1.5 }));
    s.dispose();
  });
});

/** Whose man this is — said on the man himself, never parsed out of his name. */
function ownedBy(piece: Node, seat: string): boolean {
  return fieldsOf<{ readonly box: string }>(piece, "Owned")?.box === seat;
}
