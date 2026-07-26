import { describe, it, expect } from "vitest";
import { linear, grid, absolute, pile } from "./layouts";
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
  it("indexAt — индекс ВСТАВКИ [0, N]: до центра карты → перед ней, за всеми → в КОНЕЦ", () => {
    const l = linear({ axis: "x", gap: 10 }); // at=[0,110,220], центры=[50,160,270]
    expect(l.indexAt({ x: 5, y: 0 }, many(3))).toBe(0); // до центра c0
    expect(l.indexAt({ x: 115, y: 0 }, many(3))).toBe(1); // между центрами c0 и c1
    expect(l.indexAt({ x: 999, y: 0 }, many(3))).toBe(3); // за всеми → append (BR1)
  });
});

describe("grid layout", () => {
  it("2 карты, minCols 3 → 3 колонки в ряд, at = top-left", () => {
    const r = grid({ cols: { min: 3 }, gap: 0 }).place(many(2));
    expect(r.at).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }]);
    expect(r.size).toEqual({ w: 300, h: 140 });
  });
  it("indexAt: точка → ячейка", () => {
    const g = grid({ cols: { min: 3 }, gap: 0 });
    expect(g.indexAt({ x: 50, y: 70 }, many(4))).toBe(0);
    expect(g.indexAt({ x: 250, y: 70 }, many(4))).toBe(2);
    expect(g.indexAt({ x: 50, y: 210 }, many(4))).toBe(3); // второй ряд
  });
  it("ПУСТОЙ грид с явной ячейкой держит размер (colsMin×rowsMin), а без неё схлопывается в 0", () => {
    const withCell = grid({ cell: CARD, cols: { min: 3 }, gap: 0, reserve: true }).place([]);
    expect(withCell.size).toEqual({ w: 300, h: 140 }); // 3×1 зарезервировано
    const noCell = grid({ cols: { min: 3 }, gap: 0, reserve: true }).place([]);
    expect(noCell.size).toEqual({ w: 0, h: 0 }); // без ячейки — 0 (нет контекста размера)
  });
});

describe("pile layout", () => {
  it("диагональный стаггер толщины, верх = последний", () => {
    const r = pile({ dx: 0.35, dy: -0.3 }).place(many(3));
    expect(r.at).toEqual([{ x: 0, y: 0 }, { x: 0.35, y: -0.3 }, { x: 0.7, y: -0.6 }]);
  });
  it("indexAt всегда верх кучи (последний)", () => {
    expect(pile().indexAt({ x: 0, y: 0 }, many(4))).toBe(3);
    expect(pile().indexAt({ x: 0, y: 0 }, [])).toBe(0);
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
