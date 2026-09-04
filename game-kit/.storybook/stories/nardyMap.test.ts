// A nardy board is a desk whose places are PILES: the tests here are about the three things the
// page decides — what a point is, what a hand takes off one, and where a die may fly — and not about
// the game, which the page deliberately does not decide.

import { describe, expect, it } from "vitest";
import { caps, fieldsOf, placeChildren, wouldAccept, type Node, type TransformableFields } from "../../src/index.js";
import { COMMON, FELT, isChecker, isPoint, nardyMap, numberOf, pointAt, pointUnder, runOf, seatsOf, wallsOf } from "./nardyMap.js";

const points = (desk: Node): Node[] => desk.children.filter(isPoint);
const pointN = (desk: Node, n: number): Node => points(desk).find((p) => numberOf(p) === n)!;
const seatOf = (n: Node) => fieldsOf<TransformableFields>(n, "Transformable")!.at!;
const colorOf = (n: Node): string => String(fieldsOf<{ values: Record<string, unknown> }>(n, "Valued")?.values?.["color"]);

describe("a nardy board is a desk whose places are piles", () => {
  it("nardy.twenty-four-points-and-two-heads — fifteen a side, all on one point, squeezed into it", () => {
    const desk = nardyMap();
    expect(desk.id).toBe(COMMON);
    expect(points(desk).length).toBe(24);
    for (const p of points(desk)) expect(caps(p).has("Acceptor"), "a point is an acceptor like any place").toBe(true);
    const white = pointN(desk, 24);
    const black = pointN(desk, 12);
    expect(white.children.filter(isChecker).length).toBe(15);
    expect(black.children.filter(isChecker).length).toBe(15);
    // Squeezed: every one of the fifteen is still inside the point's five units.
    const placed = placeChildren(white);
    for (const c of white.children) expect(Math.abs(placed.get(c.id)!.y)).toBeLessThanOrEqual(2.5 + 1e-9);
    // Opposite corners: white's head top right, black's bottom left.
    expect(seatOf(white).x).toBeGreaterThan(0);
    expect(seatOf(white).y).toBeLessThan(0);
    expect(seatOf(black).x).toBeLessThan(0);
    expect(seatOf(black).y).toBeGreaterThan(0);
  });

  it("nardy.a-colour-lies-on-its-own-colour-or-on-nothing — the point's rule is data, and it refuses the other colour", () => {
    const desk = nardyMap();
    const white = pointN(desk, 24).children[0]!;
    const black = pointN(desk, 12).children[0]!;
    expect(wouldAccept(pointN(desk, 1), white), "an empty point takes anyone").toBe(true);
    expect(wouldAccept(pointN(desk, 24), white), "white on white").toBe(true);
    expect(wouldAccept(pointN(desk, 24), black), "black on white is refused").toBe(false);
    expect(wouldAccept(pointN(desk, 12), black), "black on black").toBe(true);
    expect(colorOf(white)).toBe("white");
  });

  it("nardy.a-hand-takes-the-checker-and-everything-above-it — the touched one is the grip, and the column stands in the hand", () => {
    const desk = nardyMap();
    const head = pointN(desk, 12);
    const third = head.children[2]!;
    const run = runOf(desk, third);
    expect(run.length, "the third and the twelve above it").toBe(13);
    expect(run[0]).toBe(third);
    const seats = seatsOf(desk, third, run);
    expect(seats[0]).toEqual({ x: 0, y: 0 });
    // Black's head is on the bottom row: the column rises in the hand (y decreases).
    expect(seats[1]!.y).toBeLessThan(0);
    // Off a point a checker is alone; so is a die.
    const die = desk.children.find((n) => caps(n).has("Rollable"))!;
    expect(runOf(desk, die)).toEqual([die]);
  });

  it("nardy.the-point-under-the-anchor-and-none-for-a-die — a checker aims at a point, a die never does", () => {
    const desk = nardyMap();
    const white = pointN(desk, 24).children[0]!;
    const die = desk.children.find((n) => caps(n).has("Rollable"))!;
    const { at } = pointAt(19);
    expect(numberOf(pointUnder(desk, at, white)!)).toBe(19);
    expect(numberOf(pointUnder(desk, { x: at.x, y: at.y + 2 }, white)!), "anywhere along the point").toBe(19);
    expect(pointUnder(desk, { x: 0, y: 0 }, white), "the bar and the middle are nobody's").toBeUndefined();
    expect(pointUnder(desk, at, die), "a die lies where it falls").toBeUndefined();
  });

  it("nardy.a-die-flies-inside-the-band-it-was-thrown-in — on the board it stays on the board, beside it it stays beside", () => {
    const desk = nardyMap();
    const die = desk.children.find((n) => caps(n).has("Rollable"))!;
    const checker = pointN(desk, 24).children[0]!;
    const inside = wallsOf(die, { x: 0, y: 0 })!;
    expect(inside.x1).toBeLessThan(FELT.w / 2);
    expect(inside.y1).toBeLessThan(FELT.h / 2);
    const right = wallsOf(die, { x: FELT.w / 2 - 1, y: 0 })!;
    expect(right.x0, "the board's edge is a wall from outside too").toBeGreaterThan(inside.x1);
    expect(right.x1).toBeLessThan(FELT.w / 2);
    const above = wallsOf(die, { x: 0, y: -FELT.h / 2 + 0.5 })!;
    expect(above.y1).toBeLessThan(inside.y0);
    // A checker gets the whole felt: it may cross the board and leave it.
    const felt = wallsOf(checker, { x: 0, y: 0 })!;
    expect(felt.x1).toBeGreaterThan(inside.x1);
  });
});
