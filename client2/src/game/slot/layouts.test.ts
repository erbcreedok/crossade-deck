import { describe, it, expect } from "vitest";
import { linear, grid, absolute } from "./layouts";
import type { Size } from "./types";

const CARD: Size = { w: 100, h: 140 };
const many = (n: number) => Array.from({ length: n }, () => CARD);

describe("linear layout", () => {
  it("ряд с зазором: позиции по оси, габарит = сумма", () => {
    const l = linear({ axis: "x", gap: 10 });
    const r = l.place(many(3));
    expect(r.at).toEqual([{ x: 0, y: 0 }, { x: 110, y: 0 }, { x: 220, y: 0 }]);
    expect(r.size).toEqual({ w: 320, h: 140 });
  });
  it("нахлёст (gap<0) — стопка со стаггером", () => {
    const l = linear({ axis: "x", gap: -90 });
    const r = l.place(many(3));
    expect(r.at).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }]);
    expect(r.size).toEqual({ w: 120, h: 140 });
  });
  it("indexAt по оси: точка → ближайший слот слева", () => {
    const l = linear({ axis: "x", gap: 10 });
    expect(l.indexAt({ x: 5, y: 0 }, many(3))).toBe(0);
    expect(l.indexAt({ x: 115, y: 0 }, many(3))).toBe(1);
    expect(l.indexAt({ x: 999, y: 0 }, many(3))).toBe(2);
  });
});

describe("grid layout", () => {
  it("2 карты, minCols 3 → 3 колонки в ряд, at = top-left", () => {
    const r = grid({ minCols: 3, gap: 0 }).place(many(2));
    expect(r.at).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(r.size).toEqual({ w: 300, h: 140 });
  });
  it("indexAt: точка → ячейка", () => {
    const g = grid({ minCols: 3, gap: 0 });
    expect(g.indexAt({ x: 50, y: 70 }, many(4))).toBe(0);
    expect(g.indexAt({ x: 250, y: 70 }, many(4))).toBe(2);
    expect(g.indexAt({ x: 50, y: 210 }, many(4))).toBe(3); // второй ряд
  });
});

describe("absolute layout", () => {
  it("дети на фиксированных смещениях, габарит = bounding box", () => {
    const l = absolute([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
    const r = l.place([CARD, { w: 300, h: 140 }]);
    expect(r.at).toEqual([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
    expect(r.size).toEqual({ w: 500, h: 140 });
  });
  it("indexAt — хит-тест прямоугольников, мимо → null", () => {
    const l = absolute([{ x: 0, y: 0 }, { x: 200, y: 0 }]);
    expect(l.indexAt({ x: 50, y: 70 }, [CARD, { w: 300, h: 140 }])).toBe(0);
    expect(l.indexAt({ x: 250, y: 70 }, [CARD, { w: 300, h: 140 }])).toBe(1);
    expect(l.indexAt({ x: 150, y: 70 }, [CARD, { w: 300, h: 140 }])).toBeNull();
  });
});
