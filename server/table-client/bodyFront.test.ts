import { describe, expect, it } from "vitest";
import { nearerThanTable } from "./bodyView.js";

describe("тело перед столом или за ним", () => {
  const top = { x: 0, y: 0, h: 1 };
  // Наклонил камеру к своей стороне (+y — к зрителю): глаз смотрит на стол с ближнего края.
  const tilted = { x: 0, y: 0.6, h: 0.8 };

  it("камера сверху — все за столом", () => {
    for (const seat of [{ x: 0, y: 12 }, { x: 12, y: 0 }, { x: 0, y: -12 }]) expect(nearerThanTable(top, seat)).toBe(false);
  });

  it("наклонил камеру — ближние места перед столом, дальние и боковые — за ним", () => {
    expect(nearerThanTable(tilted, { x: 0, y: 12 })).toBe(true);
    expect(nearerThanTable(tilted, { x: -9, y: 8 }), "сбоку, но ближе середины").toBe(true);
    expect(nearerThanTable(tilted, { x: 12, y: 0 }), "ровно сбоку").toBe(false);
    expect(nearerThanTable(tilted, { x: 0, y: -12 })).toBe(false);
  });
});
