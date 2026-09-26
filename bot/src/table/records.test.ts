import { describe, expect, it } from "vitest";
import type { Records } from "../../../server/src/table/records.js";
import { RECORDS_SHOWN, recordsSay } from "./records.js";

const match = (from: number, at: number, loser: string | null, to: number | null = from + 1) => ({ from, to, at, endAt: at + 1, dealer: "tg:1", players: ["tg:1", "tg:2", "bot:игрок1"], loser, out: [] });
const records = (matches: ReturnType<typeof match>[]): Records => ({
  people: [{ key: "tg:1", name: "Ye", firstAt: 0, lastAt: 0 }, { key: "tg:2", name: "Батыр", firstAt: 0, lastAt: 0 }],
  sessions: [{ from: 1, to: 99, at: 0, endAt: 0, people: ["tg:1", "tg:2"], matches }],
});

describe("records.the-bot-lists-played-matches", () => {
  it("доигранные партии — новые сверху, с игроками, проигравшим и кнопкой на запись", () => {
    const said = recordsSay([{ title: "Крестовый. Брод", records: records([match(10, 1000, "tg:2"), match(20, 2000, "tg:1")]), url: (m) => `https://x/t/replay?from=${m.from}` }]);
    expect(said.text).toContain("Ye, Батыр, бот");
    expect(said.text.indexOf("проиграл Ye"), "новая сверху").toBeLessThan(said.text.indexOf("проиграл Батыр"));
    expect(said.rows.map((r) => (r[0] as { url: string }).url)).toEqual(["https://x/t/replay?from=20", "https://x/t/replay?from=10"]);
  });

  it("недоигранную не показывает; пусто — так и говорит", () => {
    expect(recordsSay([{ title: "Т", records: records([match(10, 1000, null, null)]), url: () => "u" }]).rows).toEqual([]);
  });

  it("не больше восьми — в чате длинный список не читают", () => {
    const many = Array.from({ length: 12 }, (_, i) => match(i * 2 + 1, i * 1000, "tg:1"));
    expect(recordsSay([{ title: "Т", records: records(many), url: () => "u" }]).rows).toHaveLength(RECORDS_SHOWN);
  });
});
