// ЧТО ЕСТЬ У ЧЕЛОВЕКА ИЗ ЧАСТЕЙ СКИНА — строки в базе. Единственное место, где про них пишется SQL;
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

/** Привязал Telegram — полученное гостем переезжает на Telegram (своё там остаётся). */
export function carryOwned(from: string, to: string, now = Date.now(), at: DatabaseSync = db()): void {
  if (from === to) return;
  for (const part of ownedParts(from, at)) grantParts(to, [part], "carried", now, at);
}
