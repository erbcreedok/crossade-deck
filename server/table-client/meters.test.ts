import { describe, expect, it } from "vitest";
import { fpsOf } from "./meters.js";

describe("meters.fps", () => {
  it("кадры за окно — в кадры в секунду", () => {
    expect(fpsOf(60, 1000)).toBe(60);
    expect(fpsOf(45, 1500)).toBe(30);
    expect(fpsOf(10, 0), "пустое окно — ноль, а не бесконечность").toBe(0);
  });
});
