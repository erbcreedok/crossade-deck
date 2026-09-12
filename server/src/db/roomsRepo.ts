// КОМНАТА КАК СТРОКА В БАЗЕ. Единственное место, где пишется SQL про столы.
//
// Водораздел, ради которого всё это: комната принадлежит ЧЕЛОВЕКУ, а не процессу. Сессия Colyseus
// держит «кто сейчас онлайн и где лежат карты»; запись держит «что это за комната, чья, кто в ней
// состоит и по каким правилам пускают». Опустела — комната не умерла, она пустая.
//
// КОД ЖИВЁТ РОВНО СТОЛЬКО, СКОЛЬКО КОМНАТА. Он уникален среди живых (у закрытой он `NULL`, а NULL
// в SQLite не спорит с NULL) — и возвращается в оборот только закрытием, а не выходом последнего.

import type { DatabaseSync } from "node:sqlite";
import { db } from "./open.js";

/** Кто ВИДИТ комнату в списке. */
export const VISIBILITIES = ["public", "friends", "hidden"] as const;
/** Кого в неё ПУСКАЮТ. */
export const ADMISSIONS = ["open", "code", "invite"] as const;
/** ПО ЧЕМУ идёт игра. Значение сегодня одно — ось есть, чтобы схему не переписывать завтра. */
export const TRANSPORTS = ["server"] as const;

export type Visibility = (typeof VISIBILITIES)[number];
export type Admission = (typeof ADMISSIONS)[number];
export type Transport = (typeof TRANSPORTS)[number];

/**
 * КТО В КОМНАТЕ РЕШАЕТ. Это режим комнаты, а не роль: роли при всех трёх одни и те же.
 * `free` — вольница, каждый админ делает что хочет; `council` — совет, действия админов решают
 * админы голосованием; `assembly` — вече, комнату настраивают все игроки.
 */
export const MODES = ["free", "council", "assembly"] as const;
export type Mode = (typeof MODES)[number];

/** Роли за столом. Админ сносит админа, оунера — нет; это правило живёт выше, в комнате. */
export const ROLES = ["owner", "admin", "player", "spectator"] as const;
export type Role = (typeof ROLES)[number];

export interface RoomRow {
  readonly id: string;
  /** Четыре цифры. `null` — комната закрыта, код вернулся в оборот. */
  readonly code: string | null;
  readonly game: string;
  readonly title: string | null;
  readonly ownerAccount: string | null;
  readonly visibility: Visibility;
  readonly admission: Admission;
  readonly transport: Transport;
  readonly seats: number | null;
  readonly createdAt: number;
  /** Когда комнату видели живой в последний раз — по нему сортируется список. */
  readonly aliveAt: number;
  readonly closedAt: number | null;
  /** Идущая сейчас сессия Colyseus. `null` — стол стоит, за ним никого. */
  readonly sessionId: string | null;
  readonly mode: Mode;
  /** Переживёт ли стол уход последнего. Невечный закрывается вместе со своей сессией. */
  readonly forever: boolean;
}

interface RawRoom {
  id: string;
  code: string | null;
  game: string;
  title: string | null;
  owner_account: string | null;
  visibility: string;
  admission: string;
  transport: string;
  seats: number | null;
  created_at: number;
  alive_at: number;
  closed_at: number | null;
  session_id: string | null;
  mode: string;
  forever: number;
}

function toRoom(raw: RawRoom | undefined): RoomRow | undefined {
  if (!raw) return undefined;
  return {
    id: raw.id,
    code: raw.code,
    game: raw.game,
    title: raw.title,
    ownerAccount: raw.owner_account,
    visibility: raw.visibility as Visibility,
    admission: raw.admission as Admission,
    transport: raw.transport as Transport,
    seats: raw.seats,
    createdAt: raw.created_at,
    aliveAt: raw.alive_at,
    closedAt: raw.closed_at,
    sessionId: raw.session_id,
    mode: raw.mode as Mode,
    forever: raw.forever === 1,
  };
}

const SELECT = `SELECT id, code, game, title, owner_account, visibility, admission, transport,
  seats, created_at, alive_at, closed_at, session_id, mode, forever FROM rooms`;

/**
 * ИЗ ЧЕГО СОБИРАЕТСЯ КОД. Ни нуля с буквой O, ни единицы с I: код называют вслух и набирают с
 * чужого экрана, и пара похожих знаков стоит дороже, чем весь выигрыш от длинного алфавита.
 * Гласных здесь тоже нет — на четырёх знаках матерное слово выпадает чаще, чем кажется.
 */
export const CODE_SIGNS = "23456789ACDEFHJKLMNPQRTUVWXY";
/** Длина выданного кода. Свой человек может назвать короче или длиннее — от 2 до 8. */
export const CODE_LENGTH = 4;
export const CODE_MIN = 2;
export const CODE_MAX = 8;

const CODE_SPACE = CODE_SIGNS.length ** CODE_LENGTH;

function randomCode(): string {
  let code = "";
  for (let n = 0; n < CODE_LENGTH; n++) code += CODE_SIGNS[Math.floor(Math.random() * CODE_SIGNS.length)];
  return code;
}

/** Код, названный человеком: тот же алфавит, та же строгость — иначе его не продиктуешь. */
export function cleanCode(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const code = raw.trim().toUpperCase();
  if (code.length < CODE_MIN || code.length > CODE_MAX) return undefined;
  for (const sign of code) if (!CODE_SIGNS.includes(sign)) return undefined;
  return code;
}

/**
 * СВОБОДНЫЙ КОД — СПРОСИВ БАЗУ, А НЕ ПАМЯТЬ ПРОЦЕССА.
 *
 * Сначала бросаем кости: пока столов сотни, первый же бросок попадает. Когда занято почти всё,
 * случайные броски перестают попадать — тогда идём подряд и находим дырку. `undefined` — свободных
 * кодов нет вовсе, и это честный отказ, а не выдача чужого кода.
 */
export function freeCode(at: DatabaseSync = db(), taken2?: (code: string) => boolean): string | undefined {
  const taken = at.prepare(`SELECT code FROM rooms WHERE code IS NOT NULL`).all() as { code: string }[];
  if (taken.length >= CODE_SPACE) return undefined;
  const busy = new Set(taken.map((one) => one.code));
  for (let tries = 0; tries < 200; tries++) {
    const code = randomCode();
    if (!busy.has(code) && !taken2?.(code)) return code;
  }
  return undefined;
}

/** Свободен ли названный код прямо сейчас. Занятый — это живая чужая комната, и он не отдаётся. */
export function codeIsFree(code: string, at: DatabaseSync = db()): boolean {
  return roomByCode(code, at) === undefined;
}

export interface NewRoom {
  readonly id: string;
  readonly game: string;
  readonly title?: string | null;
  readonly ownerAccount?: string | null;
  readonly visibility?: Visibility;
  readonly admission?: Admission;
  readonly seats?: number | null;
  readonly mode?: Mode;
  readonly forever?: boolean;
  /** Код, названный человеком. Занятый или кривой — комната получит выданный. */
  readonly code?: string | undefined;
  readonly now?: number;
}

/** Завести комнату и выдать ей код. Хозяин сразу становится её членом с ролью `owner`. */
export function insertRoom(one: NewRoom, at: DatabaseSync = db()): RoomRow | undefined {
  const asked = one.code ? cleanCode(one.code) : undefined;
  const code = asked && codeIsFree(asked, at) ? asked : freeCode(at);
  if (!code) return undefined;
  const now = one.now ?? Date.now();
  at.prepare(
    `INSERT INTO rooms (id, code, game, title, owner_account, visibility, admission, transport,
      seats, created_at, alive_at, closed_at, mode, forever)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'server', ?, ?, ?, NULL, ?, ?)`,
  ).run(
    one.id,
    code,
    one.game,
    one.title ?? null,
    one.ownerAccount ?? null,
    one.visibility ?? "public",
    one.admission ?? "code",
    one.seats ?? null,
    now,
    now,
    one.mode ?? "free",
    one.forever ? 1 : 0,
  );
  if (one.ownerAccount) addMember(one.id, one.ownerAccount, "owner", now, at);
  return roomById(one.id, at);
}

/** Запомнить идущую сессию (или забыть её, когда все вышли). */
export function setSession(id: string, sessionId: string | null, at: DatabaseSync = db()): void {
  at.prepare(`UPDATE rooms SET session_id = ? WHERE id = ?`).run(sessionId, id);
}

export function roomById(id: string, at: DatabaseSync = db()): RoomRow | undefined {
  return toRoom(at.prepare(`${SELECT} WHERE id = ?`).get(id) as RawRoom | undefined);
}

/** Живая комната по коду. Закрытая не находится: её код уже `NULL` и принадлежит кому-то другому. */
export function roomByCode(code: string, at: DatabaseSync = db()): RoomRow | undefined {
  return toRoom(at.prepare(`${SELECT} WHERE code = ? AND closed_at IS NULL`).get(code) as RawRoom | undefined);
}

/** Комната жива — отметить это. По отметке список сортируется, а мёртвые видны как мёртвые. */
export function touchRoom(id: string, now = Date.now(), at: DatabaseSync = db()): void {
  at.prepare(`UPDATE rooms SET alive_at = ? WHERE id = ? AND closed_at IS NULL`).run(now, id);
}

/** Закрыть комнату насовсем. Код отпускается ровно здесь и больше нигде. */
export function closeRoom(id: string, now = Date.now(), at: DatabaseSync = db()): void {
  at.prepare(`UPDATE rooms SET closed_at = ?, code = NULL WHERE id = ? AND closed_at IS NULL`).run(now, id);
}

export interface RoomSearch {
  readonly game?: string;
  /** Кому показываем. Скрытые не показываются никому, кроме своих. */
  readonly limit?: number;
}

/** Что видно в поиске: живые, публичные, свежие сверху. */
export function findRooms(search: RoomSearch = {}, at: DatabaseSync = db()): RoomRow[] {
  const where = ["closed_at IS NULL", "visibility = 'public'"];
  const args: unknown[] = [];
  if (search.game) {
    where.push("game = ?");
    args.push(search.game);
  }
  const rows = at
    .prepare(`${SELECT} WHERE ${where.join(" AND ")} ORDER BY alive_at DESC LIMIT ?`)
    .all(...(args as never[]), search.limit ?? 50) as unknown as RawRoom[];
  return rows.map((raw) => toRoom(raw)!);
}

/** Мои комнаты: где я хозяин или состою. Скрытые тоже — они мои. */
export function roomsOfAccount(accountId: string, at: DatabaseSync = db()): RoomRow[] {
  const rows = at
    .prepare(
      `${SELECT} WHERE closed_at IS NULL AND (owner_account = ?
         OR id IN (SELECT room_id FROM room_members WHERE account_id = ?))
       ORDER BY alive_at DESC`,
    )
    .all(accountId, accountId) as unknown as RawRoom[];
  return rows.map((raw) => toRoom(raw)!);
}

export interface MemberRow {
  readonly accountId: string;
  readonly role: Role;
  readonly joinedAt: number;
}

export function addMember(
  roomId: string,
  accountId: string,
  role: Role = "player",
  now = Date.now(),
  at: DatabaseSync = db(),
): void {
  at.prepare(
    `INSERT INTO room_members (room_id, account_id, role, joined_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(room_id, account_id) DO NOTHING`,
  ).run(roomId, accountId, role, now);
}

/**
 * Выписать человека из комнаты. ХОЗЯИНА ВЫПИСАТЬ НЕЛЬЗЯ: вечная комната принадлежит ему, и стол без
 * владельца — это стол, который некому закрыть.
 */
export function removeMember(roomId: string, accountId: string, at: DatabaseSync = db()): boolean {
  const room = roomById(roomId, at);
  if (room?.ownerAccount === accountId) return false;
  at.prepare(`DELETE FROM room_members WHERE room_id = ? AND account_id = ?`).run(roomId, accountId);
  return true;
}

export function membersOf(roomId: string, at: DatabaseSync = db()): MemberRow[] {
  const rows = at
    .prepare(`SELECT account_id, role, joined_at FROM room_members WHERE room_id = ? ORDER BY joined_at`)
    .all(roomId) as { account_id: string; role: string; joined_at: number }[];
  return rows.map((raw) => ({ accountId: raw.account_id, role: raw.role as Role, joinedAt: raw.joined_at }));
}

export function roleOf(roomId: string, accountId: string, at: DatabaseSync = db()): Role | undefined {
  const raw = at
    .prepare(`SELECT role FROM room_members WHERE room_id = ? AND account_id = ?`)
    .get(roomId, accountId) as { role: string } | undefined;
  return raw?.role as Role | undefined;
}
