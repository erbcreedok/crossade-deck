import { describe, it, expect } from "vitest";
import { burnFrame, BURN_FREEZE, BURN_DUR } from "./burn";

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
