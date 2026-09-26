// РОГАТКА — оттянул под карту, подержал, зарядилась — бросок в центр камеры. Раньше отпустил — отмена.

import { describe, expect, it } from "vitest";
import { SLING } from "./screenConst.js";
import { buzzEvery, charged, onRelease, spring, tensed } from "./sling.js";

/** Сколько секунд заряжается, если держать палец на `dist` под картой. */
const secondsAt = (dist: number) => { let c = 0, t = 0; while (c < 1 && t < 10) { c = charged(c, dist, 1 / 60); t += 1 / 60; } return t; };

describe("sling.tension", () => {
  it("пока палец на карте — натяга нет; вышел под неё — есть", () => {
    expect(tensed(0)).toBe(false);
    expect(tensed(-20)).toBe(false);
    expect(tensed(1)).toBe(true);
  });
  it("карта за пальцем не едет — только пружинит, и не дальше предела", () => {
    expect(spring(0)).toBe(0);
    expect(spring(20)).toBeGreaterThan(0);
    expect(spring(500)).toBeLessThanOrEqual(SLING.spring);
    expect(spring(40)).toBeLessThan(spring(80));
  });
});

describe("sling.charge", () => {
  it("чем дальше палец под картой, тем быстрее заряд", () => {
    expect(secondsAt(120)).toBeLessThan(secondsAt(40));
    expect(secondsAt(40)).toBeLessThan(secondsAt(5));
  });
  it("около секунды на разумном натяге, и не мгновенно даже на сильном", () => {
    expect(secondsAt(40)).toBeGreaterThan(0.7);
    expect(secondsAt(40)).toBeLessThan(1.2);
    expect(secondsAt(200)).toBeGreaterThan(0.25);
  });
  it("палец вернулся на карту — заряд не растёт", () => {
    expect(charged(0.5, 0, 0.5)).toBe(0.5);
  });
  it("вибрация чаще к заряду", () => {
    expect(buzzEvery(1)).toBeLessThan(buzzEvery(0));
  });
});

describe("sling.release", () => {
  it("не зарядилась — отмена; зарядилась в сукно — бросок; зарядилась мимо — отказ", () => {
    expect(onRelease(false, true)).toBe("cancel");
    expect(onRelease(false, false)).toBe("cancel");
    expect(onRelease(true, true)).toBe("throw");
    expect(onRelease(true, false)).toBe("refuse");
  });
});
