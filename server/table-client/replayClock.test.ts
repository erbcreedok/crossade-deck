import { describe, expect, it } from "vitest";
import { clockText, playhead, STEP_MS, stepAt } from "./replayClock.js";

// Мгновения записи: плотная пачка, потом минута тишины.
const ats = [0, 100, 150, 1000, 61000, 61050];

describe("replayClock.time", () => {
  it("в реальном времени мгновение встаёт ровно тогда, когда случилось; тишина не поджимается", () => {
    const p = playhead(ats, { step: 0, wall: 5000 }, "time", 1);
    expect(p.step(5099)).toBe(0);
    expect(p.step(5100)).toBe(1);
    expect(p.step(5999)).toBe(2);
    expect(p.step(5000 + 60999), "минута тишины идёт минутой").toBe(3);
    expect(p.step(5000 + 61000)).toBe(4);
    expect(p.recordAt(5000 + 30000), "часы идут и в тишине").toBe(30000);
  });

  it("2× и 4× — то же, быстрее во столько же раз", () => {
    expect(playhead(ats, { step: 0, wall: 0 }, "time", 2).step(500)).toBe(3);
    expect(playhead(ats, { step: 0, wall: 0 }, "time", 4).step(15250)).toBe(4);
  });

  it("отсчёт от шага, с которого нажали: перемотка или смена скорости не тянут за собой прошлое", () => {
    const p = playhead(ats, { step: 3, wall: 0 }, "time", 1);
    expect(p.step(0)).toBe(3);
    expect(p.step(60000)).toBe(4);
  });

  it("часы не уходят дальше конца записи", () => {
    expect(playhead(ats, { step: 0, wall: 0 }, "time", 16).recordAt(1e9)).toBe(61050);
    expect(stepAt(ats, 0, 1e9)).toBe(ats.length - 1);
  });
});

describe("replayClock.step", () => {
  it("пошагово — ровный шаг, как бы далеко ни было следующее мгновение; скорость делит промежуток", () => {
    const p = playhead(ats, { step: 0, wall: 0 }, "step", 1);
    expect([0, STEP_MS - 1, STEP_MS, 3 * STEP_MS].map((w) => p.step(w))).toEqual([0, 0, 1, 3]);
    expect(playhead(ats, { step: 0, wall: 0 }, "step", 4).step(STEP_MS)).toBe(4);
    expect(p.step(1e9)).toBe(ats.length - 1);
  });

  it("время словами", () => {
    expect(clockText(65300)).toBe("1:05.3");
    expect(clockText(0)).toBe("0:00.0");
  });
});
