import { describe, expect, it } from "vitest";
import { autoReduce, motionMs, readMotion } from "./motion.js";

describe("анимации у зрителя", () => {
  it("скорость делит длительность, «меньше анимаций» — ноль", () => {
    expect(motionMs(260, 1, false)).toBe(260);
    expect(motionMs(260, 2, false)).toBe(130);
    expect(motionMs(260, 4, false)).toBe(65);
    expect(motionMs(260, 4, true)).toBe(0);
  });

  it("из хранилища — только известные скорости; «меньше анимаций» не выбрано — null", () => {
    expect(readMotion({ speed: 2, reduce: true })).toEqual({ speed: 2, reduce: true });
    expect(readMotion({ speed: 3, reduce: "yes" })).toEqual({ speed: 1, reduce: null });
    expect(readMotion(null)).toEqual({ speed: 1, reduce: null });
  });

  it("само включается: энергосбережение (30 кадров), слабый Android, система просит меньше движения", () => {
    expect(autoReduce({ fps: 30 })).toBe(true);
    expect(autoReduce({ fps: 60 })).toBe(false);
    expect(autoReduce({ fps: 120, prefersReduced: true })).toBe(true);
    expect(autoReduce({ fps: 60, userAgent: "Telegram-Android/11.2.1 (Samsung SM-A105F; Android 11; SDK 30; LOW)" })).toBe(true);
    expect(autoReduce({ fps: 60, userAgent: "Telegram-Android/11.2.1 (Google Pixel 8; Android 15; SDK 35; HIGH)" })).toBe(false);
    expect(autoReduce({})).toBe(false);
  });
});
