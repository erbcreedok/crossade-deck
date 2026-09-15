// СТИКЕРЫ КАК СТРОКИ В БАЗЕ. Единственное место, где пишется SQL про стикеры.

import { randomBytes } from "crypto";
import { db } from "./open.js";

/** Сколько стикеров держит набор одного человека. */
export const STICKERS_MAX = 30;
/** Тяжелее этого стикер не берём: у стула он рисуется в пару строк высотой. */
export const MAX_STICKER_BYTES = 512 * 1024;

export function addSticker(owner: string, bytes: Buffer, type: string, now = Date.now()): { id: string } | "full" {
  const count = (db().prepare("SELECT COUNT(*) AS n FROM stickers WHERE owner = ?").get(owner) as { n: number }).n;
  if (count >= STICKERS_MAX) return "full";
  const id = randomBytes(9).toString("base64url");
  db().prepare("INSERT INTO stickers (id, owner, type, bytes, created_at) VALUES (?, ?, ?, ?, ?)").run(id, owner, type, bytes, now);
  return { id };
}

/** Набор человека по порядку добавления. */
export function stickersOf(owner: string): string[] {
  return (db().prepare("SELECT id FROM stickers WHERE owner = ? ORDER BY created_at, rowid").all(owner) as { id: string }[]).map((r) => r.id);
}

export function stickerImage(owner: string, id: string): { bytes: Buffer; type: string } | undefined {
  const row = db().prepare("SELECT type, bytes FROM stickers WHERE owner = ? AND id = ?").get(owner, id) as { type: string; bytes: Uint8Array } | undefined;
  return row && { type: row.type, bytes: Buffer.from(row.bytes) };
}

export function hasSticker(owner: string, id: string): boolean {
  return db().prepare("SELECT 1 FROM stickers WHERE owner = ? AND id = ?").get(owner, id) !== undefined;
}

export function removeSticker(owner: string, id: string): boolean {
  return Number(db().prepare("DELETE FROM stickers WHERE owner = ? AND id = ?").run(owner, id).changes) > 0;
}
