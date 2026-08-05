import { describe, expect, it } from "vitest";
import { ringBox, RING_CLEAR, roundTableTree } from "./roundTableTree";
import { buildBoardTree } from "./boardTree";
import { bootState } from "../core/mock";
import { roundTableBoard } from "../library/roundTable";
import { CARD } from "../../crossade/tree";
import { zoneOf, type BoardSpec } from "../core/spec";

/** Толщина кольца между периметрами: внешний круг вписан в бокс, центр меряется по ОХВАТУ своих
 *  ячеек — у фикс-слотов и сетки центр не одна рамка, а много (`table:3`, `table:r1c2`). */
function ringWidth(spec: BoardSpec, seats: number): number {
  const s = bootState(spec, seats);
  const tree = buildBoardTree(spec, s, s.seats[0]!.id);
  const box = tree.cellRects["board:0"]!;
  const cells = Object.entries(tree.cellRects).filter(([k]) => zoneOf(k) === "table").map(([, r]) => r);
  const w = Math.max(...cells.map((c) => c.x + c.w)) - Math.min(...cells.map((c) => c.x));
  const h = Math.max(...cells.map((c) => c.y + c.h)) - Math.min(...cells.map((c) => c.y));
  return (Math.min(box.w, box.h) - Math.max(w, h)) / 2;
}

describe("ringBox", () => {
  it("без центра держит минимум спеки", () => {
    expect(ringBox({ w: 1140, h: 1140 }, [])).toEqual({ w: 1140, h: 1140 });
  });

  it("центр крупнее минимума раздвигает бокс на три карты с каждой стороны", () => {
    const side = 900;
    expect(ringBox({ w: 1140, h: 1140 }, [{ w: 600, h: side }])).toEqual({
      w: side + RING_CLEAR * 2,
      h: side + RING_CLEAR * 2,
    });
  });

  it("бокс КВАДРАТНЫЙ и при прямоугольном центре (круг ровный), меряется по большей стороне", () => {
    const box = ringBox({ w: 100, h: 100 }, [{ w: 1200, h: 300 }]);
    expect(box.w).toBe(box.h);
    expect(box.w).toBe(1200 + RING_CLEAR * 2);
  });

  it("кольцо считается по САМОЙ широкой зоне центра, а не по последней", () => {
    expect(ringBox({ w: 0, h: 0 }, [{ w: 800, h: 800 }, { w: 200, h: 200 }]).w).toBe(800 + RING_CLEAR * 2);
  });
});

describe("круглый стол: кольцо не тоньше трёх карт", () => {
  it("песочница на 4 места", () => {
    expect(ringWidth(roundTableBoard({ dealt: 0 }), 4)).toBeGreaterThanOrEqual(CARD.w * 3);
  });

  it("восемь мест: центр вырос, внешний круг ушёл за ним", () => {
    const four = ringWidth(roundTableBoard({ seats: 4, dealt: 0 }), 4);
    const eight = ringWidth(roundTableBoard({ seats: 8, dealt: 0 }), 8);
    expect(eight).toBeGreaterThanOrEqual(CARD.w * 3);
    expect(four).toBeCloseTo(CARD.w * 3, 6); // на четырёх местах правило и задаёт габарит бокса
  });

  it("карты, доложенные на стол, кольцо не съедают", () => {
    expect(ringWidth(roundTableBoard({ seats: 4, dealt: 12 }), 4)).toBeGreaterThanOrEqual(CARD.w * 3);
  });

  it("фикс-слоты и сетка центра — то же правило", () => {
    expect(ringWidth(roundTableBoard({ slots: 12, dealt: 6 }), 4)).toBeGreaterThanOrEqual(CARD.w * 3);
    expect(ringWidth(roundTableBoard({ table: "grid", slots: 12, dealt: 6 }), 4)).toBeGreaterThanOrEqual(CARD.w * 3);
  });
});

describe("разметка зоны крупнее карты", () => {
  const spec = roundTableBoard({ seats: 4, dealt: 1 });

  it("посадочный кружок крупнее карты, а карта в нём — по центру", () => {
    const s = bootState(spec, 4);
    const seat = s.seats[0]!.id;
    const seatsZone = spec.zones.find((z) => z.layout.kind === "seats")!;
    const tree = roundTableTree(spec, s, seat, seatsZone);
    const cellRect = tree.cellRects[`place@${seat}:0`]!;
    expect(cellRect.w).toBeGreaterThan(CARD.w);
    expect(cellRect.h).toBeGreaterThan(CARD.h);
  });

  it("центр размечен под ячейку зоны, а не под карту: круг шире четырёх карт", () => {
    const tree = buildBoardTree(spec, bootState(spec, 4), "p1");
    expect(tree.cellRects["table:0"]!.w).toBeGreaterThan(CARD.w * 4);
  });
});
