// ПРОФИЛИ СТОЛА КАК СТРОКИ В БАЗЕ. Единственное место, где пишется SQL про них.

import type { DatabaseSync } from "node:sqlite";
import { db } from "./open.js";

export interface TableProfileRow {
  doll: string | null;
  palette: number | null;
  color: string | null;
  /** Части, которые человек поменял сам поверх набора `doll`: JSON «слот → часть». */
  parts: string | null;
}

export function tableProfile(key: string, at: DatabaseSync = db()): TableProfileRow | null {
  const row = at.prepare("SELECT doll, palette, color, parts FROM table_profiles WHERE key = ?").get(key) as TableProfileRow | undefined;
  return row ?? null;
}

/** Записать выбранное; поля, которых нет в `patch`, остаются как были. */
export function saveTableProfile(key: string, patch: Partial<TableProfileRow>, now = Date.now(), at: DatabaseSync = db()): TableProfileRow {
  const was = tableProfile(key, at) ?? { doll: null, palette: null, color: null, parts: null };
  const next = { ...was, ...patch };
  at.prepare("INSERT INTO table_profiles (key, doll, palette, color, parts, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET doll = excluded.doll, palette = excluded.palette, color = excluded.color, parts = excluded.parts, updated_at = excluded.updated_at")
    .run(key, next.doll, next.palette, next.color, next.parts, now);
  return next;
}

/**
 * ПРИВЯЗАЛ TELEGRAM — профиль гостя переезжает на его Telegram, если там своего ещё нет: выбранное в
 * приложении не теряется. Есть — Telegram главнее, гостевой остаётся где был.
 */
export function carryTableProfile(from: string, to: string, now = Date.now(), at: DatabaseSync = db()): boolean {
  if (from === to || tableProfile(to, at)) return false;
  const was = tableProfile(from, at);
  if (!was) return false;
  saveTableProfile(to, was, now, at);
  return true;
}
