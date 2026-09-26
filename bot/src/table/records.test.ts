import { describe, expect, it } from "vitest";
import type { Records } from "../../../server/src/table/records.js";
import { RECORDS_SHOWN, UNFINISHED_SHOWN, recordsSay } from "./records.js";

const match = (from: number, at: number, loser: string | null, to: number | null = from + 1, guessed?: true) => ({ from, to, at, endAt: at + 1, dealer: "tg:1", players: ["tg:1", "tg:2", "bot:игрок1"], loser, out: [], ...(guessed ? { guessed } : {}) });
const records = (matches: ReturnType<typeof match>[]): Records => ({
  title: null,
  kind: null,
  people: [{ key: "tg:1", name: "Ye", firstAt: 0, lastAt: 0 }, { key: "tg:2", name: "Батыр", firstAt: 0, lastAt: 0 }],
  sessions: [{ from: 1, to: 99, at: 0, endAt: 0, people: ["tg:1", "tg:2"], matches }],
});

describe("records.the-bot-lists-played-matches", () => {
  it("доигранные партии — новые сверху, с игроками, проигравшим и кнопкой на запись", () => {
    const said = recordsSay([{ title: "Крестовый. Брод", live: true, records: records([match(10, 1000, "tg:2"), match(20, 2000, "tg:1")]), url: (m) => `https://x/t/replay?from=${m.from}` }]);
    expect(said.text).toContain("Ye, Батыр, бот");
    expect(said.text.indexOf("проиграл Ye"), "новая сверху").toBeLessThan(said.text.indexOf("проиграл Батыр"));
    expect(said.rows.map((r) => (r[0] as { url: string }).url)).toEqual(["https://x/t/replay?from=20", "https://x/t/replay?from=10"]);
  });

  it("недоигранные — отдельным списком со своей кнопкой, не путаясь с доигранными", () => {
    const said = recordsSay([{ title: "Т", live: true, records: records([match(10, 1000, "tg:2"), match(20, 2000, null, null)]), url: (m) => `u${m.from}` }]);
    expect(said.text.indexOf("Сыгранные")).toBeLessThan(said.text.indexOf("Не доиграны"));
    expect(said.rows.map((r) => [(r[0] as { text: string }).text.slice(0, 1), (r[0] as { url: string }).url])).toEqual([["▶", "u10"], ["⏸", "u20"]]);
  });

  it("закрытый стол показывается с пометкой; восстановленная партия — «итог не записан», а не «ничья»", () => {
    const said = recordsSay([{ title: "Брод", live: false, records: records([match(1, 1000, null, 9, true)]), url: () => "u" }]);
    expect(said.text).toContain("Брод (закрыт)");
    expect(said.text).toContain("итог не записан");
    expect(said.text).not.toContain("ничья");
    expect(said.rows).toHaveLength(1);
  });

  it("пусто — различает «столов не было» и «партий не было»", () => {
    expect(recordsSay([]).text).toMatch(/^Записей нет/);
    expect(recordsSay([{ title: "Т", live: false, records: records([]), url: () => "u" }]).text).toMatch(/^Партий в записях нет/);
  });

  it("недоигранных не больше четырёх", () => {
    const many = Array.from({ length: 9 }, (_, i) => match(i * 2 + 1, i * 1000, null, null));
    expect(recordsSay([{ title: "Т", live: true, records: records(many), url: () => "u" }]).rows).toHaveLength(UNFINISHED_SHOWN);
  });

  it("не больше восьми — в чате длинный список не читают", () => {
    const many = Array.from({ length: 12 }, (_, i) => match(i * 2 + 1, i * 1000, "tg:1"));
    expect(recordsSay([{ title: "Т", live: true, records: records(many), url: () => "u" }]).rows).toHaveLength(RECORDS_SHOWN);
  });
});
