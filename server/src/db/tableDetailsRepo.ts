// ДЕТАЛИ ХОЗЯИНА — строка на деталь: имя, теги, ширина и слои JSON-ом (`details.ts`).

import type { DatabaseSync } from "node:sqlite";
import type { Detail } from "../table/details.js";
import { db } from "./open.js";

type Row = Omit<Detail, "layers" | "tags"> & { layers: string; tags: string };
const COLS = "id, name, tags, width, layers, at";
const out = (r: Row): Detail => ({ ...r, tags: JSON.parse(r.tags) as string[], layers: JSON.parse(r.layers) as Detail["layers"] });

export function allDetails(at: DatabaseSync = db()): Detail[] {
  return (at.prepare(`SELECT ${COLS} FROM table_details ORDER BY at DESC, id`).all() as unknown as Row[]).map(out);
}

export function oneDetail(id: string, at: DatabaseSync = db()): Detail | null {
  const r = at.prepare(`SELECT ${COLS} FROM table_details WHERE id = ?`).get(id) as unknown as Row | undefined;
  return r ? out(r) : null;
}

/** Записать деталь целиком — новую или поверх прежней. */
export function putDetail(one: Detail, at: DatabaseSync = db()): void {
  at.prepare(`INSERT INTO table_details (${COLS}) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, tags = excluded.tags, width = excluded.width, layers = excluded.layers, at = excluded.at`)
    .run(one.id, one.name, JSON.stringify(one.tags), one.width, JSON.stringify(one.layers), one.at);
}

export function dropDetail(id: string, at: DatabaseSync = db()): boolean {
  return Number(at.prepare("DELETE FROM table_details WHERE id = ?").run(id).changes) > 0;
}

/** Имя уже у другой детали — без разницы в регистре, пробелах по краям и «ё». */
export function nameTaken(name: string, except: string | null = null, at: DatabaseSync = db()): boolean {
  const norm = (t: string) => t.trim().toLowerCase().replaceAll("ё", "е");
  return allDetails(at).some((d) => d.id !== except && norm(d.name) === norm(name));
}
