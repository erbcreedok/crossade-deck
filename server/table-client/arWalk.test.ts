// ХОДЬБА В AR — сильнее тянешь, быстрее идёшь; дальше от стула — тяжелее; назад — всегда легко.

import { describe, expect, it } from "vitest";
import { ease, leftToGo, walkStep, WALK } from "./arWalk.js";

const at = (x: number, z: number) => ({ x, z });
const dist = (p: { x: number; z: number }) => Math.hypot(p.x, p.z);
/** Идти вперёд (телефон смотрит в −Z) `s` секунд с натяжкой `pull`, мелкими шагами. */
function walk(from: { x: number; z: number }, pull: number, s: number, dir = { x: 0, y: 1 }) {
  let p = from;
  for (let t = 0; t < s; t += 1 / 60) p = walkStep(p, { x: dir.x * pull, y: dir.y * pull }, 0, 1 / 60);
  return p;
}

describe("ar-walk.pull", () => {
  it("стик в покое — стоишь", () => {
    expect(walkStep(at(0, 0), { x: 0, y: 0 }, 0, 0.1)).toEqual(at(0, 0));
  });
  it("вперёд по взгляду: телефон смотрит в −Z — идёшь в −Z", () => {
    const p = walk(at(0, 0), 0.5, 0.2);
    expect(p.z).toBeLessThan(0);
    expect(Math.abs(p.x)).toBeLessThan(1e-9);
  });
  it("потянул сильнее — ушёл дальше за то же время", () => {
    const soft = dist(walk(at(0, 0), 0.4, 0.3)), hard = dist(walk(at(0, 0), 1.2, 0.3));
    expect(hard).toBeGreaterThan(soft * 3);
  });
  it("перетянуть можно, но не бесконечно", () => {
    expect(dist(walk(at(0, 0), 10, 0.1))).toBeCloseTo(dist(walk(at(0, 0), WALK.PULL_MAX, 0.1)), 9);
  });
});

describe("ar-walk.resistance", () => {
  it("до 0.5 м — свободно, дальше тяжелеет, у предела — ноль", () => {
    expect(ease(0.3)).toBe(1);
    expect(ease(1)).toBeLessThan(1);
    expect(ease(2)).toBeLessThan(ease(1));
    expect(ease(WALK.MAX)).toBe(0);
  });
  it("один и тот же рывок от стула на 2 м даёт меньше, чем у стула", () => {
    const near = dist(walk(at(0, -0.1), 1, 0.2)) - 0.1;
    const far0 = at(0, -2);
    const far = dist(walk(far0, 1, 0.2)) - 2;
    expect(far).toBeLessThan(near * 0.5);
  });
  it("предел достижим за конечное время — не ползёшь к нему вечно", () => {
    expect(dist(walk(at(0, 0), WALK.PULL_MAX, 20))).toBeCloseTo(WALK.MAX, 9);
  });
  it("дальше предела не уйти, сколько ни тяни", () => {
    expect(dist(walk(at(0, 0), WALK.PULL_MAX, 30))).toBeLessThanOrEqual(WALK.MAX + 1e-9);
  });
  it("назад к стулу — без сопротивления", () => {
    const from = at(0, -2.5);
    const back = walk(from, 1, 0.2, { x: 0, y: -1 }); // стик вниз = назад, к стулу
    const moved = dist(from) - dist(back);
    const free = dist(walk(at(0, 0), 1, 0.2));
    expect(moved).toBeCloseTo(free, 6);
  });
});

describe("ar-walk.hint", () => {
  it("подсказки нет, пока не тормозит; дальше — сколько осталось", () => {
    expect(leftToGo(0.4)).toBeNull();
    expect(leftToGo(1)).toBeCloseTo(WALK.MAX - 1, 9);
    expect(leftToGo(WALK.MAX)).toBe(0);
  });
});
