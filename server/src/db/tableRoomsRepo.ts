// КОМНАТЫ СТОЛА КАК СТРОКИ В БАЗЕ. Единственное место, где пишется SQL про них.
//
// Что в `card` и что в `state`, репозиторий не знает: это JSON лобби и JSON стола. Он только хранит.

import type { DatabaseSync } from "node:sqlite";
import { db } from "./open.js";

export interface KeptRoom {
  room: string;
  card: string;
  state: string | null;
}

export function keepCard(room: string, card: string, now = Date.now(), at: DatabaseSync = db()): void {
  at.prepare("INSERT INTO table_rooms (room, card, saved_at) VALUES (?, ?, ?) ON CONFLICT(room) DO UPDATE SET card = excluded.card, saved_at = excluded.saved_at").run(room, card, now);
}

/** Слепок стола — только комнате, у которой есть запись: закрытую комнату он не воскрешает. */
export function keepState(room: string, state: string, now = Date.now(), at: DatabaseSync = db()): void {
  at.prepare("UPDATE table_rooms SET state = ?, saved_at = ? WHERE room = ?").run(state, now, room);
}

export function keptState(room: string, at: DatabaseSync = db()): string | null {
  const row = at.prepare("SELECT state FROM table_rooms WHERE room = ?").get(room) as { state: string | null } | undefined;
  return row?.state ?? null;
}

export function keptRooms(at: DatabaseSync = db()): KeptRoom[] {
  return at.prepare("SELECT room, card, state FROM table_rooms ORDER BY saved_at").all() as unknown as KeptRoom[];
}

export function dropRoom(room: string, at: DatabaseSync = db()): void {
  at.prepare("DELETE FROM table_rooms WHERE room = ?").run(room);
}

/** Сколько дней комната живёт без единого изменения. */
export const KEEP_ROOM_DAYS = 30;

/** Комнаты, к которым давно никто не прикасался, уходят: иначе список растёт вечно. */
export function forgetStaleRooms(now = Date.now(), days = KEEP_ROOM_DAYS, at: DatabaseSync = db()): number {
  return Number(at.prepare("DELETE FROM table_rooms WHERE saved_at < ?").run(now - days * 86_400_000).changes);
}
