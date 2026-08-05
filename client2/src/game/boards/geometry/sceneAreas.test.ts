import { describe, expect, it } from "vitest";
import { hintShape, menuTargetAt } from "./sceneAreas";
import type { ZoneSpec } from "../core/spec";

// Геометрия областей сцены: цель меню под точкой и фигура подсветки дропа — чистые правила,
// вынесенные из BoardScene (сцена только обводит готовую фигуру).

const freeZone: ZoneSpec = { id: "board", title: "", layout: { kind: "free" }, policy: { onOccupied: "merge" }, shape: "circle", cell: { w: 400, h: 400 } };
const tableZone: ZoneSpec = { id: "table", title: "", layout: { kind: "radial" }, policy: { onOccupied: "merge" }, shape: "circle" };

describe("menuTargetAt", () => {
  const rects = {
    "board:0": { x: 0, y: 0, w: 400, h: 400 },
    "table:0": { x: 150, y: 150, w: 100, h: 100 },
  };
  it("внутренняя (меньшая) цель побеждает: над гридом — «стол», над остальным боксом — «борда»", () => {
    expect(menuTargetAt([freeZone, tableZone], rects, { x: 200, y: 200 })).toBe("table");
    expect(menuTargetAt([freeZone, tableZone], rects, { x: 30, y: 30 })).toBe("board");
    expect(menuTargetAt([freeZone, tableZone], rects, { x: 500, y: 500 })).toBeNull();
  });
});

describe("hintShape", () => {
  const cellRects = { "board:0": { x: 10, y: 10, w: 400, h: 400 } };
  const origins = { "board:0": { x: 160, y: 50 }, "board:2": { x: 40, y: 300 }, "hand:p1": { x: 20, y: 500 } };
  const card = { w: 100, h: 143 };

  it("псевдо-слот box круглой free-зоны — весь круг; квадратной — рамка бокса", () => {
    const circle = hintShape({ hotSlot: "board:box", zone: freeZone, cellRects, origins, members: 0, card });
    expect(circle).toEqual({ kind: "circle", cx: 210, cy: 210, r: 203 });
    const rect = hintShape({ hotSlot: "board:box", zone: { ...freeZone, shape: undefined }, cellRects, origins, members: 0, card });
    expect(rect?.kind).toBe("rect");
  });

  it("реальный слот free-зоны — футпринт стопки (не бокс), даже у колоды", () => {
    const deck = hintShape({ hotSlot: "board:0", zone: freeZone, cellRects, origins, members: 36, card });
    expect(deck).toEqual({ kind: "rect", x: 157, y: 47, w: 100 + 17.5 + 6, h: 143 + 17.5 + 6 });
    const loose = hintShape({ hotSlot: "board:2", zone: freeZone, cellRects, origins, members: 1, card });
    expect(loose).toEqual({ kind: "rect", x: 37, y: 297, w: 106, h: 149 });
  });

  it("обычная зона — её ячейка формой зоны; слот без ячейки (рука) — карточный прямоугольник", () => {
    const cell = hintShape({ hotSlot: "board:0", zone: tableZone, cellRects, origins, members: 0, card });
    expect(cell).toEqual({ kind: "circle", cx: 210, cy: 210, r: 203 });
    const hand = hintShape({ hotSlot: "hand:p1", zone: undefined, cellRects, origins, members: 0, card });
    expect(hand).toEqual({ kind: "rect", x: 16, y: 496, w: 108, h: 151 });
  });
});
