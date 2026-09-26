import { describe, expect, it } from "vitest";
import { recordsOf, SESSION_GAP_MS } from "./records.js";
import type { RecordDeed } from "./records.js";

let id = 0;
const ev = (at: number, kind: string, who?: string, what?: unknown): RecordDeed => ({ id: ++id, at, kind, ...(who ? { who } : {}), ...(what === undefined ? {} : { what }) });

describe("records.sessions-and-matches", () => {
  it("открыли, сели, сыграли две партии — одна сессия, две партии с игроками и проигравшим", () => {
    id = 0;
    const log = [
      ev(0, "room.open"),
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
