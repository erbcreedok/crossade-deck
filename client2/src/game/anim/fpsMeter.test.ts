import { describe, expect, it } from "vitest";
import { FpsMeter } from "./fpsMeter";

const feed = (m: FpsMeter, ms: number, n: number) => {
  for (let k = 0; k < n; k++) m.sample(ms);
};

describe("FpsMeter", () => {
  it("null пока данных меньше minSamples", () => {
    const m = new FpsMeter(60, 20);
    feed(m, 16.67, 19);
    expect(m.fps()).toBeNull();
    m.sample(16.67);
    expect(m.fps()).not.toBeNull();
  });

  it("16.67мс/кадр ≈ 60fps", () => {
    const m = new FpsMeter(60, 20);
    feed(m, 1000 / 60, 30);
    expect(m.fps()).toBeCloseTo(60, 1);
  });

  it("33.3мс/кадр ≈ 30fps", () => {
    const m = new FpsMeter(60, 20);
    feed(m, 1000 / 30, 30);
    expect(m.fps()).toBeCloseTo(30, 1);
  });

  it("окно вытесняет старые кадры — среднее сходится к свежим", () => {
    const m = new FpsMeter(20, 5);
    feed(m, 1000 / 30, 20); // заполнили медленными
    feed(m, 1000 / 60, 20); // полностью заместили быстрыми
    expect(m.fps()).toBeCloseTo(60, 1);
  });

  it("нулевой/отрицательный разрыв игнорируется", () => {
    const m = new FpsMeter(60, 3);
    m.sample(0);
    m.sample(-5);
    feed(m, 1000 / 60, 3);
    expect(m.fps()).toBeCloseTo(60, 1);
  });

  it("reset очищает буфер", () => {
    const m = new FpsMeter(60, 5);
    feed(m, 16, 10);
    m.reset();
    expect(m.fps()).toBeNull();
  });
});
