import { describe, it, expect } from "vitest";
import { itemRect, overlapArea, pickDropZone } from "./dropPick";

// Сторож правила владельца: дроп считает ФИГУРА, а не палец. «Визуально фигура уже над зоной —
// отпускаю — а она летит домой» повторяться не должно.

const zone = (x: number, y: number, w = 100, h = 140) => ({ x, y, w, h });

describe("попадание дропа — по нахлёсту фигуры", () => {
  it("частичный заезд фигуры на зону засчитывается, даже когда палец ВНЕ зоны", () => {
    const z = [zone(100, 100)];
    const card = itemRect(80, 170, 50, 70); // карта левым краем заезжает на зону
    expect(overlapArea(z[0]!, card)).toBeGreaterThan(0);
    expect(pickDropZone(z, card, { x: 20, y: 170 })).toBe(0); // палец далеко слева
  });

  it("из двух накрытых зон побеждает больший нахлёст, а не та, где палец", () => {
    const zones = [zone(0, 0), zone(90, 0)]; // соседние
    const card = itemRect(110, 70, 50, 70); // сильнее накрывает правую
    expect(pickDropZone(zones, card, { x: 40, y: 70 })).toBe(1); // палец над левой — не важно
  });

  it("нет ни нахлёста, ни пальца в зоне — цели нет (домой)", () => {
    expect(pickDropZone([zone(500, 500)], itemRect(100, 100, 50, 70), { x: 100, y: 100 })).toBe(-1);
  });

  it("палец в зоне ловит дроп, даже если фигура пружиной отстала и не доехала", () => {
    expect(pickDropZone([zone(300, 300)], itemRect(80, 80, 50, 70), { x: 350, y: 350 })).toBe(0);
  });

  it("равный нахлёст решает палец", () => {
    const zones = [zone(0, 0, 100, 140), zone(100, 0, 100, 140)];
    const card = itemRect(100, 70, 50, 70); // ровно посередине
    expect(pickDropZone(zones, card, { x: 130, y: 70 })).toBe(1);
    expect(pickDropZone(zones, card, { x: 70, y: 70 })).toBe(0);
  });
});
