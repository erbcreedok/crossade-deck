import { describe, it, expect } from "vitest";
import { burnFrame, BURN_FREEZE, BURN_DUR, BURN_WAVE } from "./burn";
import { TEX_H } from "../engine/constants";

const AGE = 1.0;
const W = 100;

describe("burnFrame", () => {
  it("старт замирания: без расхода, дрожь нулевая (q=0)", () => {
    const f = burnFrame(0, AGE, W);
    expect(f.dissolve).toBeNull();
    expect(f.jitterX).toBeCloseTo(0, 6);
    expect(f.jitterY).toBeCloseTo(0, 6);
  });

  it("конец замирания: дрожь на полную (q≈1)", () => {
    const f = burnFrame(BURN_FREEZE * 0.999, AGE, W);
    expect(f.dissolve).toBeNull();
    expect(Math.abs(f.jitterX)).toBeGreaterThan(0);
  });

  it("начало расхода: p≈0, маска — полигон из 26 чисел", () => {
    const f = burnFrame(BURN_FREEZE, AGE, W);
    expect(f.dissolve).not.toBeNull();
    expect(f.dissolve!.p).toBeCloseTo(0, 6);
    // 4 (верхняя кромка) + (seg+1)*2 = 4 + 22 = 26
    expect(f.dissolve!.maskPoints).toHaveLength(26);
  });

  it("p растёт со временем, тень съёживается", () => {
    const a = burnFrame(BURN_FREEZE + 0.1, AGE, W).dissolve!;
    const b = burnFrame(BURN_FREEZE + 0.3, AGE, W).dissolve!;
    expect(b.p).toBeGreaterThan(a.p);
    expect(b.shadowShrink!).toBeLessThan(a.shadowShrink!); // 1-p падает
  });

  it("к концу расхода тень убирается (shadowShrink=null)", () => {
    const f = burnFrame(BURN_DUR, AGE, W);
    expect(f.dissolve!.p).toBeCloseTo(1, 6);
    expect(f.dissolve!.shadowShrink).toBeNull();
  });
});

// ——— догорание до конца ———
//
// Баг 2026-08-02: карта не догорала — сверху оставалась зубчатая полоска. Фронт при p=1 вставал
// РОВНО на верхнюю кромку, но он волнистый, и там, где синус положителен, оказывался ниже неё.
// «На глаз» такое чинится и так же незаметно ломается обратно при смене амплитуды, поэтому тест.
describe("burnFrame — карта догорает полностью", () => {
  // Точки фронта идут после 4 чисел верхней кромки; берём каждую вторую (это y).
  const frontYs = (pts: number[]) => pts.slice(4).filter((_, i) => i % 2 === 1);
  const TOP = -TEX_H / 2;

  it("при p=1 ни одна точка фронта не остаётся НИЖЕ верхней кромки", () => {
    for (const age of [0, 0.3, 1.0, 2.7, 5.5]) {
      const ys = frontYs(burnFrame(BURN_DUR, age, W).dissolve!.maskPoints);
      expect(Math.max(...ys), `фаза age=${age} оставила огрызок`).toBeLessThanOrEqual(TOP);
    }
  });

  it("перелёт не «съедает» карту раньше времени: в начале расхода фронт ещё у нижней кромки", () => {
    const ys = frontYs(burnFrame(BURN_FREEZE, AGE, W).dissolve!.maskPoints);
    expect(Math.max(...ys)).toBeGreaterThan(TEX_H / 2 - TEX_H * BURN_WAVE * 2);
  });

  it("фронт монотонно едет вверх", () => {
    const mid = (t: number) => Math.max(...frontYs(burnFrame(t, AGE, W).dissolve!.maskPoints));
    expect(mid(BURN_FREEZE + 0.3)).toBeLessThan(mid(BURN_FREEZE + 0.1));
  });
});
