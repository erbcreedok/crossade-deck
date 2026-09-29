// БИБЛИОТЕКА СПРАЙТОВ — строка на картинку: имя, вид файла (svg / png), откуда (загрузил хозяин / нарисовал agy).
// Сам файл — в папке библиотеки (`spriteLib.ts`).

import type { DatabaseSync } from "node:sqlite";
import { db } from "./open.js";

export interface LibSprite {
  id: string;
  name: string;
  ext: "svg" | "png";
  origin: "upload" | "agy";
  at: number;
}

export function libSprites(at: DatabaseSync = db()): LibSprite[] {
  return at.prepare("SELECT id, name, ext, origin, at FROM table_sprites ORDER BY at DESC, id").all() as unknown as LibSprite[];
}

export function libSprite(id: string, at: DatabaseSync = db()): LibSprite | null {
  return (at.prepare("SELECT id, name, ext, origin, at FROM table_sprites WHERE id = ?").get(id) as unknown as LibSprite | undefined) ?? null;
}

export function addLibSprite(one: LibSprite, at: DatabaseSync = db()): void {
  at.prepare("INSERT INTO table_sprites (id, name, ext, origin, at) VALUES (?, ?, ?, ?, ?)").run(one.id, one.name, one.ext, one.origin, one.at);
}

export function renameLibSprite(id: string, name: string, at: DatabaseSync = db()): boolean {
  return Number(at.prepare("UPDATE table_sprites SET name = ? WHERE id = ?").run(name, id).changes) > 0;
}

export function dropLibSprite(id: string, at: DatabaseSync = db()): boolean {
  return Number(at.prepare("DELETE FROM table_sprites WHERE id = ?").run(id).changes) > 0;
}
