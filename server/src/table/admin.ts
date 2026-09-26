// СТРАНИЦА ХОЗЯИНА «ВСЕ СТОЛЫ» — какие комнаты есть и были, кто в них сидит и сидел, сколько было
// партий и какие есть записи.
//
// Собирается из двух мест: из лобби — то, что живо сейчас, и из журнала — то, что было за его срок
// (`KEEP_DAYS`). Комната, закрытая неделю назад, в лобби уже не живёт, но её партии ещё можно смотреть.

import type { RoomCard } from "./contract.js";
import { recordsOf, type RecordDeed, type Records } from "./records.js";

export interface RoomReport {
  room: string;
  title: string;
  kind: string | null;
  /** Жива ли комната сейчас. */
  live: boolean;
  /** Кто сидит сейчас — имена. */
  now: string[];
  /** Когда за столом последний раз что-то случилось. */
  lastAt: number;
  records: Records;
  /** Сколько доиграно партий. */
  played: number;
}

/**
 * @param seen    комнаты, о которых помнит журнал, — новые сверху
 * @param live    живые комнаты из лобби
 * @param logOf   события комнаты, из которых собираются записи
 */
export function roomsReport(
  seen: readonly { room: string; last: number }[],
  live: readonly RoomCard[],
  logOf: (room: string) => readonly RecordDeed[],
): RoomReport[] {
  const alive = new Map(live.map((one) => [one.room, one]));
  const rooms = new Map<string, number>();
  for (const one of seen) rooms.set(one.room, one.last);
  for (const one of live) if (!rooms.has(one.room)) rooms.set(one.room, one.createdAt);
  return [...rooms]
    .map(([room, lastAt]) => {
      const card = alive.get(room);
      const records = recordsOf(logOf(room));
      return {
        room,
        title: card?.title ?? records.title ?? "Закрытый стол",
        kind: card?.kind ?? records.kind,
        live: card !== undefined,
        now: (card?.people ?? []).filter((p) => !p.bot).map((p) => p.name),
        lastAt,
        records,
        played: records.sessions.reduce((n, s) => n + s.matches.filter((m) => m.to !== null).length, 0),
      };
    })
    .sort((a, b) => b.lastAt - a.lastAt);
}
