import { describe, it, expect } from "vitest";
import { gridSlots, ringSlots } from "./slots";

// Стратегии раскладки дают ЕДИНЫЙ результат — список позиционированных слотов {key,rect,center}.
// BoardZone их лишь потребляет, не зная grid/ring/points. Чистая геометрия.
describe("gridSlots", () => {
  it("rows×cols слотов с ключами r,c и центрами", () => {
    const s = gridSlots({ cols: 2, cell: { w: 100, h: 100 }, gap: 0, origin: { x: 0, y: 0 } }, 2);
    expect(s.map((x) => x.key)).toEqual(["0,0", "0,1", "1,0", "1,1"]);
    expect(s[0]).toEqual({ key: "0,0", rect: { x: 0, y: 0, w: 100, h: 100 }, center: { x: 50, y: 50 } });
    expect(s[3]!.center).toEqual({ x: 150, y: 150 });
  });
});

describe("ringSlots", () => {
  it("n слотов по кругу; центры на окружности, старт сверху", () => {
    const s = ringSlots(4, { cx: 100, cy: 100, radius: 50, cell: { w: 20, h: 20 } });
    expect(s).toHaveLength(4);
    expect(s.map((x) => x.key)).toEqual(["ring0", "ring1", "ring2", "ring3"]);
    // старт сверху (угол -90°): центр 0 = (100, 50)
    expect(s[0]!.center.x).toBeCloseTo(100, 3);
    expect(s[0]!.center.y).toBeCloseTo(50, 3);
    // четверть круга — справа: (150,100)
    expect(s[1]!.center.x).toBeCloseTo(150, 3);
    expect(s[1]!.center.y).toBeCloseTo(100, 3);
    // rect центрирован на center по размеру cell
    expect(s[0]!.rect).toEqual({ x: 90, y: 40, w: 20, h: 20 });
  });
});
