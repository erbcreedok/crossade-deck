import { describe, it, expect } from "vitest";
import { wrapRow, wrapFlow } from "./sandboxWrap";

describe("wrapRow", () => {
  it("всё влезает в одну строку — последовательные x, одна строка", () => {
    const { items, totalH } = wrapRow([50, 50, 50], 200, 30, 10);
    expect(items.map((i) => i.row)).toEqual([0, 0, 0]);
    expect(items.map((i) => i.x)).toEqual([0, 50, 100]);
    expect(items.map((i) => i.y)).toEqual([0, 0, 0]);
    expect(totalH).toBe(30);
  });

  it("переносит по границе — следующий айтем не влезает, уходит на новую строку", () => {
    // 170 вмещает два по 80 (160), но не три (240) — третий переносится.
    const { items, totalH } = wrapRow([80, 80, 80], 170, 30, 10);
    expect(items.map((i) => i.row)).toEqual([0, 0, 1]);
    expect(items[2]!.x).toBe(0); // новая строка начинается с нуля
    expect(items[2]!.y).toBe(30 + 10); // itemH + rowGap
    expect(totalH).toBe(30 * 2 + 10);
  });

  it("totalH считается по числу строк: rows*itemH + (rows-1)*rowGap", () => {
    const { items, totalH } = wrapRow([100, 100, 100, 100], 250, 20, 5);
    const rows = Math.max(...items.map((i) => i.row)) + 1;
    expect(totalH).toBe(rows * 20 + (rows - 1) * 5);
  });

  it("пустой список — ничего не падает, totalH = 0", () => {
    const { items, totalH } = wrapRow([], 200, 30, 10);
    expect(items).toEqual([]);
    expect(totalH).toBe(0);
  });

  it("один айтем — одна строка", () => {
    const { items, totalH } = wrapRow([60], 200, 30, 10);
    expect(items).toEqual([{ x: 0, y: 0, row: 0 }]);
    expect(totalH).toBe(30);
  });

  it("айтем шире maxWidth — всё равно кладём на своей строке, не зацикливаемся", () => {
    const { items, totalH } = wrapRow([300, 50], 200, 30, 10);
    expect(items[0]).toEqual({ x: 0, y: 0, row: 0 }); // слишком широкий, но не пропущен
    expect(items[1]!.row).toBe(1); // следующий не пытается втиснуться рядом
    expect(totalH).toBe(30 * 2 + 10);
  });
});

describe("wrapFlow", () => {
  it("всё влезает в одну строку — высота строки не участвует, пока одна строка", () => {
    const { slots, totalH } = wrapFlow(
      [
        { w: 50, h: 30 },
        { w: 50, h: 60 },
        { w: 50, h: 20 },
      ],
      200,
      10,
    );
    expect(slots.map((s) => s.row)).toEqual([0, 0, 0]);
    expect(slots.map((s) => s.x)).toEqual([0, 60, 120]); // x += w + gap
    expect(slots.map((s) => s.y)).toEqual([0, 0, 0]);
    expect(totalH).toBe(60); // максимум высоты в единственной строке
  });

  it("высота строки = максимум по высоте айтемов в НЕЙ, следующая строка ниже на эту высоту", () => {
    const { slots, totalH } = wrapFlow(
      [
        { w: 100, h: 50 }, // строка 0, одна — вторая такая же не влезет (100+10+100>150)
        { w: 100, h: 80 }, // переполняет maxWidth=150 вместе с первой → новая строка
        { w: 30, h: 20 }, // влезает РЯДОМ со второй в той же строке (110+30<=150)
      ],
      150,
      10,
    );
    expect(slots[0]!.row).toBe(0);
    expect(slots[1]!.row).toBe(1);
    expect(slots[2]!.row).toBe(1);
    expect(slots[1]!.y).toBe(50 + 10); // высота первой строки (50) + gap
    expect(totalH).toBe(50 + 10 + 80); // строка0(50) + gap + строка1(максимум 80)
  });

  it("пустой список — ничего не падает", () => {
    const { slots, totalH } = wrapFlow([], 200, 10);
    expect(slots).toEqual([]);
    expect(totalH).toBe(0);
  });

  it("один айтем шире maxWidth — на своей строке, без зацикливания", () => {
    const { slots, totalH } = wrapFlow(
      [
        { w: 300, h: 40 },
        { w: 50, h: 20 },
      ],
      200,
      10,
    );
    expect(slots[0]!.row).toBe(0);
    expect(slots[1]!.row).toBe(1);
    expect(totalH).toBe(40 + 10 + 20);
  });
});
