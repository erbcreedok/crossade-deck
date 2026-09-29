import { describe, expect, it } from "vitest";
import { axesFor, unitSize } from "./spriteAxes.js";

// Оси проверяются тем же, чем их считает слой тел: правая тройка «право × перед = верх» в осях фигуры, а в осях картинки
// (x вправо, y вниз, z к зрителю — левая тройка экрана) она выходит как право × перед = −верх.
const cross = (a: readonly number[], b: readonly number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];

describe("оси спрайта", () => {
  it("лицо: перед — к зрителю, право фигуры — влево по картинке; спина — наоборот", () => {
    expect(axesFor("front")).toEqual({ front: [0, 0, 1], up: [0, -1, 0], right: [-1, 0, 0] });
    expect(axesFor("back")).toMatchObject({ front: [0, 0, -1], right: [1, 0, 0] });
    expect(axesFor(null), "без стороны — как лицо").toEqual(axesFor("front"));
  });

  it("у каждой стороны оси — настоящая тройка фигуры, без зеркала", () => {
    for (const side of ["front", "back", "right", "left", "top", "bottom"]) {
      const a = axesFor(side);
      expect(cross(a.right, a.front).map((v) => v + 0), side).toEqual(a.up.map((v) => -v + 0));
    }
  });

  it("правый бок: перед — вправо по картинке, право — к зрителю; верх: верх фигуры — к зрителю, перед — вниз", () => {
    expect(axesFor("right")).toMatchObject({ front: [1, 0, 0], right: [0, 0, 1] });
    expect(axesFor("top")).toMatchObject({ up: [0, 0, 1], front: [0, 1, 0] });
  });

  it("размер в единицах стола — по детали и сторонам картинки", () => {
    expect(unitSize("head", 1)).toEqual({ w: 2.4, h: 2.4 });
    expect(unitSize("body", 0.5, 2)).toEqual({ w: 10.4, h: 5.2 });
    expect(unitSize("legs", 2)).toEqual({ w: 3.4, h: 3.8 });
    expect(unitSize("other", 1)).toBeNull();
  });
});
