// ПРАВКИ ЧАСТЕЙ СКИНА — строка на часть, правка лежит JSON-ом (`tunes.ts`). Пустая правка — строки нет.

import type { DatabaseSync } from "node:sqlite";
import { cleanTune, type PartTune, type Tunes } from "../table/tunes.js";
import { db } from "./open.js";

export function allTunes(at: DatabaseSync = db()): Tunes {
  const rows = at.prepare("SELECT part, tune, at FROM table_tunes").all() as unknown as { part: string; tune: string; at: number }[];
  const parts: Record<string, PartTune> = {};
  let last = 0;
  for (const r of rows) {
    const t = cleanTune(JSON.parse(r.tune));
    if (t) parts[r.part] = t;
    last = Math.max(last, r.at);
  }
  return { parts, at: last };
}

/** Записать правку части; `null` — снять её, часть снова как в каталоге. */
export function putTune(part: string, tune: PartTune | null, now = Date.now(), at: DatabaseSync = db()): void {
  if (tune) at.prepare("INSERT INTO table_tunes (part, tune, at) VALUES (?, ?, ?) ON CONFLICT(part) DO UPDATE SET tune = excluded.tune, at = excluded.at").run(part, JSON.stringify(tune), now);
  else {
    at.prepare("DELETE FROM table_tunes WHERE part = ?").run(part);
    // Снятая правка тоже — перемена: клиенту нужно новое `at`, чтобы вернуть часть как было.
    at.prepare("INSERT INTO table_tunes (part, tune, at) VALUES ('~', '{}', ?) ON CONFLICT(part) DO UPDATE SET at = excluded.at").run(now);
  }
}
