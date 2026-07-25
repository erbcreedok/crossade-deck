import { describe, it, expect } from "vitest";
import { scaleForState, shadowSilhouette } from "./plane";
import { DRAG_SCALE, FLOAT_SCALE } from "../engine/constants";

describe("plane.scaleForState", () => {
  it("план → масштаб", () => {
    expect(scaleForState("idle")).toBe(1);
    expect(scaleForState("fan")).toBe(1);
    expect(scaleForState("floating")).toBe(FLOAT_SCALE);
    expect(scaleForState("held")).toBe(DRAG_SCALE);
    expect(scaleForState("drag")).toBe(DRAG_SCALE);
  });
});

describe("plane.shadowSilhouette", () => {
  const rest = { px: 100, py: 200, shakeX: 0, bobY: 0, bobLift: 0, rotation: 0, scaleVal: 1, scaleFactor: 1 };

  it("в покое: тень прижата (малое смещение), размер ~1.06×", () => {
    const s = shadowSilhouette(rest);
    // elev=0 → x = px - chpx*0.03, y = py + chpx*0.04 (chpx = TEX_H*1)
    expect(s.x).toBeLessThan(rest.px); // чуть влево
    expect(s.y).toBeGreaterThan(rest.py); // чуть вниз
    expect(s.hw).toBeGreaterThan(0);
    expect(s.rot).toBe(0);
  });

  it("подъём: тень уходит дальше вниз и растёт", () => {
    const lifted = shadowSilhouette({ ...rest, scaleVal: 1.45 }); // драг
    const base = shadowSilhouette(rest);
    expect(lifted.y - rest.py).toBeGreaterThan(base.y - rest.py); // дальше вниз
    expect(Math.abs(lifted.x - rest.px)).toBeGreaterThan(Math.abs(base.x - rest.px)); // дальше влево
    expect(lifted.hw).toBeGreaterThan(base.hw); // крупнее
  });

  it("вниз сильнее, чем вбок (перспектива)", () => {
    const base = shadowSilhouette(rest);
    const lifted = shadowSilhouette({ ...rest, scaleVal: 1.45 });
    const dDown = lifted.y - base.y;
    const dSide = Math.abs(lifted.x - base.x);
    expect(dDown).toBeGreaterThan(dSide);
  });

  it("shakeX и rotation пробрасываются", () => {
    const s = shadowSilhouette({ ...rest, shakeX: 7, rotation: 0.2 });
    expect(s.x).toBeCloseTo(shadowSilhouette(rest).x + 7, 6);
    expect(s.rot).toBe(0.2);
  });
});
