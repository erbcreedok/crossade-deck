// ДЕТАЛИ ХОЗЯИНА — строка на деталь: имя, вид, как стоит к камере и ракурсы JSON-ом (`details.ts`).

import type { DatabaseSync } from "node:sqlite";
import type { Detail } from "../table/details.js";
import { db } from "./open.js";

type Row = Omit<Detail, "views"> & { views: string };
const COLS = "id, name, slot, facing, views, at";
const out = (r: Row): Detail => ({ ...r, views: JSON.parse(r.views) as Detail["views"] });

export function allDetails(at: DatabaseSync = db()): Detail[] {
  return (at.prepare(`SELECT ${COLS} FROM table_details ORDER BY at DESC, id`).all() as unknown as Row[]).map(out);
}

export function oneDetail(id: string, at: DatabaseSync = db()): Detail | null {
  const r = at.prepare(`SELECT ${COLS} FROM table_details WHERE id = ?`).get(id) as unknown as Row | undefined;
  return r ? out(r) : null;
}

/** Записать деталь целиком — новую или поверх прежней. */
export function putDetail(one: Detail, at: DatabaseSync = db()): void {
  at.prepare(`INSERT INTO table_details (${COLS}) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, slot = excluded.slot, facing = excluded.facing, views = excluded.views, at = excluded.at`)
    .run(one.id, one.name, one.slot, one.facing, JSON.stringify(one.views), one.at);
}

export function dropDetail(id: string, at: DatabaseSync = db()): boolean {
  return Number(at.prepare("DELETE FROM table_details WHERE id = ?").run(id).changes) > 0;
}
