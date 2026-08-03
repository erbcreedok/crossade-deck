import { describe, expect, it } from "vitest";
import { mergedFillBounds } from "./ShadowLayer";
import type { ShadowShape } from "./Card";

// Заливка слитой тени должна накрывать силуэты, УШЕДШИЕ за контент (карта в драге), иначе тень
// обрезается по краю прямоугольника w×h. Пол — сам контент.
const rectShape = (x: number, y: number, hw = 50, hh = 70): ShadowShape => ({ x, y, hw, hh, rot: 0, round: false });

describe("mergedFillBounds", () => {
  it("нет силуэтов → null (сливать нечего)", () => {
    expect(mergedFillBounds([], 800, 600)).toBeNull();
  });

  it("силуэт внутри контента → габарит не меньше контента (пол w×h)", () => {
    const b = mergedFillBounds([rectShape(400, 300)], 800, 600)!;
    expect(b.x).toBeLessThanOrEqual(0);
    expect(b.y).toBeLessThanOrEqual(0);
    expect(b.x + b.w).toBeGreaterThanOrEqual(800);
    expect(b.y + b.h).toBeGreaterThanOrEqual(600);
  });

  it("силуэт УШЁЛ за контент вниз-вправо → заливка растягивается и накрывает его (не режется)", () => {
    const s = rectShape(1200, 1500, 50, 70); // далеко за пределами 800×600
    const b = mergedFillBounds([s], 800, 600)!;
    const r = Math.hypot(50, 70) + 4;
    expect(b.x + b.w).toBeGreaterThanOrEqual(s.x + r); // правый край заливки за картой
    expect(b.y + b.h).toBeGreaterThanOrEqual(s.y + r); // нижний край заливки за картой
  });

  it("силуэт ушёл за контент влево-вверх (отрицательные координаты) → заливка тянется в минус", () => {
    const s = rectShape(-300, -200, 50, 70);
    const b = mergedFillBounds([s], 800, 600)!;
    const r = Math.hypot(50, 70) + 4;
    expect(b.x).toBeLessThanOrEqual(s.x - r);
    expect(b.y).toBeLessThanOrEqual(s.y - r);
  });

  it("одиночные тени (image/poly) в слияние не идут — их габарит не учитывается", () => {
    const solo: ShadowShape = { x: 5000, y: 5000, hw: 50, hh: 70, rot: 0, round: false, poly: [[0, 0, 1, 0, 1, 1]] };
    expect(mergedFillBounds([solo], 800, 600)).toBeNull(); // только одиночка → сливать нечего
  });
});
