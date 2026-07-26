import { describe, it, expect } from "vitest";
import { packDims, flowCenters, flowSize } from "./dynamicGrid";

// FLOW-грид: паковка по индексу, растёт под контент. Чисто.
describe("packDims", () => {
  it("растёт как задумано: 1×1, 1×2, 1×3, 2×2, 2×3, 3×3", () => {
    expect(packDims(1)).toEqual({ rows: 1, cols: 1 });
    expect(packDims(2)).toEqual({ rows: 1, cols: 2 });
    expect(packDims(3)).toEqual({ rows: 1, cols: 3 });
    expect(packDims(4)).toEqual({ rows: 2, cols: 2 });
    expect(packDims(5)).toEqual({ rows: 2, cols: 3 });
    expect(packDims(6)).toEqual({ rows: 2, cols: 3 });
    expect(packDims(9)).toEqual({ rows: 3, cols: 3 });
    expect(packDims(0)).toEqual({ rows: 0, cols: 0 });
  });
});

describe("flowCenters", () => {
  const geom = { cell: { w: 100, h: 100 }, gap: 0, origin: { x: 0, y: 0 } };
  it("карты по индексу row-major (n=4 → 2×2)", () => {
    expect(flowCenters(4, geom)).toEqual([
      { x: 50, y: 50 },
      { x: 150, y: 50 },
      { x: 50, y: 150 },
      { x: 150, y: 150 },
    ]);
  });
  it("одна карта — по центру старт-ячейки", () => {
    expect(flowCenters(1, geom)).toEqual([{ x: 50, y: 50 }]);
  });
});

describe("flowSize", () => {
  it("пустой грид → минимум 1×1; n=4 → 2×2", () => {
    expect(flowSize(0, { cell: { w: 100, h: 100 }, gap: 0, origin: { x: 0, y: 0 } })).toEqual({ w: 100, h: 100 });
    expect(flowSize(4, { cell: { w: 100, h: 100 }, gap: 10, origin: { x: 0, y: 0 } })).toEqual({ w: 210, h: 210 });
  });
});
