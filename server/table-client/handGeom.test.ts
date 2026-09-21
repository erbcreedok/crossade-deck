import { describe, expect, it } from "vitest";
import { handBoxOf, handPlan, hudUnitOf, mineGeomOf } from "./handGeom.js";
import { HAND_MAX_PX } from "./screenConst.js";

// РУКА ВНИЗУ ЭКРАНА. Вёрстка выверяется под портрет айфона (390×844), десктоп — вторым.

const PHONE = { w: 390, h: 844 };
const DESKTOP = { w: 1440, h: 900 };
const FAN = { fan: true, shrink: false, tuck: false };
const ROW = { fan: false, shrink: false, tuck: false };

describe("единица HUD", () => {
  it("на айфоне в портрете — четверть ширины; на широком экране не раздувается", () => {
    expect(hudUnitOf(PHONE)).toBe(98);
    expect(hudUnitOf(DESKTOP)).toBeLessThanOrEqual(Math.round(390 * 0.25 * 1.15));
    expect(hudUnitOf({ w: 0, h: 0 })).toBe(1);
  });
});

describe("места карт в руке", () => {
  it("веер симметричен: середина по центру, края зеркальны и наклонены в разные стороны", () => {
    for (const n of [1, 2, 5, 6, 12, 36]) {
      const plan = handPlan(FAN, n, 1, 1.4, 4);
      expect(plan).toHaveLength(n);
      for (let i = 0; i < n; i += 1) {
        const [a, b] = [plan[i]!, plan[n - 1 - i]!];
        expect(a.x, `n=${n} i=${i}`).toBeCloseTo(-b.x);
        expect(a.y).toBeCloseTo(b.y);
        expect(a.angle).toBeCloseTo(-b.angle);
      }
    }
  });

  it("карты идут слева направо и не выходят за полосу — сколько бы их ни было", () => {
    for (const pose of [FAN, ROW]) {
      for (const n of [2, 6, 18, 36]) {
        const room = 4;
        const plan = handPlan(pose, n, 1, 1.4, room);
        for (let i = 1; i < n; i += 1) expect(plan[i]!.x, `n=${n}`).toBeGreaterThanOrEqual(plan[i - 1]!.x);
        expect(Math.abs(plan[0]!.x) + 0.5).toBeLessThanOrEqual(room / 2 + 1e-6);
      }
    }
  });

  it("сжатая рука — все карты стопкой за верхней", () => {
    expect(handPlan({ fan: true, shrink: true, tuck: false }, 7, 1, 1.4, 4)).toEqual(Array.from({ length: 7 }, () => ({ x: 0, y: 0, angle: 0 })));
  });
});

describe("полоса моей руки на стекле", () => {
  it("на айфоне рука стоит по центру, целиком в кадре и над баром", () => {
    for (const n of [1, 6, 20]) {
      const geom = mineGeomOf(PHONE, FAN, n, "c1");
      expect(geom.which).toBe("c1");
      expect(geom.slots).toHaveLength(n);
      const xs = geom.slots.map((slot) => slot.x);
      expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(PHONE.w / 2);
      expect(Math.min(...xs) - geom.w / 2).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs) + geom.w / 2).toBeLessThanOrEqual(PHONE.w);
      expect(geom.barTop).toBeLessThan(PHONE.h);
    }
  });

  it("на широком экране полоса не шире своего контейнера и остаётся по центру", () => {
    const geom = mineGeomOf(DESKTOP, FAN, 20, "c1");
    const xs = geom.slots.map((slot) => slot.x);
    expect(Math.max(...xs) - Math.min(...xs) + geom.w).toBeLessThanOrEqual(HAND_MAX_PX + 1);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(DESKTOP.w / 2);
  });

  it("спрятанная рука торчит меньше раскрытой", () => {
    expect(handBoxOf(PHONE, { ...FAN, tuck: true }, 6).shown).toBeLessThan(handBoxOf(PHONE, FAN, 6).shown);
  });
});
