import { describe, expect, it } from "vitest";
import { computeSlotCardLayout } from "./ui";
import { calculateFanPositions, type SlotGeometry } from "../board/solitaireLayout";

// Тесты чистого хелпера computeSlotCardLayout (issue #95). Pixi-функции (mountSolitaireBoard,
// updateBoardVisuals, issue #96) юнит-тестами не покрываем — они не исполняются в node/vitest,
// проверяются tsc+build+ручным смоук-тестом (см. DoD в спеке).

describe("computeSlotCardLayout", () => {
  it("stack: смещение растёт линейно от cardOffset", () => {
    const geom: SlotGeometry = { x: 0, y: 0, w: 10, h: 10, layout: "stack", cardOffset: { x: 2, y: 2 } };
    expect(computeSlotCardLayout(geom, 3)).toEqual([
      { x: 0, y: 0, rotation: 0 },
      { x: 2, y: 2, rotation: 0 },
      { x: 4, y: 4, rotation: 0 },
    ]);
  });

  it("single: все карты в {0,0,0} — видна только верхняя", () => {
    const geom: SlotGeometry = { x: 0, y: 0, w: 10, h: 10, layout: "single" };
    expect(computeSlotCardLayout(geom, 4)).toEqual([
      { x: 0, y: 0, rotation: 0 },
      { x: 0, y: 0, rotation: 0 },
      { x: 0, y: 0, rotation: 0 },
      { x: 0, y: 0, rotation: 0 },
    ]);
  });

  it("fan: делегирует calculateFanPositions(0,0,count,geom)", () => {
    const geom: SlotGeometry = {
      x: 0,
      y: 0,
      w: 10,
      h: 100,
      layout: "fan",
      fanRadius: 20,
      fanStartAngle: Math.PI * 1.5,
      fanSpreadAngle: Math.PI / 3,
    };
    expect(computeSlotCardLayout(geom, 5)).toEqual(calculateFanPositions(0, 0, 5, geom));
    expect(computeSlotCardLayout(geom, 5)).toHaveLength(5);
  });

  it("count === 0 → пустой массив для любой раскладки", () => {
    const stack: SlotGeometry = { x: 0, y: 0, w: 10, h: 10, layout: "stack" };
    const single: SlotGeometry = { x: 0, y: 0, w: 10, h: 10, layout: "single" };
    const fan: SlotGeometry = { x: 0, y: 0, w: 10, h: 10, layout: "fan", fanRadius: 5, fanStartAngle: 0, fanSpreadAngle: 1 };
    expect(computeSlotCardLayout(stack, 0)).toEqual([]);
    expect(computeSlotCardLayout(single, 0)).toEqual([]);
    expect(computeSlotCardLayout(fan, 0)).toEqual([]);
  });

  it("stack: cardOffset по умолчанию {2,2}, если не задан", () => {
    const geom: SlotGeometry = { x: 0, y: 0, w: 10, h: 10, layout: "stack" };
    expect(computeSlotCardLayout(geom, 2)).toEqual([
      { x: 0, y: 0, rotation: 0 },
      { x: 2, y: 2, rotation: 0 },
    ]);
  });
});
