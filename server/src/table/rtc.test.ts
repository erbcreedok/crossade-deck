import { describe, expect, it } from "vitest";
import { callsFirst, cleanSignal, SIGNAL_MAX, Signals, SIGNALS_PER_SEC } from "./rtc.js";

describe("знакомство голосов", () => {
  it("записка из сети: кому, какая и не длиннее предела", () => {
    expect(cleanSignal({ to: "tg:2", kind: "offer", body: "v=0" })).toEqual({ to: "tg:2", kind: "offer", body: "v=0" });
    expect(cleanSignal({ to: "tg:2", kind: "ice", body: "candidate:1" })?.kind).toBe("ice");
    // «Пока» — весть без тела.
    expect(cleanSignal({ to: "tg:2", kind: "bye" })).toEqual({ to: "tg:2", kind: "bye", body: "" });
    expect(cleanSignal({ to: "tg:2", kind: "offer" })).toBeNull();
    expect(cleanSignal({ to: "tg:2", kind: "хочу", body: "x" })).toBeNull();
    expect(cleanSignal({ kind: "offer", body: "x" })).toBeNull();
    expect(cleanSignal({ to: "", kind: "offer", body: "x" })).toBeNull();
    expect(cleanSignal({ to: "tg:2", kind: "offer", body: "x".repeat(SIGNAL_MAX + 1) })).toBeNull();
    expect(cleanSignal(null)).toBeNull();
  });

  it("первым зовёт тот, чей ключ меньше — и оба считают это одинаково", () => {
    expect(callsFirst("tg:1", "tg:2")).toBe(true);
    expect(callsFirst("tg:2", "tg:1")).toBe(false);
    // Ровно один из двоих: иначе согласование схлопнется.
    for (const [a, b] of [["tg:1", "tg:2"], ["guest:zz", "tg:1"], ["bot:table", "tg:9"]]) {
      expect(callsFirst(a!, b!) !== callsFirst(b!, a!)).toBe(true);
    }
  });

  it("лавину записок стол не носит, но пачку кандидатов — да", () => {
    const signals = new Signals();
    for (let i = 0; i < SIGNALS_PER_SEC; i += 1) expect(signals.take("a", 1000 + i)).toBe(true);
    expect(signals.take("a", 1000 + SIGNALS_PER_SEC)).toBe(false);
    // Чужая пачка своей не мешает.
    expect(signals.take("b", 1000 + SIGNALS_PER_SEC)).toBe(true);
    // Секунда прошла — снова можно.
    expect(signals.take("a", 2200)).toBe(true);
  });
});
