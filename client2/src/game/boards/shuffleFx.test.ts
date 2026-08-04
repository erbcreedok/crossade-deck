import { describe, expect, it } from "vitest";
import { SHUFFLE_FX_CARDS, shufflePoses } from "./shuffleFx";

describe("shufflePoses", () => {
  it("детерминированы (live: у всех один и тот же «шурух») и ограничены верхом стопки", () => {
    expect(shufflePoses(36)).toEqual(shufflePoses(36));
    expect(shufflePoses(36).length).toBe(SHUFFLE_FX_CARDS);
    expect(shufflePoses(3).length).toBe(3);
  });
  it("веер в обе стороны: соседние позы расходятся по знаку, вверх от стопки", () => {
    const p = shufflePoses(6);
    expect(Math.sign(p[0]!.dx)).toBe(-1);
    expect(Math.sign(p[1]!.dx)).toBe(1);
    for (const pose of p) expect(pose.dy).toBeLessThan(0);
  });
});
