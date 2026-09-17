import { afterEach, describe, expect, it } from "vitest";
import { iceServers } from "./config.js";
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

describe("через что голосам искать друг друга", () => {
  const was = { url: process.env.TABLE_TURN_URL, user: process.env.TABLE_TURN_USER, pass: process.env.TABLE_TURN_PASS };
  afterEach(() => {
    for (const [k, v] of [["TABLE_TURN_URL", was.url], ["TABLE_TURN_USER", was.user], ["TABLE_TURN_PASS", was.pass]] as const) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it("РЕТРАНСЛЯТОРА НЕТ — остаётся один STUN, и пара за строгим NAT останется без связи", () => {
    delete process.env.TABLE_TURN_URL;
    const list = iceServers();
    expect(list).toHaveLength(1);
    expect(list[0]!.urls.every((one) => one.startsWith("stun:"))).toBe(true);
  });

  it("РЕТРАНСЛЯТОР ЗАДАН — он едет клиенту вместе с паролем, а STUN остаётся первым", () => {
    process.env.TABLE_TURN_URL = "turn:relay.example:3478, turns:relay.example:5349";
    process.env.TABLE_TURN_USER = "стол";
    process.env.TABLE_TURN_PASS = "пароль";
    const list = iceServers();
    expect(list).toHaveLength(2);
    expect(list[0]!.urls[0]!.startsWith("stun:"), "сперва дешёвый путь: напрямую").toBe(true);
    expect(list[1]).toEqual({ urls: ["turn:relay.example:3478", "turns:relay.example:5349"], username: "стол", credential: "пароль" });
  });
});
