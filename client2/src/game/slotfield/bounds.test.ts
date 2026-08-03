import { describe, it, expect } from "vitest";
import { clampToBounds, type Rect } from "./bounds";

// «Фигуры не могут выбраться из контейнера»: центр фигуры клампится так, чтобы её полурзмеры
// (half) остались внутри рамки. Чистая функция.
const box: Rect = { x: 100, y: 100, w: 400, h: 300 };
const half = { w: 20, h: 30 };

describe("clampToBounds", () => {
  it("внутри — без изменений", () => {
    expect(clampToBounds({ x: 250, y: 200 }, half, box)).toEqual({ x: 250, y: 200 });
  });
  it("за левый/верхний край — прижимает с учётом half", () => {
    expect(clampToBounds({ x: 0, y: 0 }, half, box)).toEqual({ x: 120, y: 130 });
  });
  it("за правый/нижний край — прижимает с учётом half", () => {
    expect(clampToBounds({ x: 999, y: 999 }, half, box)).toEqual({ x: 100 + 400 - 20, y: 100 + 300 - 30 });
  });
  it("рамка уже фигуры — центрирует (не рвётся)", () => {
    const tiny: Rect = { x: 0, y: 0, w: 10, h: 10 };
    expect(clampToBounds({ x: 999, y: -999 }, half, tiny)).toEqual({ x: 5, y: 5 });
  });
});
