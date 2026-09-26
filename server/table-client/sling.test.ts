import { describe, expect, it } from "vitest";
import { SLING } from "./screenConst.js";
import { slingLanding, slingPull } from "./sling.js";

const at = { x: 200, y: 700 };

describe("sling.the-pull", () => {
  it("потянул вниз дальше порога — натяг; ближе — нет", () => {
    expect(slingPull(at, { x: 200, y: 700 + SLING.start - 1 }, false)).toBeNull();
    expect(slingPull(at, { x: 200, y: 700 + SLING.start + 1 }, false)).not.toBeNull();
  });

  it("вбок по руке — это перестановка, а не рогатка", () => {
    expect(slingPull(at, { x: 200 + 80, y: 700 + 10 }, false)).toBeNull();
    expect(slingPull(at, { x: 200, y: 700 - 80 }, false), "вверх").toBeNull();
  });

  it("натяг держится до меньшего порога: на границе он не дрожит", () => {
    const between = { x: 200, y: 700 + (SLING.start + SLING.cancel) / 2 };
    expect(slingPull(at, between, false), "не натянут — не хватается").toBeNull();
    expect(slingPull(at, between, true), "натянут — не отпускается").not.toBeNull();
    expect(slingPull(at, { x: 200, y: 700 + SLING.cancel - 1 }, true), "вернул выше — отпустил").toBeNull();
  });

  it("сила растёт с оттяжкой до единицы, полёт — против оттяжки", () => {
    const weak = slingPull(at, { x: 200, y: 700 + SLING.start + 1 }, false)!;
    const full = slingPull(at, { x: 200, y: 700 + SLING.max + 50 }, false)!;
    expect(weak.power).toBeLessThan(0.05);
    expect(full.power).toBe(1);
    expect(full.dir.y, "тянул вниз — летит вверх").toBeCloseTo(-1);
    const aside = slingPull(at, { x: 200 - 40, y: 700 + 100 }, false)!;
    expect(aside.dir.x, "тянул влево-вниз — летит вправо-вверх").toBeGreaterThan(0);
  });
});

describe("sling.the-release — передумал", () => {
  // Стрелка и контур — обещание: видны — отпущенная карта улетит, не видны — нет. Правило одно: `slingPull`.
  it("вернул карту к месту — натяг снят, и стрелки нет", () => {
    expect(slingPull(at, { x: 200, y: 700 + SLING.cancel - 1 }, true)).toBeNull();
    expect(slingPull(at, { x: 206, y: 712 }, true), "в пределах пальца от места").toBeNull();
  });
  it("«к месту» — не с точностью до пикселя: хватает вернуть под палец", () => {
    expect(SLING.cancel).toBeGreaterThanOrEqual(20);
    expect(SLING.start - SLING.cancel, "между порогами — только защита от дрожи").toBeLessThanOrEqual(8);
  });
  it("потянул вниз, потом увёл вбок — натяга нет: это перестановка", () => {
    expect(slingPull(at, { x: 200 + 90, y: 700 + 30 }, true)).toBeNull();
  });
});

describe("sling.the-landing", () => {
  // Стол радиуса 5, я сижу внизу (y = +8) и бросаю прямо вверх.
  const from = { x: 0, y: 8 };
  const up = { x: 0, y: 7 };

  it("слабый бросок — у ближней кромки, полный — у дальней, половина — в середине", () => {
    expect(slingLanding(from, up, 5, 0)).toEqual({ x: 0, y: 5 });
    expect(slingLanding(from, up, 5, 1).y).toBeCloseTo(-5);
    expect(slingLanding(from, up, 5, 0.5).y).toBeCloseTo(0);
  });

  it("мимо стола карта не улетает: ложится на сукно у кромки", () => {
    const miss = slingLanding(from, { x: 3, y: 8 }, 5, 1);
    expect(Math.hypot(miss.x, miss.y)).toBeLessThanOrEqual(5 + 1e-9);
  });

  it("куда бы ни бросили и с какой силой — всегда на столе", () => {
    for (let a = 0; a < 360; a += 15) {
      const t = (a * Math.PI) / 180;
      for (const power of [0, 0.3, 0.7, 1]) {
        const p = slingLanding(from, { x: Math.sin(t), y: 8 - Math.cos(t) }, 5, power);
        expect(Math.hypot(p.x, p.y), `${a}° × ${power}`).toBeLessThanOrEqual(5 + 1e-9);
      }
    }
  });
});
