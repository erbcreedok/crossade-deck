// AR-ЛИНЗА — стол стоит в мире, телефон вокруг него вертится, палец попадает туда же, куда легла кисть.

import { describe, expect, it } from "vitest";
import { arLens, deviceQuat, placeAtGaze, type Quat } from "./arLens.js";

const frame = { w: 390, h: 844 };
const FOV = 62;
const UNIT = 0.03;
/** Телефон в руке: смотрит вперёд и вниз на `beta`, повёрнут по компасу на `alpha`. */
const held = (alpha: number, beta: number): Quat => deviceQuat(alpha, beta, 0, 0);

describe("ar-lens.stands-in-the-world", () => {
  it("стол ставится туда, куда смотришь: его середина — в середине экрана", () => {
    const q = held(0, 50);
    const l = arLens({ q, fov: FOV }, placeAtGaze(q, 0.35, 0.45, UNIT), 0, 1, frame);
    const c = l.toGlass({ x: 0, y: 0 });
    expect(c.x).toBeCloseTo(frame.w / 2, 6);
    expect(c.y).toBeCloseTo(frame.h / 2, 6);
  });

  it("повернул телефон влево — стол уехал вправо и остался на месте в мире", () => {
    const q = held(0, 50);
    const place = placeAtGaze(q, 0.35, 0.45, UNIT);
    const before = arLens({ q, fov: FOV }, place, 0, 1, frame).toGlass({ x: 0, y: 0 });
    const after = arLens({ q: held(15, 50), fov: FOV }, place, 0, 1, frame).toGlass({ x: 0, y: 0 });
    expect(after.x).toBeGreaterThan(before.x + 50);
  });

  it("дальний край стола уже ближнего — перспектива, а не сжатие", () => {
    const q = held(0, 50);
    const l = arLens({ q, fov: FOV }, placeAtGaze(q, 0.35, 0.45, UNIT), 0, 1, frame);
    const far = l.toGlass({ x: 5, y: -5 }).x - l.toGlass({ x: -5, y: -5 }).x;
    const nearEdge = l.toGlass({ x: 5, y: 5 }).x - l.toGlass({ x: -5, y: 5 }).x;
    expect(far).toBeLessThan(nearEdge * 0.9);
    expect(l.kAt({ x: 0, y: -5 })).toBeLessThan(l.kAt({ x: 0, y: 5 }));
  });

  it("палец попадает туда же, куда легла кисть: toDesk(toGlass(p)) = p", () => {
    const q = held(20, 40);
    const l = arLens({ q, fov: FOV }, placeAtGaze(q, 0.35, 0.45, UNIT), 37, 1.3, frame);
    for (const p of [{ x: 0, y: 0 }, { x: 4, y: -3 }, { x: -6, y: 5 }]) {
      const back = l.toDesk(l.toGlass(p));
      expect(back.x).toBeCloseTo(p.x, 6);
      expect(back.y).toBeCloseTo(p.y, 6);
    }
  });
});

describe("ar-lens.speaks-the-camera's-language", () => {
  it("сверху стол повёрнут ровно на `turn`, как у пальцевой камеры, и не сжат", () => {
    const q = held(0, 0); // экраном вверх, камерой вниз
    const l = arLens({ q, fov: FOV }, placeAtGaze(q, 0.35, 0.45, UNIT), 30, 1, frame);
    expect(l.rotation).toBeCloseTo(30, 4);
    expect(l.squash).toBeCloseTo(1, 4);
    expect(l.rise).toBeCloseTo(0, 4);
  });

  it("положенный телефон — сжатие и высота стопок растут", () => {
    const q = held(0, 45);
    const l = arLens({ q, fov: FOV }, placeAtGaze(q, 0.35, 0.45, UNIT), 0, 1, frame);
    expect(l.squash).toBeLessThan(0.9);
    expect(l.rise).toBeGreaterThan(0.5);
  });

  it("щипок растит стол: зум 2 — единица вдвое крупнее", () => {
    const q = held(0, 50);
    const place = placeAtGaze(q, 0.35, 0.45, UNIT);
    const k1 = arLens({ q, fov: FOV }, place, 0, 1, frame).k;
    const k2 = arLens({ q, fov: FOV }, place, 0, 2, frame).k;
    expect(k2 / k1).toBeCloseTo(2, 2); // разность конечная (шаг 0.05 единицы) — не ровно 2
  });

  it("то, что за спиной, не проецируется (для сетки пола)", () => {
    const q = held(0, 50);
    const l = arLens({ q, fov: FOV }, placeAtGaze(q, 0.35, 0.45, UNIT), 0, 1, frame);
    expect(l.project({ x: 0, y: 200 })).toBeNull(); // далеко «ко мне» — за спиной
    expect(l.project({ x: 0, y: 0 })).not.toBeNull();
  });
});

describe("ar-lens.gaze", () => {
  it("смотрит в горизонт — стол встаёт на `ahead` вперёд, а не в бесконечность", () => {
    const p = placeAtGaze(held(0, 90), 0.35, 0.45, UNIT);
    expect(Math.hypot(p.at[0], p.at[2])).toBeCloseTo(0.45, 6);
    expect(p.at[1]).toBeCloseTo(-0.35, 6);
  });
});
