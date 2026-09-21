import { describe, expect, it } from "vitest";
import { apart, shortWay } from "./angles.js";

describe("углы", () => {
  it("кратчайший путь идёт через ноль, а не вокруг", () => {
    expect(shortWay(10, 350)).toBe(20);
    expect(shortWay(350, 10)).toBe(-20);
    expect(shortWay(180, 0)).toBe(-180);
    expect(shortWay(725, 0)).toBe(5);
    expect(shortWay(-10, 10)).toBe(-20);
  });

  it("расстояние между углами — без знака и не больше полукруга", () => {
    for (const [a, b, d] of [[0, 0, 0], [10, 350, 20], [350, 10, 20], [90, 270, 180], [-90, 90, 180], [720, 45, 45]] as const) {
      expect(apart(a, b), `${a}…${b}`).toBe(d);
      expect(apart(b, a)).toBe(d);
    }
  });
});
