// ДВОЙНОЙ ТАП СОБИРАЕТСЯ ТОЧКОЙ, А НЕ ИМЕНЕМ КАРТЫ.
//
// Закон писан по записи живой партии: в тесной руке второй тап садился на соседнюю карту, пара
// распадалась, и переворот не уходил на стол вовсе.

import { describe, expect, it } from "vitest";
import { doubleTap, type Tap } from "./tap.js";
import { DOUBLE_TAP_MS, DOUBLE_TAP_PX } from "./screenConst.js";

const tap = (id: string, at: number, x = 100, y = 100): Tap => ({ id, at, x, y });

describe("tap.a-double-tap-aims-at-a-point", () => {
  it("первого тапа не было — пары нет", () => {
    expect(doubleTap(null, tap("к1", 0))).toBeNull();
  });

  it("два тапа по одной карте — переворот", () => {
    expect(doubleTap(tap("к1", 0), tap("к1", 100))).toBe("к1");
  });

  it("веер разъехался: второй тап попал по соседней — переворачивается карта ПЕРВОГО тапа", () => {
    expect(doubleTap(tap("к1", 0, 100, 100), tap("к2", 100, 108, 104))).toBe("к1");
  });

  it("палец ушёл дальше порога — это два разных тапа", () => {
    expect(doubleTap(tap("к1", 0, 100, 100), tap("к2", 100, 100 + DOUBLE_TAP_PX, 100))).toBeNull();
  });

  it("опоздал — пары нет, даже по той же карте", () => {
    expect(doubleTap(tap("к1", 0), tap("к1", DOUBLE_TAP_MS))).toBeNull();
  });

  it("та же карта засчитывается и издалека: веер мог увезти её саму", () => {
    expect(doubleTap(tap("к1", 0, 100, 100), tap("к1", 100, 400, 400))).toBe("к1");
  });
});
