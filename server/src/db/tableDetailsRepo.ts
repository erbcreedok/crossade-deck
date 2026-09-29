// ДЕТАЛИ ХОЗЯИНА — строка на деталь: имя, теги, ширина, как стоит к камере и ракурсы JSON-ом (`details.ts`).

import type { DatabaseSync } from "node:sqlite";
import type { Detail } from "../table/details.js";
import { db } from "./open.js";

type Row = Omit<Detail, "views" | "tags"> & { views: string; tags: string };
const COLS = "id, name, tags, width, facing, views, at";
const out = (r: Row): Detail => ({ ...r, tags: JSON.parse(r.tags) as string[], views: JSON.parse(r.views) as Detail["views"] });

export function allDetails(at: DatabaseSync = db()): Detail[] {
  return (at.prepare(`SELECT ${COLS} FROM table_details ORDER BY at DESC, id`).all() as unknown as Row[]).map(out);
}

export function oneDetail(id: string, at: DatabaseSync = db()): Detail | null {
  const r = at.prepare(`SELECT ${COLS} FROM table_details WHERE id = ?`).get(id) as unknown as Row | undefined;
  return r ? out(r) : null;
}

/** Записать деталь целиком — новую или поверх прежней. */
export function putDetail(one: Detail, at: DatabaseSync = db()): void {
  at.prepare(`INSERT INTO table_details (${COLS}) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, tags = excluded.tags, width = excluded.width, facing = excluded.facing, views = excluded.views, at = excluded.at`)
    .run(one.id, one.name, JSON.stringify(one.tags), one.width, one.facing, JSON.stringify(one.views), one.at);
}

export function dropDetail(id: string, at: DatabaseSync = db()): boolean {
  return Number(at.prepare("DELETE FROM table_details WHERE id = ?").run(id).changes) > 0;
}
