import { describe, it, expect } from "vitest";
import { dashedRectSegments } from "./dashedRectSegments";

describe("dashedRectSegments", () => {
  it("считает по 10 отрезков на сторону 100 при dash=6/gap=4 (шаг 10)", () => {
    const segs = dashedRectSegments(0, 0, 100, 100, 6, 4);
    expect(segs).toHaveLength(40); // 10 на сторону × 4 стороны
  });

  it("каждый отрезок не длиннее dash", () => {
    const segs = dashedRectSegments(0, 0, 37, 23, 6, 4); // не кратно шагу — последний укорочен
    for (const s of segs) {
      const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
      expect(len).toBeLessThanOrEqual(6 + 1e-9);
      expect(len).toBeGreaterThan(0);
    }
  });

  it("периметр покрыт по всем 4 сторонам (верх/право/низ/лево начинаются в углах прямоугольника)", () => {
    const segs = dashedRectSegments(10, 20, 100, 50, 6, 4);
    expect(segs[0]).toMatchObject({ x1: 10, y1: 20 }); // верх, от левого-верхнего угла
    const rightSideStart = segs.find((s) => s.x1 === 110 && s.y1 === 20);
    expect(rightSideStart).toBeTruthy(); // право, от правого-верхнего угла
  });

  it("вырожденный прямоугольник (нулевая сторона) не роняет функцию", () => {
    expect(dashedRectSegments(0, 0, 0, 0, 6, 4)).toEqual([]);
  });

  it("dash+gap=0 не зацикливается — возвращает пусто", () => {
    expect(dashedRectSegments(0, 0, 100, 50, 0, 0)).toEqual([]);
  });
});
