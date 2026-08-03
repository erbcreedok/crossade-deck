import { describe, it, expect } from "vitest";
import { stackOffsets } from "./slotLayout";

// Геометрия покоя членов ВНУТРИ слота (EC2: «прилёт» = spring в эту позицию). Чистая: смещение
// каждого члена от центра слота. Центрируем стопку, верх (последний) — с макс. сдвигом.
describe("stackOffsets", () => {
  it("один член — по центру", () => {
    expect(stackOffsets(1, 2, -4)).toEqual([{ dx: 0, dy: 0 }]);
  });
  it("пусто — пустой список", () => {
    expect(stackOffsets(0, 2, -4)).toEqual([]);
  });
  it("стопка центрирована; шаг dx/dy по индексу (верх = последний)", () => {
    expect(stackOffsets(3, 2, -4)).toEqual([
      { dx: -2, dy: 4 },
      { dx: 0, dy: 0 },
      { dx: 2, dy: -4 },
    ]);
  });
  it("чётное число — симметрично вокруг центра", () => {
    expect(stackOffsets(2, 10, 0)).toEqual([
      { dx: -5, dy: 0 },
      { dx: 5, dy: 0 },
    ]);
  });
});
