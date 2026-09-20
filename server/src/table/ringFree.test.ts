// СВОБОДНЫЙ КРУГ: карта ложится туда, куда её положили.
//
// Закон: место карты — угол, а не номер в ряду. Снеппинг — двенадцать точек часов от севера СТОЛА;
// занятую точку карта не занимает второй раз и не прячет соседку под собой.

import { describe, it, expect } from "vitest";
import { RING_HOUR, RING_HOURS, RING_LAY, ringCardStep, ringHour, ringLanding, ringOffHour, ringTurned } from "./ring.js";

const середина = { x: 0, y: 0 };

describe("ring.free-circle-snaps-to-the-clock", () => {
  it("двенадцать часов по тридцать градусов", () => {
    expect(RING_HOURS).toBe(12);
    expect(RING_HOUR).toBe(30);
  });

  it("угол прилипает к ближайшему часу", () => {
    expect(ringHour(0)).toBe(0);
    expect(ringHour(14)).toBe(0);
    expect(ringHour(16)).toBe(30);
    expect(ringHour(359)).toBe(0);
    expect(ringHour(-16)).toBe(330);
  });

  it("половина шага — граница прилипания", () => {
    expect(ringOffHour(0)).toBe(0);
    expect(ringOffHour(15)).toBeCloseTo(15, 6);
    expect(ringOffHour(31)).toBeCloseTo(1, 6);
  });

  it("на этом радиусе двенадцать карт встают впритык и не налезают", () => {
    // Хорда между соседними часами должна быть не меньше ширины карты с зазором.
    const хорда = 2 * RING_LAY * Math.sin((RING_HOUR * Math.PI) / 360);
    expect(хорда).toBeGreaterThanOrEqual(1.15);
    // И не настолько больше, чтобы между картами зияла дыра.
    expect(хорда).toBeLessThan(1.6);
  });

  it("карта занимает меньше часа: соседние точки не спорят", () => {
    expect(ringCardStep()).toBeLessThan(RING_HOUR);
  });

  it("свободный угол принимает карту КАК ЕСТЬ: снеппинг — дело прицела, не стола", () => {
    // Снепни стол ещё раз — карту сдвинуло бы с места, которое игрок уже выбрал и увидел.
    expect(ringLanding(14, [])).toBe(14);
    expect(ringLanding(30, [180])).toBe(30);
    expect(ringLanding(-30, [])).toBe(330);
  });

  it("ЗАНЯТЫЙ УГОЛ НЕ ПРИНИМАЕТ ВТОРУЮ: карта встаёт рядом, не поверх", () => {
    const где = ringLanding(2, [0]);
    expect(где, "не легла на занятую").not.toBe(0);
    expect(Math.min(Math.abs(где), 360 - Math.abs(где)), "но встала рядом с ней").toBeLessThan(RING_HOUR * 1.5);
    expect(Math.min(Math.abs(где), 360 - Math.abs(где)), "и не налезла").toBeGreaterThanOrEqual(ringCardStep() - 0.001);
  });

  it("и третья встаёт с другой стороны, а не поверх второй", () => {
    const занято = [0, ringLanding(2, [0])];
    const третья = ringLanding(2, занято);
    for (const one of занято) {
      const away = Math.abs(((третья - one) % 360 + 540) % 360 - 180);
      expect(Math.min(away, 360 - away)).toBeGreaterThanOrEqual(ringCardStep() - 0.001);
    }
  });

  it("место карты считается по её углу и смотрит верхом в середину", () => {
    const север = ringTurned(середина, 0);
    expect(север.x).toBeCloseTo(0, 6);
    expect(север.y).toBeCloseTo(-RING_LAY, 6);
    const восток = ringTurned(середина, 90);
    expect(восток.x).toBeCloseTo(RING_LAY, 6);
    expect(восток.y).toBeCloseTo(0, 6);
  });

  it("карты лежат ВНУТРИ очерченного круга", () => {
    for (let turn = 0; turn < 360; turn += RING_HOUR) {
      const at = ringTurned(середина, turn);
      expect(Math.hypot(at.x, at.y)).toBeLessThanOrEqual(RING_LAY + 0.001);
    }
  });
});
