// АВАТАРЫ ЧЕЛОВЕКА — снимки его фото из Telegram, строки в базе. Каждое новое фото — новый снимок с номером
// `n` (1, 2, …); прежние не трогаются никогда: голова, которой он сидел, остаётся той же, что бы он потом ни
// поставил в Telegram. Одно и то же фото второй раз не пишется (`uid` — отпечаток байтов).

import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { db } from "./open.js";

export interface Avatar {
  n: number;
  photo: string;
}

/** Все снимки по порядку. */
export function avatarsOf(key: string, at: DatabaseSync = db()): Avatar[] {
  return at.prepare("SELECT n, photo FROM table_avatars WHERE key = ? ORDER BY n").all(key) as unknown as Avatar[];
}

/** Запомнить фото: новое — новый снимок, уже бывшее — ничего. Отвечает номером снимка. */
export function keepAvatar(key: string, photo: string, now = Date.now(), at: DatabaseSync = db()): number {
  const uid = createHash("sha1").update(photo).digest("hex");
  const was = at.prepare("SELECT n FROM table_avatars WHERE key = ? AND uid = ?").get(key, uid) as { n: number } | undefined;
  if (was) return was.n;
  const last = at.prepare("SELECT MAX(n) AS n FROM table_avatars WHERE key = ?").get(key) as { n: number | null };
  const n = (last.n ?? 0) + 1;
  at.prepare("INSERT INTO table_avatars (key, n, uid, photo, got_at) VALUES (?, ?, ?, ?, ?)").run(key, n, uid, photo, now);
  return n;
}
