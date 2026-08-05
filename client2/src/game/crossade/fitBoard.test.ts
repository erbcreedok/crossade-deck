import { describe, expect, it } from "vitest";
import { fitZoom } from "./fitBoard";

const size = { w: 800, h: 600 };

describe("fitZoom", () => {
  it("доска больше экрана — уменьшается по тесной стороне", () => {
    expect(fitZoom({ viewW: 400, viewH: 600, insetTop: 0, size })).toBeCloseTo(0.5);
    expect(fitZoom({ viewW: 800, viewH: 300, insetTop: 0, size })).toBeCloseTo(0.5);
  });

  it("доска меньше экрана — НЕ растягивается сверх 1", () => {
    expect(fitZoom({ viewW: 4000, viewH: 3000, insetTop: 0, size })).toBe(1);
  });

  it("хром сверху съедает высоту: вписывание считается по остатку", () => {
    // 600 высоты хватало ровно; 300 под топбаром — уже вдвое меньше.
    expect(fitZoom({ viewW: 800, viewH: 600, insetTop: 0, size })).toBe(1);
    expect(fitZoom({ viewW: 800, viewH: 600, insetTop: 300, size })).toBeCloseTo(0.5);
  });

  it("хром выше экрана: остаток не уходит в ноль или минус", () => {
    const z = fitZoom({ viewW: 800, viewH: 100, insetTop: 400, size });
    expect(z).toBeGreaterThan(0);
    expect(z).toBeLessThan(0.01);
  });
});
