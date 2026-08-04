import { describe, expect, it } from "vitest";
import { unionRect } from "./selection";

describe("unionRect — стопка выделяется как ОДНА фигура", () => {
  it("объединение накрывает все карты стаггер-стопки, а не одну", () => {
    const u = unionRect([
      { x: 0, y: 0, w: 100, h: 143 },
      { x: 6, y: 6, w: 100, h: 143 },
      { x: 12, y: 12, w: 100, h: 143 },
    ])!;
    expect(u).toEqual({ x: 0, y: 0, w: 112, h: 155 });
  });
  it("одна карта — её же габарит; пусто — null", () => {
    expect(unionRect([{ x: 5, y: 7, w: 10, h: 20 }])).toEqual({ x: 5, y: 7, w: 10, h: 20 });
    expect(unionRect([])).toBeNull();
  });
});
