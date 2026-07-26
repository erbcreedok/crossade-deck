import { describe, it, expect } from "vitest";
import { flowLayout, flowIndexAt } from "./dynamicGrid";

// FLOW-грид: паковка по индексу, minCols + резерв места под след. карту. Чисто.
const geom = { cell: { w: 100, h: 100 }, gap: 0, origin: { x: 0, y: 0 } };
const opt = { minCols: 3, reserve: true };

describe("flowLayout (minCols=3, reserve)", () => {
  it("пустой грид → 3 колонки × 1 ряд (место под карты), центров нет", () => {
    const l = flowLayout(0, geom, opt);
    expect(l.cols).toBe(3);
    expect(l.rows).toBe(1);
    expect(l.centers).toEqual([]);
    expect(l.size).toEqual({ w: 300, h: 100 });
  });
  it("3 карты заполняют 1 ряд, но резерв держит 2-й ряд (3×2)", () => {
    const l = flowLayout(3, geom, opt);
    expect(l.cols).toBe(3);
    expect(l.rows).toBe(2); // резерв под 4-ю
    expect(l.centers).toEqual([
      { x: 50, y: 50 },
      { x: 150, y: 50 },
      { x: 250, y: 50 },
    ]);
    expect(l.size).toEqual({ w: 300, h: 200 });
  });
  it("4 карты → 3×2, 4-я в начале 2-го ряда", () => {
    const l = flowLayout(4, geom, opt);
    expect(l.cols).toBe(3);
    expect(l.centers[3]).toEqual({ x: 50, y: 150 });
  });
  it("минимум 3 колонки даже для 1 карты", () => {
    expect(flowLayout(1, geom, opt).cols).toBe(3);
  });
  it("растёт за 3 колонки на больших n (>~9)", () => {
    expect(flowLayout(12, geom, opt).cols).toBeGreaterThan(3);
  });
});

describe("flowLayout (maxRows=4)", () => {
  const o = { minCols: 3, maxRows: 4, reserve: false };
  it("до упора растёт вниз: 12 карт → 4×3 (≤4 строк)", () => {
    const l = flowLayout(12, geom, o);
    expect(l.rows).toBeLessThanOrEqual(4);
  });
  it("при упоре в 4 строки грид растёт КОЛОНКАМИ, не вниз", () => {
    const l = flowLayout(21, geom, o); // 21 не влезает в 4 ряда при малых колонках
    expect(l.rows).toBe(4);
    expect(l.cols).toBe(6); // ceil(21/4)=6
  });
  it("без maxRows строки не ограничены", () => {
    const l = flowLayout(21, geom, { minCols: 3, reserve: false });
    expect(l.rows).toBe(5);
  });
});

describe("flowIndexAt (позиция дропа → индекс, cols=3, count=6)", () => {
  it("верхний ряд по колонкам: 0,1,2", () => {
    expect(flowIndexAt({ x: 50, y: 50 }, geom, 3, 6)).toBe(0);
    expect(flowIndexAt({ x: 150, y: 50 }, geom, 3, 6)).toBe(1);
    expect(flowIndexAt({ x: 250, y: 50 }, geom, 3, 6)).toBe(2);
  });
  it("второй ряд: 3,4,5", () => {
    expect(flowIndexAt({ x: 50, y: 150 }, geom, 3, 6)).toBe(3);
    expect(flowIndexAt({ x: 250, y: 150 }, geom, 3, 6)).toBe(5);
  });
  it("за краями зажимается в [0, count-1]", () => {
    expect(flowIndexAt({ x: -99, y: -99 }, geom, 3, 6)).toBe(0);
    expect(flowIndexAt({ x: 9999, y: 9999 }, geom, 3, 6)).toBe(5);
  });
  it("пустой грид → 0", () => {
    expect(flowIndexAt({ x: 150, y: 50 }, geom, 3, 0)).toBe(0);
  });
});
