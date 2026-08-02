import { describe, it, expect } from "vitest";
import { gridSlots, hexSlots, ringSlots } from "./slots";

// РАСКЛАДКА — стратегия, а не свойство доски. Зона потребляет готовый список слотов и про форму
// поля не знает; здесь проверяется, что формы действительно разные и каждая держит своё обещание.

const cell = { w: 40, h: 40 };

describe("раскладки слотов", () => {
  it("сетка: rows×cols клеток, ключи не повторяются", () => {
    const s = gridSlots({ cols: 3, cell, gap: 4, origin: { x: 0, y: 0 } }, 2);
    expect(s).toHaveLength(6);
    expect(new Set(s.map((x) => x.key)).size).toBe(6);
  });

  it("кольцо: все слоты на одном расстоянии от центра — иначе это не круговой ход", () => {
    const s = ringSlots(8, { cx: 100, cy: 100, radius: 60, cell });
    const d = s.map((x) => Math.hypot(x.center.x - 100, x.center.y - 100));
    for (const v of d) expect(v).toBeCloseTo(60, 6);
  });

  it("соты: нечётные ряды сдвинуты на полклетки — на этом и держится «шесть соседей»", () => {
    const s = hexSlots(3, 2, { cell, origin: { x: 0, y: 0 } });
    const row0 = s.filter((x) => x.key.startsWith("0"));
    const row1 = s.filter((x) => x.key.startsWith("1"));
    expect(row0).toHaveLength(3);
    expect(row1).toHaveLength(2); // нечётный ряд короче на один
    expect(row1[0]!.rect.x - row0[0]!.rect.x).toBeCloseTo(cell.w / 2, 6);
  });

  it("соты: ряды заходят друг под друга — шаг по вертикали меньше высоты клетки", () => {
    const s = hexSlots(2, 2, { cell, origin: { x: 0, y: 0 } });
    const dy = s.find((x) => x.key.startsWith("1"))!.rect.y - s[0]!.rect.y;
    expect(dy).toBeLessThan(cell.h);
    expect(dy).toBeCloseTo(cell.h * 0.75, 6);
  });
});
