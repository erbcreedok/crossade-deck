import { describe, expect, it } from "vitest";
import { recordsOf, SESSION_GAP_MS } from "./records.js";
import type { RecordDeed } from "./records.js";

let id = 0;
const ev = (at: number, kind: string, who?: string, what?: unknown): RecordDeed => ({ id: ++id, at, kind, ...(who ? { who } : {}), ...(what === undefined ? {} : { what }) });

describe("records.sessions-and-matches", () => {
  it("открыли, сели, сыграли две партии — одна сессия, две партии с игроками и проигравшим", () => {
    id = 0;
    const log = [
      ev(0, "room.open", "tg:1", { kind: "krest", title: "Крестовый. Брод", by: "tg:1" }),
      ev(10, "join", "tg:1", { name: "Ye" }),
      ev(20, "join", "tg:2", { name: "Батыр" }),
      ev(30, "match.start", "tg:1", { игроки: [{ key: "tg:1", name: "Ye" }, { key: "tg:2", name: "Батыр" }] }),
      ev(40, "act", "tg:1"),
      ev(50, "match.end", "tg:2", { вышли: ["tg:1"] }),
      ev(60, "match.start", "tg:2", { игроки: [{ key: "tg:1", name: "Ye" }, { key: "tg:2", name: "Батыр" }] }),
      ev(70, "act", "tg:2"),
    ];
    const r = recordsOf(log);
    expect(r.people.map((one) => one.name)).toEqual(["Ye", "Батыр"]);
    expect(r, "имя и род — какими стол открыли").toMatchObject({ title: "Крестовый. Брод", kind: "krest" });
    expect(r.sessions).toHaveLength(1);
    const [first, second] = r.sessions[0]!.matches;
    expect(first).toMatchObject({ from: 4, to: 6, dealer: "tg:1", loser: "tg:2", out: ["tg:1"], players: ["tg:1", "tg:2"] });
    expect(second, "не доиграна — конца нет").toMatchObject({ from: 7, to: null, loser: null });
  });

  it("тишина дольше порога — новая сессия; люди сессии — те, кто в ней входил", () => {
    id = 0;
    const log = [
      ev(0, "room.open"),
      ev(10, "join", "tg:1", { name: "Ye" }),
      ev(20, "act", "tg:1"),
      ev(20 + SESSION_GAP_MS + 1, "join", "tg:3", { name: "Айдос" }),
      ev(30 + SESSION_GAP_MS, "act", "tg:3"),
    ];
    const r = recordsOf(log);
    expect(r.sessions).toHaveLength(2);
    expect(r.sessions[0]!.people).toEqual(["tg:1"]);
    expect(r.sessions[1]!.people).toEqual(["tg:3"]);
    expect(r.sessions[1]!.from, "сессия начинается с первого события после тишины").toBe(4);
  });

  it("имя человека — последнее, каким он входил", () => {
    id = 0;
    const r = recordsOf([ev(0, "join", "tg:1", { name: "Ye" }), ev(1, "join", "tg:1", { name: "Ерб" })]);
    expect(r.people).toEqual([expect.objectContaining({ key: "tg:1", name: "Ерб" })]);
  });
});

describe("records.guessed-from-match", () => {
  it("партии до `match.start`: границы — по ходу партии, игроки — кто ходил, запись — с открытия стола", () => {
    id = 0;
    const log = [
      ev(0, "room.open", undefined, { kind: "krest", title: "Крестовый", by: "tg:1" }),
      ev(1, "match", undefined, { идёт: false }),
      ev(10, "join", "tg:1", { name: "Ye" }),
      ev(20, "match", undefined, { идёт: true, ход: "c4", вышли: [] }),
      ev(30, "act", "tg:1"),
      ev(35, "act", "tg:2"),
      ev(40, "match", undefined, { идёт: true, ход: "c2", вышли: ["c3"] }),
      ev(50, "match", undefined, { идёт: true, ход: null, вышли: ["c3", "c2"] }),
      ev(60, "match", undefined, { идёт: true, ход: "c2", вышли: [] }),
      ev(70, "act", "tg:1"),
    ];
    const [first, second] = recordsOf(log).sessions[0]!.matches;
    expect(first).toMatchObject({ from: 1, to: 8, at: 20, guessed: true, loser: null, players: ["tg:1", "tg:2"] });
    expect(second, "не доиграна").toMatchObject({ from: 1, to: null, guessed: true, players: ["tg:1"] });
  });

  it("записанное начало вытесняет восстановленное — одна партия не становится двумя", () => {
    id = 0;
    const log = [
      ev(0, "room.open"),
      ev(10, "match", undefined, { идёт: true, ход: "c4", вышли: [] }),
      ev(11, "match.start", "tg:1", { игроки: [{ key: "tg:1", name: "Ye" }] }),
      ev(20, "match", undefined, { идёт: true, ход: null, вышли: ["c4"] }),
      ev(21, "match.end", "tg:2", { вышли: ["tg:1"] }),
    ];
    const matches = recordsOf(log).sessions[0]!.matches;
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ from: 3, to: 5, loser: "tg:2" });
    expect(matches[0]!.guessed).toBeUndefined();
  });
});
