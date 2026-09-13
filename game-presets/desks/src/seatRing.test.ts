// СТОРОЖ `desks.a-new-chair-goes-where-the-pizza-is-cut`.
//
// Новый стул встаёт не «следующим по счёту», а в первую свободную точку разрезания: своя сторона,
// напротив, слева, справа, потом углы. Освободившееся место снова первое в очереди — человек,
// пересевший с трёх часов, отдаёт три часа следующему, а не отодвигает всех на одного.

import { describe, it, expect } from "vitest";
import { freeRingSpot, ringOrder, ringSpot } from "./seatRing.js";

const R = 10;
const APART = 4;
const at = (angle: number) => ringSpot(angle, R).at;

describe("desks.a-new-chair-goes-where-the-pizza-is-cut", () => {
  it("порядок разрезания: свой край, напротив, слева, справа, потом углы", () => {
    expect(ringOrder(3).slice(0, 8)).toEqual([0, 180, 270, 90, 315, 135, 45, 225]);
  });

  it("за пустой стол первый садится на свой край", () => {
    expect(freeRingSpot({ taken: [], radius: R, apart: APART }).facing).toBe(0);
  });

  it("второй — напротив, третий — слева, четвёртый — справа", () => {
    expect(freeRingSpot({ taken: [at(0)], radius: R, apart: APART }).facing).toBe(180);
    expect(freeRingSpot({ taken: [at(0), at(180)], radius: R, apart: APART }).facing).toBe(270);
    expect(freeRingSpot({ taken: [at(0), at(180), at(270)], radius: R, apart: APART }).facing).toBe(90);
    expect(freeRingSpot({ taken: [at(0), at(180), at(270), at(90)], radius: R, apart: APART }).facing).toBe(315);
  });

  it("место определяется занятостью, а не счётом: освободивший три часа отдаёт их следующему", () => {
    // Четверо сидели по сторонам, один пересел с трёх часов вниз-вправо и освободил их.
    const moved = { x: at(45).x, y: at(45).y };
    const taken = [at(0), at(180), at(270), moved];
    expect(freeRingSpot({ taken, radius: R, apart: APART }).facing).toBe(90);
  });

  it("сдвинулся недалеко — место всё равно занято, и туда никого не сажают", () => {
    // Человек с трёх часов подвинулся на полшага: формально точка ничья, а стул там стоит.
    const nudged = { x: at(90).x + 1, y: at(90).y + 1 };
    const spot = freeRingSpot({ taken: [at(0), at(180), at(270), nudged], radius: R, apart: APART });
    expect(spot.facing).not.toBe(90);
    expect(spot.facing).toBe(315);
  });

  it("мест не осталось — стул встаёт там, где мешает меньше всего, а не поверх соседа", () => {
    const crowd = ringOrder(3).map((angle) => at(angle));
    const spot = freeRingSpot({ taken: crowd, radius: R, apart: APART, levels: 3 });
    const nearest = Math.min(...crowd.map((one) => Math.hypot(one.x - spot.at.x, one.y - spot.at.y)));
    expect(nearest).toBeGreaterThan(0);
  });
});
