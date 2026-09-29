// БИБЛИОТЕКА СПРАЙТОВ — строка на картинку: имя, вид файла (svg / png), откуда (загрузил хозяин / нарисовал agy) и для
// чего она: деталь, сторона, теги (`spriteLib.ts`). Сам файл — в папке библиотеки.

import type { DatabaseSync } from "node:sqlite";
import { db } from "./open.js";

export const SPRITE_SLOTS = ["head", "hair", "body", "legs", "hands", "other"] as const;
export type SpriteSlot = (typeof SPRITE_SLOTS)[number];
export const SPRITE_SIDES = ["front", "back", "right", "left", "top", "bottom"] as const;

export interface LibSprite {
  id: string;
  name: string;
  ext: "svg" | "png";
  origin: "upload" | "agy";
  at: number;
  /** Для какой детали сделана. */
  slot: SpriteSlot;
  /** Какой стороной: лицо, спина, бок… — или ничего. */
  side: string | null;
  /** Набор, персонаж, что угодно — по ним ищут. */
  tags: string[];
}

type Row = Omit<LibSprite, "tags"> & { tags: string };
const COLS = "id, name, ext, origin, at, slot, side, tags";
const out = (r: Row): LibSprite => ({ ...r, tags: JSON.parse(r.tags) as string[] });

export function libSprites(at: DatabaseSync = db()): LibSprite[] {
  return (at.prepare(`SELECT ${COLS} FROM table_sprites ORDER BY at DESC, id`).all() as unknown as Row[]).map(out);
}

export function libSprite(id: string, at: DatabaseSync = db()): LibSprite | null {
  const r = at.prepare(`SELECT ${COLS} FROM table_sprites WHERE id = ?`).get(id) as unknown as Row | undefined;
  return r ? out(r) : null;
}

export function addLibSprite(one: LibSprite, at: DatabaseSync = db()): void {
  at.prepare(`INSERT INTO table_sprites (${COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(one.id, one.name, one.ext, one.origin, one.at, one.slot, one.side, JSON.stringify(one.tags));
}

/** Поправить имя, деталь, сторону, теги — что прислано. */
export function editLibSprite(id: string, patch: Partial<Pick<LibSprite, "name" | "slot" | "side" | "tags">>, at: DatabaseSync = db()): boolean {
  const was = libSprite(id, at);
  if (!was) return false;
  const next = { ...was, ...patch };
  at.prepare("UPDATE table_sprites SET name = ?, slot = ?, side = ?, tags = ? WHERE id = ?").run(next.name, next.slot, next.side, JSON.stringify(next.tags), id);
  return true;
}

export function dropLibSprite(id: string, at: DatabaseSync = db()): boolean {
  return Number(at.prepare("DELETE FROM table_sprites WHERE id = ?").run(id).changes) > 0;
}
