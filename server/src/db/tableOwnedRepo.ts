// ЧТО ЕСТЬ У ЧЕЛОВЕКА ИЗ ЧАСТЕЙ СКИНА И ЕГО ЗАХОДЫ — строки в базе. Единственное место, где про них пишется SQL;
// правила — `table/rewards.ts`.

import type { DatabaseSync } from "node:sqlite";
import { db } from "./open.js";

/** Полученные наградой части. */
export function ownedParts(key: string, at: DatabaseSync = db()): string[] {
  return (at.prepare("SELECT part FROM table_owned WHERE key = ? ORDER BY got_at, part").all(key) as { part: string }[]).map((r) => r.part);
}

/** Выдать части; что уже было — остаётся как было. */
export function grantParts(key: string, parts: readonly string[], why: string, now = Date.now(), at: DatabaseSync = db()): void {
  const put = at.prepare("INSERT OR IGNORE INTO table_owned (key, part, why, got_at) VALUES (?, ?, ?, ?)");
  for (const part of parts) put.run(key, part, why, now);
}

/**
 * ЗАХОД ЗА СТОЛ: после перерыва не меньше `gapMs` — новый заход (счётчик растёт), раньше — тот же (только время).
 * Отвечает, сколько заходов теперь и новый ли этот.
 */
export function visit(key: string, gapMs: number, now = Date.now(), at: DatabaseSync = db()): { visits: number; fresh: boolean } {
  const was = at.prepare("SELECT visits, last_at FROM table_visits WHERE key = ?").get(key) as { visits: number; last_at: number } | undefined;
  const fresh = !was || now - was.last_at >= gapMs;
  const visits = (was?.visits ?? 0) + (fresh ? 1 : 0);
  at.prepare("INSERT INTO table_visits (key, visits, last_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET visits = excluded.visits, last_at = excluded.last_at").run(key, visits, now);
  return { visits, fresh };
}

/** Привязал Telegram — полученное гостем переезжает на Telegram (своё там остаётся). */
export function carryOwned(from: string, to: string, now = Date.now(), at: DatabaseSync = db()): void {
  if (from === to) return;
  for (const part of ownedParts(from, at)) grantParts(to, [part], "carried", now, at);
}
