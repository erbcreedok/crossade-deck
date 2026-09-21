import { describe, expect, it } from "vitest";
import { Freshness, PULSE_GRACE_MS, SYNC_WAIT_MS } from "./freshness.js";

describe("свеж ли мой стол", () => {
  it("пульс вровень со мной — просить нечего", () => {
    const f = new Freshness();
    f.pulse(7, 7, 0);
    expect(f.due(60_000)).toBe(false);
  });

  it("пульс впереди: патч мог не долететь — ждём, и только потом просим", () => {
    const f = new Freshness();
    f.pulse(8, 7, 1000);
    expect(f.due(1000 + PULSE_GRACE_MS - 1)).toBe(false);
    expect(f.due(1000 + PULSE_GRACE_MS)).toBe(true);
  });

  it("патч долетел сам — тревога снята", () => {
    const f = new Freshness();
    f.pulse(8, 7, 1000);
    f.pulse(8, 8, 1200);
    expect(f.due(99_000)).toBe(false);
  });

  it("второй пульс впереди не отодвигает срок: отстаём с первого", () => {
    const f = new Freshness();
    f.pulse(8, 7, 1000);
    f.pulse(9, 7, 1000 + PULSE_GRACE_MS - 10);
    expect(f.due(1000 + PULSE_GRACE_MS)).toBe(true);
  });

  it("патч вне очереди и возврат из фона — просим сразу", () => {
    for (const how of ["gap", "doubt"] as const) {
      const f = new Freshness();
      f[how](5000);
      expect(f.due(5000), how).toBe(true);
    }
  });

  it("попросил — молчим, пока ждём; не ответили — просим снова; ответили — тишина", () => {
    const f = new Freshness();
    f.gap(0);
    f.asked(0);
    expect(f.due(SYNC_WAIT_MS - 1)).toBe(false);
    expect(f.due(SYNC_WAIT_MS)).toBe(true);
    f.asked(SYNC_WAIT_MS);
    f.welcomed();
    expect(f.due(SYNC_WAIT_MS * 10)).toBe(false);
  });
});
