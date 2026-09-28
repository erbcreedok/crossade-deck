// ПРОПУСК В ПРИЛОЖЕНИЕ — «это я, за этим столом», перенесённое из Telegram в нативное приложение.
//
// Приложение подписи Telegram не получает: `initData` живёт только внутри Mini App. Поэтому человек,
// уже доказавший себя столу через Telegram, просит у стола пропуск, и стол подписывает ЕГО САМОГО — ключ,
// имя, аватар — вместе с комнатой и сроком. С этим пропуском приложение входит той же персоной на тот же
// стул: для стола это ещё одно окно того же человека.
//
// От пропуска на запись (`pass.ts`) он отличается тем, что даёт больше — сесть и играть, — поэтому подпись
// у него своя, с меткой `app`: пропуск на запись им не прикинется, даже будучи подписан тем же секретом.
// Потерянный пропуск — это чужой, сидящий за одним столом под твоим именем до конца срока; отзывает всё
// разом смена секрета.

import { createHmac, timingSafeEqual } from "crypto";
import type { Person } from "./contract.js";

/** Кого переносит пропуск: всё, что стол знает о человеке из Telegram, кроме цвета — его даёт стол. */
export type Bearer = Pick<Person, "key" | "name"> & Partial<Pick<Person, "username" | "photo">>;

const sign = (room: string, body: string, secret: string): string =>
  createHmac("sha256", secret).update(`app|${room}|${body}`).digest("base64url").slice(0, 24);

/** Выписать пропуск: человек `who` в комнату `room` до `until` (мс). */
export function mintAppPass(room: string, who: Bearer, secret: string, until: number): string {
  const { key, name, username, photo } = who;
  const body = `${Buffer.from(JSON.stringify({ key, name, username, photo })).toString("base64url")}.${until}`;
  return `${body}.${sign(room, body, secret)}`;
}

/** Кого пускает пропуск в комнату `room`. `null` — подделан, протух, из другой комнаты или это не пропуск. */
export function appPassBearer(pass: unknown, room: string | undefined, secret: string, now = Date.now()): Bearer | null {
  if (typeof pass !== "string" || !room) return null;
  const parts = pass.split(".");
  if (parts.length !== 3) return null;
  const [who, until, mark] = parts as [string, string, string];
  const want = Buffer.from(sign(room, `${who}.${until}`, secret));
  const got = Buffer.from(mark);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  if (!(Number(until) > now)) return null;
  try {
    const raw = JSON.parse(Buffer.from(who, "base64url").toString()) as Partial<Bearer>;
    if (typeof raw.key !== "string" || typeof raw.name !== "string") return null;
    return { key: raw.key, name: raw.name, ...(raw.username ? { username: raw.username } : {}), ...(raw.photo ? { photo: raw.photo } : {}) };
  } catch {
    return null;
  }
}

// ─── КЛЮЧ ПРИЛОЖЕНИЯ ──────────────────────────────────────────────────────────────────────────────
// Пропуск выше называет стол; ключ — только человека: с ним приложение открывает «Мои комнаты» и садится за
// любой его стол, а не за один. Живёт дольше (`KEY_DAYS`) и хранится только в телефоне; метка подписи своя —
// ни пропуск, ни пропуск на запись им не прикинутся.

/** Сколько живёт ключ приложения, дней. */
export const KEY_DAYS = 30;

const signKey = (body: string, secret: string): string => createHmac("sha256", secret).update(`appkey|${body}`).digest("base64url").slice(0, 24);

export function mintAppKey(who: Bearer, secret: string, until: number): string {
  const { key, name, username, photo } = who;
  const body = `${Buffer.from(JSON.stringify({ key, name, username, photo })).toString("base64url")}.${until}`;
  return `${body}.${signKey(body, secret)}`;
}

/** Кого называет ключ. `null` — подделан, протух или это не ключ. */
export function appKeyBearer(appKey: unknown, secret: string, now = Date.now()): Bearer | null {
  if (typeof appKey !== "string") return null;
  const parts = appKey.split(".");
  if (parts.length !== 3) return null;
  const [who, until, mark] = parts as [string, string, string];
  const want = Buffer.from(signKey(`${who}.${until}`, secret)), got = Buffer.from(mark);
  if (want.length !== got.length || !timingSafeEqual(want, got) || !(Number(until) > now)) return null;
  try {
    const raw = JSON.parse(Buffer.from(who, "base64url").toString()) as Partial<Bearer>;
    if (typeof raw.key !== "string" || typeof raw.name !== "string") return null;
    return { key: raw.key, name: raw.name, ...(raw.username ? { username: raw.username } : {}), ...(raw.photo ? { photo: raw.photo } : {}) };
  } catch {
    return null;
  }
}
