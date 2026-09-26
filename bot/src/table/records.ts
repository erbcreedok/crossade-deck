// ЗАПИСИ ПАРТИЙ В ЧАТЕ — по команде `/records`: последние сыгранные партии столов этого чата, у каждой
// — кто играл, кто проиграл и кнопка на запись. Смотрит любой, по умолчанию глазами крупье.
//
// Чистая: записи на вход, текст и кнопки на выход. Ссылку строит тот, кто знает адрес (`TableApi`).

import type { RecordMatch, Records } from "../../../server/src/table/records.js";
import type { Button, Said } from "./talk.js";

/** Сколько партий показывать: в чате длинный список не читают. */
export const RECORDS_SHOWN = 8;
/** Сколько недоигранных — отдельно и меньше: их смотрят, когда что-то пошло не так. */
export const UNFINISHED_SHOWN = 4;

export interface TableRecords {
  title: string;
  /** Жив ли стол; закрытый помечается, но его записи показываются так же. */
  live: boolean;
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
  if (tables.length === 0) return { text: "Записей нет: столов здесь за последние 30 дней не было.", rows: [] };
  const all = tables.flatMap((t) => t.records.sessions.flatMap((s) => s.matches.map((m) => ({ t, m })))).sort((a, b) => b.m.at - a.m.at);
  const done = all.filter(({ m }) => m.to !== null).slice(0, RECORDS_SHOWN);
  const open = all.filter(({ m }) => m.to === null).slice(0, UNFINISHED_SHOWN);
  if (done.length === 0 && open.length === 0) return { text: "Партий в записях нет: за столами сидели, но никто не раздавал.", rows: [] };

  const nameOf = (t: TableRecords, key: string | null) => (key === null ? "—" : t.records.people.find((p) => p.key === key)?.name ?? (key.startsWith("bot:") ? "бот" : key));
  const title = (t: TableRecords) => `${t.title}${t.live ? "" : " (закрыт)"}`;
  const who = (t: TableRecords, m: RecordMatch) => (m.players.length ? m.players.map((key) => nameOf(t, key)).join(", ") : "кто играл, не записано");
  // ВОССТАНОВЛЕННАЯ ПАРТИЯ проигравшего не знает — так и сказано, а не «ничья».
  const result = (t: TableRecords, m: RecordMatch) => (m.guessed ? "итог не записан" : m.loser === null ? "ничья" : `проиграл ${nameOf(t, m.loser)}`);

  const lines: string[] = [];
  const rows: Button[][] = [];
  if (done.length) {
    lines.push("Сыгранные партии — запись смотрит любой, глазами крупье или любого игрока:");
    done.forEach(({ t, m }, i) => {
      lines.push(`${i + 1}. ${clock(m.at, zone)} · ${title(t)} — ${who(t, m)}; ${result(t, m)}`);
      rows.push([{ text: `▶ ${i + 1}. ${clock(m.at, zone)} · ${t.title}`, url: t.url(m) }]);
    });
  }
  if (open.length) {
    if (lines.length) lines.push("");
    lines.push("Не доиграны — запись обрывается там, где партию бросили:");
    open.forEach(({ t, m }, i) => {
      lines.push(`н${i + 1}. ${clock(m.at, zone)} · ${title(t)} — ${who(t, m)}`);
      rows.push([{ text: `⏸ н${i + 1}. ${clock(m.at, zone)} · ${t.title}`, url: t.url(m) }]);
    });
  }
  if (all.some(({ m }) => m.guessed)) lines.push("", "«Итог не записан» — старые партии: их границы восстановлены по ходу игры, а запись начинается с открытия стола.");
  return { text: lines.join("\n"), rows };
}
