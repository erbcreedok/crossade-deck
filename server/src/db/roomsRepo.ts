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

/**
 * СКОЛЬКО ЧЕЛОВЕК КОМНАТА ДЕРЖИТ САМОЕ БОЛЬШЕЕ. Считаются все, кто в ней состоит: игроки, зрители,
 * админы и те, кого сейчас нет, — стул тут ни при чём, стульев может быть и больше, и меньше.
 */
export const ROOM_LIMIT = 32;

/** Названная вместимость, загнанная в предел: больше тридцати двух комната не держит. */
export function capacityOf(asked?: number | null): number {
  if (typeof asked !== "number" || !Number.isFinite(asked)) return ROOM_LIMIT;
  return Math.max(1, Math.min(ROOM_LIMIT, Math.floor(asked)));
}

/**
 * УРОВЕНЬ КОНТРОЛЯ В КОМНАТЕ — и только он. Их три: хозяин, админ, игрок.
 *
 * ЗРИТЕЛЬ СЮДА НЕ ВХОДИТ: «зритель» — это не уровень, а игрок БЕЗ СТУЛА. Стул — вторая, отдельная
 * ось: хозяин без стула не перестаёт быть хозяином (он ведёт стол, за которым не играет), а игрок,
 * лишённый стула, остаётся в комнате смотреть. Пока обе оси жили одним полем, «посадить» значило
 * повысить, а «лишить стула» — разжаловать.
 */
export const ROLES = ["owner", "admin", "player"] as const;

/**
 * КЕМ КОМНАТА ВСТРЕЧАЕТ НОВОГО. Хозяином родиться нельзя — он у стола уже есть, и второго не бывает.
 */
export const NEWCOMERS = ["admin", "player"] as const;
export type Newcomer = (typeof NEWCOMERS)[number];

/** Записанное в базе слово, если оно из списка; иначе — «игрок», с которым стол и жил до сих пор. */
export function newcomerOf(raw: unknown): Newcomer {
  return (NEWCOMERS as readonly string[]).includes(raw as string) ? (raw as Newcomer) : "player";
}

/** Записанная роль, если она из списка. «Зритель» из прежней схемы — это игрок без стула. */
export function roleFromDb(raw: unknown): Role {
  return (ROLES as readonly string[]).includes(raw as string) ? (raw as Role) : "player";
}
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
  /** Сколько стульев за этим столом. `null` — столько, сколько велит игра. */
  readonly chairs: number | null;
  /** Сколько ЛЮДЕЙ комната держит — игроков, зрителей, админов и ушедших. Не больше 32. */
  readonly capacity: number;
  /** С каким уровнем входит новый: админом или игроком. Хозяин у комнаты уже есть. */
  readonly newcomer: Newcomer;
  /** Даёт ли комната новому стул. Нет — он входит смотреть, и это не понижение уровня. */
  readonly newcomerChair: boolean;
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
  chairs: number | null;
  capacity: number;
  newcomer: string;
  newcomer_chair: number;
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
    chairs: raw.chairs,
    capacity: raw.capacity,
    newcomer: newcomerOf(raw.newcomer),
    newcomerChair: raw.newcomer_chair !== 0,
    createdAt: raw.created_at,
    aliveAt: raw.alive_at,
    closedAt: raw.closed_at,
    sessionId: raw.session_id,
    mode: raw.mode as Mode,
    forever: raw.forever === 1,
  };
}

const SELECT = `SELECT id, code, game, title, owner_account, visibility, admission, transport,
  chairs, capacity, newcomer, newcomer_chair, created_at, alive_at, closed_at, session_id, mode, forever FROM rooms`;

/**
 * ВЫДАННЫЙ КОД — ЧЕТЫРЕ ЦИФРЫ, и ничего кроме цифр.
 *
 * Его диктуют вслух и набирают с чужого экрана; цифры называются однозначно на любом языке, а
 * буквы — нет («си» это C или S, «а» латинская или кириллическая). Человеку, который код ВЫБРАЛ
 * сам, буквы разрешены: он их и придумал, и произносит своими словами.
 */
export const CODE_DIGITS = "0123456789";
export const CODE_LENGTH = 4;
/** Свой код: буквы и цифры, от двух знаков до восьми. */
export const CODE_MIN = 2;
export const CODE_MAX = 8;

const CODE_SPACE = CODE_DIGITS.length ** CODE_LENGTH;

function randomCode(): string {
  let code = "";
  for (let n = 0; n < CODE_LENGTH; n++) code += CODE_DIGITS[Math.floor(Math.random() * CODE_DIGITS.length)];
  return code;
}

/**
 * Код, названный человеком: латинские буквы и цифры, от двух знаков до восьми. Пробелы и всё
 * остальное — не код: его пересылают строкой в чат и набирают руками.
 */
export function cleanCode(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const code = raw.trim().toUpperCase();
  if (code.length < CODE_MIN || code.length > CODE_MAX) return undefined;
  return /^[A-Z0-9]+$/.test(code) ? code : undefined;
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
  const busy = new Set(taken.map((one) => one.code));
  const gone = (code: string): boolean => busy.has(code) || taken2?.(code) === true;
  for (let tries = 0; tries < 200; tries++) {
    const code = randomCode();
    if (!gone(code)) return code;
  }
  for (let n = 0; n < CODE_SPACE; n++) {
    const code = n.toString().padStart(CODE_LENGTH, "0");
    if (!gone(code)) return code;
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
  readonly chairs?: number | null;
  readonly capacity?: number | null;
  readonly newcomer?: Newcomer;
  readonly newcomerChair?: boolean;
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
      chairs, capacity, newcomer, newcomer_chair, created_at, alive_at, closed_at, mode, forever)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'server', ?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
  ).run(
    one.id,
    code,
    one.game,
    one.title ?? null,
    one.ownerAccount ?? null,
    one.visibility ?? "public",
    one.admission ?? "code",
    one.chairs ?? null,
    capacityOf(one.capacity),
    one.newcomer ?? "player",
    one.newcomerChair === false ? 0 : 1,
    now,
    now,
    one.mode ?? "free",
    one.forever ? 1 : 0,
  );
  if (one.ownerAccount) addMember(one.id, one.ownerAccount, "owner", true, now, at);
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

/**
 * ПЕРЕНАСТРОИТЬ СТОЛ. Сегодня это стулья, вместимость и то, кем входит новый: всё, что хозяин
 * ставил при создании, он вправе переставить и потом — стол живёт дольше, чем разговор о нём.
 */
export function setRoomConfig(
  id: string,
  patch: { chairs?: number | null; capacity?: number; newcomer?: Newcomer; newcomerChair?: boolean },
  at: DatabaseSync = db(),
): RoomRow | undefined {
  const sets: string[] = [];
  const values: (string | number | null)[] = [];
  if (patch.chairs !== undefined) (sets.push("chairs = ?"), values.push(patch.chairs));
  if (patch.capacity !== undefined) (sets.push("capacity = ?"), values.push(capacityOf(patch.capacity)));
  if (patch.newcomer !== undefined) (sets.push("newcomer = ?"), values.push(patch.newcomer));
  if (patch.newcomerChair !== undefined) (sets.push("newcomer_chair = ?"), values.push(patch.newcomerChair ? 1 : 0));
  if (sets.length > 0) {
    at.prepare(`UPDATE rooms SET ${sets.join(", ")} WHERE id = ? AND closed_at IS NULL`).run(...values, id);
  }
  return roomById(id, at);
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
  /** Положен ли ему стул за этим столом. Ложь — он в комнате, но смотрит. */
  readonly chair: boolean;
  readonly joinedAt: number;
}

export function addMember(
  roomId: string,
  accountId: string,
  role: Role = "player",
  chair = true,
  now = Date.now(),
  at: DatabaseSync = db(),
): void {
  at.prepare(
    `INSERT INTO room_members (room_id, account_id, role, chair, joined_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(room_id, account_id) DO NOTHING`,
  ).run(roomId, accountId, role, chair ? 1 : 0, now);
}

/**
 * ПОЛОЖЕН ЛИ ЧЕЛОВЕКУ СТУЛ ЗА ЭТИМ СТОЛОМ. Уровень при этом не трогается: лишили стула — не
 * разжаловали, посадили — не повысили.
 */
export function setChair(roomId: string, accountId: string, chair: boolean, at: DatabaseSync = db()): boolean {
  const done = at
    .prepare(`UPDATE room_members SET chair = ? WHERE room_id = ? AND account_id = ?`)
    .run(chair ? 1 : 0, roomId, accountId);
  return Number(done.changes) > 0;
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
    .prepare(`SELECT account_id, role, chair, joined_at FROM room_members WHERE room_id = ? ORDER BY joined_at`)
    .all(roomId) as { account_id: string; role: string; chair: number; joined_at: number }[];
  return rows.map((raw) => ({
    accountId: raw.account_id,
    role: roleFromDb(raw.role),
    chair: raw.chair !== 0,
    joinedAt: raw.joined_at,
  }));
}

/**
 * ПЕРЕПИСАТЬ РОЛЬ УЧАСТНИКА. Хозяина не трогает: комната принадлежит ему, и роль ниже хозяйской
 * оставила бы стол без того, кто вправе его закрыть.
 */
export function setRole(roomId: string, accountId: string, role: Role, at: DatabaseSync = db()): boolean {
  const room = roomById(roomId, at);
  if (room?.ownerAccount === accountId) return false;
  const done = at
    .prepare(`UPDATE room_members SET role = ? WHERE room_id = ? AND account_id = ?`)
    .run(role, roomId, accountId);
  return Number(done.changes) > 0;
}

/** Передать комнату другому. Старый хозяин остаётся админом: стол без него не должен осиротеть. */
export function passRoom(roomId: string, toAccount: string, at: DatabaseSync = db()): boolean {
  const room = roomById(roomId, at);
  if (!room || room.ownerAccount === toAccount) return false;
  at.prepare(`UPDATE rooms SET owner_account = ? WHERE id = ?`).run(toAccount, roomId);
  at.prepare(`UPDATE room_members SET role = 'owner' WHERE room_id = ? AND account_id = ?`).run(roomId, toAccount);
  if (room.ownerAccount) {
    at.prepare(`UPDATE room_members SET role = 'admin' WHERE room_id = ? AND account_id = ?`).run(roomId, room.ownerAccount);
  }
  return true;
}

export function roleOf(roomId: string, accountId: string, at: DatabaseSync = db()): Role | undefined {
  const raw = at
    .prepare(`SELECT role FROM room_members WHERE room_id = ? AND account_id = ?`)
    .get(roomId, accountId) as { role: string } | undefined;
  return raw === undefined ? undefined : roleFromDb(raw.role);
}
