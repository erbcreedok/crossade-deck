import { describe, expect, it } from "vitest";
import { blendOf, handBoxOf, handPlan, handPlanBlend, hudUnitOf, mineGeomOf, snapPose } from "./handGeom.js";
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

describe("hand.pose-handle — поза под пальцем", () => {
  const TUCKED = { fan: true, shrink: false, tuck: true };
  const SHRUNK = { fan: true, shrink: true, tuck: false };
  const eq = (a: { x: number; y: number; angle: number }[], b: { x: number; y: number; angle: number }[]) => {
    expect(a).toHaveLength(b.length);
    a.forEach((s, i) => { expect(s.x).toBeCloseTo(b[i]!.x, 9); expect(s.y).toBeCloseTo(b[i]!.y, 9); expect(s.angle).toBeCloseTo(b[i]!.angle, 9); });
  };

  it("каждая ступень — там же, где кнопочная поза: веер, ряд, стопка, спрятана", () => {
    for (const pose of [FAN, ROW, SHRUNK, TUCKED]) {
      const back = snapPose(blendOf(pose), pose);
      expect(back, JSON.stringify(pose)).toEqual(pose);
    }
  });

  it("на ступенях карты стоят ровно как у кнопочной позы", () => {
    for (const pose of [FAN, ROW, SHRUNK]) eq(handPlanBlend(blendOf(pose), pose.fan, 6, 1, 1.4, 5), handPlan(pose, 6, 1, 1.4, 5));
  });

  it("между ступенями — плавно: половина пути от ряда к вееру — середина между ними", () => {
    const fan = handPlan(FAN, 6, 1, 1.4, 5), row = handPlan(ROW, 6, 1, 1.4, 5);
    const half = handPlanBlend({ wide: 1, lift: 0.75 }, true, 6, 1, 1.4, 5);
    half.forEach((s, i) => { expect(s.x).toBeCloseTo((fan[i]!.x + row[i]!.x) / 2, 9); expect(s.angle).toBeCloseTo((fan[i]!.angle + row[i]!.angle) / 2, 9); });
  });

  it("отпустил — садится в ближайшую ступень; у узкой руки веера нет", () => {
    expect(snapPose({ wide: 0.8, lift: 0.4 }, FAN)).toEqual(FAN);
    expect(snapPose({ wide: 0.8, lift: 0.9 }, FAN)).toEqual(ROW);
    expect(snapPose({ wide: 0.8, lift: 0.1 }, FAN)).toEqual({ ...FAN, tuck: true });
    expect(snapPose({ wide: 0.2, lift: 0.5 }, FAN)).toEqual(SHRUNK); // узкая: середина уходит в «показана»
    expect(snapPose({ wide: 0.2, lift: 0.3 }, FAN)).toEqual({ ...SHRUNK, tuck: true });
  });

  it("опускаешь — рука плавно уходит вниз до спрятанной", () => {
    const shown = handBoxOf(PHONE, FAN, 6);
    const tucked = handBoxOf(PHONE, TUCKED, 6);
    const half = handBoxOf(PHONE, FAN, 6, { wide: 1, lift: 0.25 });
    expect(half.mid).toBeGreaterThan(shown.mid);
    expect(half.mid).toBeLessThan(tucked.mid);
    expect(handBoxOf(PHONE, FAN, 6, { wide: 1, lift: 0 }).mid).toBeCloseTo(tucked.mid, 6);
  });
});
