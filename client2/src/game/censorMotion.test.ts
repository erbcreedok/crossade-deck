import { describe, expect, it } from "vitest";
import { CENSOR_PRESETS, rowShearOffset, type CensorSpec } from "./censorMotion";

// «Тряска рядов» (issue #6): intensity/speed должны быть настраиваемыми параметрами spec,
// а не зашитыми константами — и дефолт обязан совпадать с поведением ДО этой правки
// (spec.intensity=1 не меняет motion+bias, spec.speedPxSec как раньше).

const BASE: CensorSpec = { kind: "row-shear", block: 8, speedPxSec: 42, flipEverySec: 0.3, rowBias: 0.381966, swapsPerSec: 0, jitterAmp: 0, jitterFreq: 0, shearMix: 1, intensity: 1 };

describe("rowShearOffset — intensity/speed настраиваемы", () => {
  it("guard: intensity=1 (дефолт) даёт тот же результат, что старая формула motion+bias", () => {
    const row = 3;
    const t = 1.234;
    const dir = row % 2 === 0 ? 1 : -1;
    // старая формула (до появления intensity), скопирована для guard-сравнения
    const P = BASE.flipEverySec;
    const k = Math.floor(t / P);
    const frac = t - k * P;
    const completeSum = k % 2 === 0 ? 0 : P;
    const signK = k % 2 === 0 ? 1 : -1;
    const shearSignedTime = completeSum + signK * frac;
    const motion = dir * BASE.speedPxSec * shearSignedTime;
    const bias = row * BASE.rowBias * BASE.block;
    expect(rowShearOffset(BASE, row, t)).toBeCloseTo(motion + bias, 10);
  });

  it("intensity масштабирует амплитуду сдвига линейно (0 → неподвижно, 2x → вдвое дальше)", () => {
    const row = 1;
    const t = 0.7;
    const off1 = rowShearOffset({ ...BASE, intensity: 1 }, row, t);
    const off2 = rowShearOffset({ ...BASE, intensity: 2 }, row, t);
    const off0 = rowShearOffset({ ...BASE, intensity: 0 }, row, t);
    expect(off2).toBeCloseTo(off1 * 2, 10);
    expect(off0).toBeCloseTo(0, 10);
  });

  it("speedPxSec (скорость) — настраиваемое поле spec, а не константа: разный speedPxSec даёт разный offset при том же t", () => {
    const row = 1;
    const t = 0.5;
    const slow = rowShearOffset({ ...BASE, speedPxSec: 10 }, row, t);
    const fast = rowShearOffset({ ...BASE, speedPxSec: 100 }, row, t);
    expect(slow).not.toBeCloseTo(fast, 5);
  });

  it("guard: все пресеты содержат intensity=1 по умолчанию (визуал не меняется)", () => {
    for (const spec of Object.values(CENSOR_PRESETS)) {
      expect(spec.intensity).toBe(1);
    }
  });
});
