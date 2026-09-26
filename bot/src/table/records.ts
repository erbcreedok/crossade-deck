// ЗАПИСИ ПАРТИЙ В ЧАТЕ — по команде `/records`: последние сыгранные партии столов этого чата, у каждой
// — кто играл, кто проиграл и кнопка на запись. Смотрит любой, по умолчанию глазами крупье.
//
// Чистая: записи на вход, текст и кнопки на выход. Ссылку строит тот, кто знает адрес (`TableApi`).

import type { RecordMatch, Records } from "../../../server/src/table/records.js";
import type { Button, Said } from "./talk.js";

/** Сколько партий показывать: в чате длинный список не читают. */
export const RECORDS_SHOWN = 8;

export interface TableRecords {
  title: string;
  records: Records;
  /** Ссылка на запись этой партии. */
  url(match: RecordMatch): string;
}

const clock = (at: number, zone: string): string =>
  new Date(at).toLocaleString("ru-RU", { timeZone: zone, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * @param zone часовой пояс чата — время партии должно читаться так, как его помнят за столом
 */
export function recordsSay(tables: readonly TableRecords[], zone = "Asia/Almaty"): Said {
  const all = tables.flatMap((t) => t.records.sessions.flatMap((s) => s.matches.map((m) => ({ t, m }))));
  const done = all.filter(({ m }) => m.to !== null).sort((a, b) => b.m.at - a.m.at).slice(0, RECORDS_SHOWN);
  if (done.length === 0) return { text: "Сыгранных партий пока нет: запись появляется, когда партия доиграна.", rows: [] };

  const nameOf = (t: TableRecords, key: string | null) => (key === null ? "—" : t.records.people.find((p) => p.key === key)?.name ?? (key.startsWith("bot:") ? "бот" : key));
  const lines = done.map(({ t, m }, i) => {
    const who = m.players.map((key) => nameOf(t, key)).join(", ");
    const loser = m.loser === null ? "ничья" : `проиграл ${nameOf(t, m.loser)}`;
    return `${i + 1}. ${clock(m.at, zone)} · ${t.title} — ${who}; ${loser}`;
  });
  const rows: Button[][] = done.map(({ t, m }, i) => [{ text: `▶ ${i + 1}. ${clock(m.at, zone)} · ${t.title}`, url: t.url(m) }]);
  return { text: ["Сыгранные партии — запись смотрит любой, глазами крупье или любого игрока:", ...lines].join("\n"), rows };
}
