import { describe, expect, it } from "vitest";
import { ShakeTracker } from "./shake.js";
import { shakeKnobs } from "./contract.js";

const k = shakeKnobs(undefined);
/** Взмахи вправо-влево на `amp` пикселей каждые `dt` мс; вернуть, на каком по счёту сработало (0 — не сработало). */
const wave = (t: ShakeTracker, from: number, n: number, amp: number, dt: number, start = 100): number => {
  let x = start;
  t.feed(x, 50, from, k);
  for (let i = 1; i <= n; i++) { x += i % 2 ? amp : -amp; if (t.feed(x, 50, from + i * dt, k)) return i; }
  return 0;
};

describe("тряска пальцем", () => {
  it("первая тряска — по порогу: меньше взмахов или короче размах не считается", () => {
    expect(wave(new ShakeTracker(), 0, 3, 80, 60)).toBe(0);
    expect(wave(new ShakeTracker(), 0, 12, 20, 60)).toBe(0);
    expect(wave(new ShakeTracker(), 0, 8, 80, 60)).toBeGreaterThan(0);
  });
  it("обычная возня с картой — резкие повороты, дуги, зигзаг пары раз — не тряска", () => {
    const t = new ShakeTracker();
    const path: [number, number][] = [[100, 100], [250, 120], [400, 200], [250, 320], [100, 300], [220, 200], [380, 120], [250, 60], [120, 140]];
    let fired = false;
    path.forEach(([x, y], i) => { fired ||= t.feed(x, y, i * 60, k); });
    expect(fired).toBe(false);
  });
  it("медленные взмахи не складываются: окно ручки", () => {
    expect(wave(new ShakeTracker(), 0, 8, 80, k.ms)).toBe(0);
  });
  it("следующая тряска, быстрая, — меньше взмахов; медленная — снова по порогу", () => {
    const t = new ShakeTracker();
    const first = wave(t, 0, 8, 80, 60);
    expect(first).toBeGreaterThan(0);
    // сразу за первой хватает nextTurns взмахов
    const second = wave(t, 600, 8, 80, 60);
    expect(second).toBeGreaterThan(0);
    expect(second).toBeLessThan(first);
    // с большой паузой — как первая
    const slow = wave(t, 600 + k.nextMs + 5000, 8, 80, 60);
    expect(slow).toBeGreaterThan(second);
  });
  it("после первой тряски следующая — тоже тряска, а не дуновение: два-три взмаха не роняют, нужно меньше, чем в первый раз, но не мало", () => {
    expect(k.nextTurns).toBeGreaterThanOrEqual(3);
    expect(k.nextTurns).toBeLessThan(k.turns);
    const t = new ShakeTracker();
    expect(wave(t, 0, 10, 80, 60)).toBeGreaterThan(0);
    // сразу за ней — лёгкое движение в пределах окна «быстрой»: ничего
    let fired = false;
    let x = 100;
    t.feed(x, 50, 900, k);
    for (let i = 1; i <= 2; i++) { x += i % 2 ? 80 : -80; fired ||= t.feed(x, 50, 900 + i * 60, k); }
    expect(fired).toBe(false);
    // а настоящая тряска — роняет
    expect(wave(t, 1200, 10, 80, 60)).toBeGreaterThan(0);
  });
  it("turns = 0 — тряска выключена", () => {
    const off = { ...k, turns: 0 };
    const t = new ShakeTracker();
    let fired = false;
    for (let i = 0; i < 40; i++) fired ||= t.feed(i % 2 ? 300 : 0, 0, i * 30, off);
    expect(fired).toBe(false);
  });
  it("встряхивание телефона считается взмахом", () => {
    const t = new ShakeTracker();
    let n = 0;
    for (let i = 1; i <= 10; i++) { n = t.jolt(i * 80, k) ? i : n; if (n) break; }
    expect(n).toBe(k.turns);
  });
});
