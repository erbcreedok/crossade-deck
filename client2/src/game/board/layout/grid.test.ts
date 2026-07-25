import { describe, it, expect } from "vitest";
import { keyOf, coordOf, cellRect, cellCenter, indexToCoord, coordToIndex, gridPixelSize, type GridSpec } from "./grid";

// Grid — одна из стратегий раскладки (grid/ring/points/seats). Чистая геометрия: (r,c) → прямоугольник
// слота. Ключ слота стабилен ("r,c"). Без Pixi, тестируется числами.
const spec: GridSpec = { cols: 3, cell: { w: 100, h: 140 }, gap: 10, origin: { x: 20, y: 30 } };

describe("grid key ↔ coord", () => {
  it("keyOf / coordOf — обратимы", () => {
    expect(keyOf(2, 1)).toBe("2,1");
    expect(coordOf("2,1")).toEqual({ r: 2, c: 1 });
  });
});

describe("grid геометрия", () => {
  it("cellRect: origin + (шаг = cell+gap) по колонке/строке", () => {
    expect(cellRect(spec, 0, 0)).toEqual({ x: 20, y: 30, w: 100, h: 140 });
    expect(cellRect(spec, 1, 2)).toEqual({ x: 20 + 2 * 110, y: 30 + 1 * 150, w: 100, h: 140 });
  });
  it("cellCenter — центр слота (движок позиционирует по центру)", () => {
    expect(cellCenter(spec, 0, 0)).toEqual({ x: 70, y: 100 });
  });
  it("index ↔ coord (row-major по cols)", () => {
    expect(indexToCoord(spec, 0)).toEqual({ r: 0, c: 0 });
    expect(indexToCoord(spec, 4)).toEqual({ r: 1, c: 1 }); // 4 = строка 1, колонка 1 при cols=3
    expect(coordToIndex(spec, 1, 1)).toBe(4);
  });
  it("gridPixelSize — общий размер сетки под N строк", () => {
    expect(gridPixelSize(spec, 2)).toEqual({ w: 3 * 100 + 2 * 10, h: 2 * 140 + 1 * 10 });
  });
});
