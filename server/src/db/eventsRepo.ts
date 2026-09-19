// ЖУРНАЛ КАК СТРОКИ В БАЗЕ. Единственное место, где пишется SQL про события.
//
// Состояние отвечает на «как сейчас», журнал — на «что было». Это разные вопросы, и второй нельзя
// вывести из первого: стол разошёлся, комната закрылась, и разбирать жалобу уже не по чему.
//
// Запись должна быть ДЕШЕВЛЕ события, которое она описывает, иначе журнал начнут выключать. Поэтому
// здесь нет ни ожидания диска, ни рассылки: одна подготовленная строка в открытую базу.

import type { DatabaseSync } from "node:sqlite";
import { db } from "./open.js";

/** Кто рассказал: стол (правда сервера) или экран игрока (то, что он видел и делал). */
export type Side = "table" | "screen";

export interface Deed {
  /** Когда. */
  at: number;
  /** В какой комнате. Пусто у событий до посадки за стол. */
  room?: string;
  /** Ключ человека — `tg:<id>` или `guest:<sessionId>`. Пусто, пока неизвестен. */
  who?: string;
  side: Side;
  /** Вид события: `room.open`, `join`, `act`, `refused`, `mic`, `press`, `sound`, `boom`… */
  kind: string;
  /** Подробности вида. Своя форма у каждого вида — поэтому JSON, а не колонки. */
  what?: unknown;
}

export interface Told extends Deed {
  id: number;
}

/** Длиннее этого подробности режутся: журнал не хранилище снимков экрана. */
export const MAX_WHAT_BYTES = 8 * 1024;

/** Сколько дней журнал живёт. Дальше он не отвечает ни на один вопрос, а место занимает. */
export const KEEP_DAYS = 30;

/**
 * Числа, приехавшие по сети 64-битными целыми, распаковываются как `bigint`, а его `JSON.stringify`
 * не умеет и БРОСАЕТ. Журнал не имеет права падать из-за того, что ему рассказали, — поэтому большие
 * целые записываются числами, а на всякую другую неожиданность есть последняя сеть внизу.
 */
const plain = (_key: string, value: unknown): unknown => (typeof value === "bigint" ? Number(value) : value);

const packed = (what: unknown): string | null => {
  if (what === undefined) return null;
  let text: string;
  try {
    text = JSON.stringify(what, plain) ?? "null";
  } catch {
    return JSON.stringify({ unreadable: String(what).slice(0, 200) });
  }
  return text.length > MAX_WHAT_BYTES ? JSON.stringify({ cut: text.length, head: text.slice(0, 512) }) : text;
};

/** Записать одно событие. */
export function tell(deed: Deed, at: DatabaseSync = db()): void {
  at.prepare("INSERT INTO events (at, room, who, side, kind, what) VALUES (?, ?, ?, ?, ?, ?)").run(
    deed.at,
    deed.room ?? null,
    deed.who ?? null,
    deed.side,
    deed.kind,
    packed(deed.what),
  );
}

/** Записать пачку — один заход в базу на всю пачку, а не на каждую строку. */
export function tellAll(deeds: readonly Deed[], at: DatabaseSync = db()): void {
  if (deeds.length === 0) return;
  const put = at.prepare("INSERT INTO events (at, room, who, side, kind, what) VALUES (?, ?, ?, ?, ?, ?)");
  at.exec("BEGIN");
  try {
    for (const deed of deeds) {
      put.run(deed.at, deed.room ?? null, deed.who ?? null, deed.side, deed.kind, packed(deed.what));
    }
    at.exec("COMMIT");
  } catch (err) {
    at.exec("ROLLBACK");
    throw err;
  }
}

interface Row {
  id: number;
  at: number;
  room: string | null;
  who: string | null;
  side: string;
  kind: string;
  what: string | null;
}

const told = (row: Row): Told => ({
  id: row.id,
  at: row.at,
  ...(row.room === null ? {} : { room: row.room }),
  ...(row.who === null ? {} : { who: row.who }),
  side: row.side as Side,
  kind: row.kind,
  ...(row.what === null ? {} : { what: JSON.parse(row.what) as unknown }),
});

/** Всё, что случилось в комнате, по порядку. Это и есть лента для проигрывателя. */
export function deedsOf(room: string, limit = 5000, at: DatabaseSync = db()): Told[] {
  const rows = at.prepare("SELECT * FROM events WHERE room = ? ORDER BY id LIMIT ?").all(room, limit) as unknown as Row[];
  return rows.map(told);
}

export interface Ask {
  room?: string;
  who?: string;
  side?: Side;
  kind?: string;
  since?: number;
  until?: number;
  limit?: number;
}

/** Выборка по любому набору примет — то, чем разбирают жалобу. */
export function deeds(ask: Ask = {}, at: DatabaseSync = db()): Told[] {
  const where: string[] = [];
  const args: (string | number)[] = [];
  const need = (sql: string, value: string | number | undefined) => {
    if (value === undefined) return;
    where.push(sql);
    args.push(value);
  };
  need("room = ?", ask.room);
  need("who = ?", ask.who);
  need("side = ?", ask.side);
  need("kind = ?", ask.kind);
  need("at >= ?", ask.since);
  need("at <= ?", ask.until);
  const sql = `SELECT * FROM events${where.length === 0 ? "" : ` WHERE ${where.join(" AND ")}`} ORDER BY id DESC LIMIT ?`;
  const rows = at.prepare(sql).all(...args, ask.limit ?? 200) as unknown as Row[];
  return rows.map(told).reverse();
}

/** Какие комнаты вообще есть в журнале — с чего начинается разбор. */
export function roomsSeen(limit = 50, at: DatabaseSync = db()): { room: string; first: number; last: number; deeds: number }[] {
  return at
    .prepare(
      `SELECT room, MIN(at) AS first, MAX(at) AS last, COUNT(*) AS deeds FROM events
       WHERE room IS NOT NULL GROUP BY room ORDER BY last DESC LIMIT ?`,
    )
    .all(limit) as unknown as { room: string; first: number; last: number; deeds: number }[];
}

/** Забыть старое. Зовётся по часам, а не при каждой записи. */
export function forget(now = Date.now(), days = KEEP_DAYS, at: DatabaseSync = db()): number {
  return Number(at.prepare("DELETE FROM events WHERE at < ?").run(now - days * 24 * 60 * 60 * 1000).changes);
}
