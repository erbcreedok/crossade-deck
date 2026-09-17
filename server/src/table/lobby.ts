// СПИСОК КОМНАТ СТОЛА — в памяти, и только в ней.
//
// Комната живёт ровно столько, сколько живёт этот процесс: перезапуск Colyseus — и столов нет. Это
// решение, а не недосмотр: писать их на диск значило бы обещать то, чего сервер на ноутбуке не
// сдержит. Бот узнаёт о перезапуске по маяку (новый `boot`) и сам говорит чатам, что их столы закрылись.
//
// Одна запись — одна комната: где она живёт в Telegram, как называется и — пока в ней кто-то
// был — сама комната Colyseus, чтобы закрыть её отсюда.

import type { Home, Person, RoomCard, RunResult, TableCommand } from "./contract.js";
import { DEFAULT_DESK, deskCrew, deskName, isDesk } from "./desks.js";
import { retitled, ROOM_WORD, titleFrom, uniqueTitle } from "./names.js";
import { DEFAULT_CREW, isCrew } from "./crews.js";

interface Entry {
  room: string;
  title: string;
  /** РОД СТОЛА — имя конфига правил (`desks.ts`). Записан при открытии и живёт с комнатой. */
  kind: string;
  /** НАБОР КРУПЬЕ (`crews.ts`) — отдельно от рода: игра его только предлагает. */
  crew: string;
  /** Кому ВЫДАН распорядитель. Хозяина здесь нет: он хозяин по рождению комнаты. */
  admins: string[];
  home: Home;
  by: string;
  createdAt: number;
  live?: { people: () => Person[]; close: () => void; run?: (by: string, command: TableCommand) => Promise<RunResult>; claim?: (by: string) => void; recast?: (kind: string) => void; recrew?: (crew: string) => void; admins?: (keys: string[]) => void };
}

const rooms = new Map<string, Entry>();

export const DEFAULT_TITLE = ROOM_WORD;

/** Имена всех живых комнат — по ним и держится уникальность. Себя (при переименовании) не считаем. */
const takenTitles = (except?: string): string[] => [...rooms.values()].filter((e) => e.room !== except).map((e) => e.title);

const card = (e: Entry): RoomCard => ({
  room: e.room,
  title: e.title,
  kind: e.kind,
  crew: e.crew,
  admins: [...e.admins],
  by: e.by,
  home: e.home,
  people: e.live?.people() ?? [],
  createdAt: e.createdAt,
});

export function openEntry(room: string, home: Home, by: string, title?: string, now = Date.now(), kind: string = DEFAULT_DESK, crew?: string): RoomCard {
  const had = rooms.get(room);
  if (had) {
    // ХОЗЯИН ВЕРНУЛСЯ К СВОЕЙ КОМНАТЕ. Её мог завести вошедший (после перезапуска сервера) — тогда она
    // безымянная и ничья; бот приходит следом и забирает своё: имя, дом и права админа.
    if (had.by === "" && by) {
      had.by = by;
      had.home = home;
      if (title?.trim()) had.title = uniqueTitle(title.trim(), takenTitles(room));
      had.live?.claim?.(by);
    }
    return card(had);
  }
  // Имя — из просьбы, иначе по чату, иначе случайное; и всегда такое, какого у живых комнат ещё нет.
  const desk = isDesk(kind) ? kind : DEFAULT_DESK;
  const entry: Entry = {
    room,
    home,
    by,
    kind: desk,
    admins: [],
    crew: isCrew(crew) ? crew : (deskCrew(desk) ?? DEFAULT_CREW),
    title: uniqueTitle(title?.trim() || titleFrom(deskName(desk), home.kind === "chat" ? home.chatTitle : undefined), takenTitles()),
    createdAt: now,
  };
  rooms.set(room, entry);
  return card(entry);
}

export const findEntry = (room: string): RoomCard | undefined => {
  const e = rooms.get(room);
  return e && card(e);
};

export const titleOf = (room: string): string => rooms.get(room)?.title ?? DEFAULT_TITLE;

/** Кто открыл комнату — ключ человека (`tg:<id>`). Он админ стола. Комната, открытая входом, — ничья. */
export const creatorOf = (room: string): string | null => rooms.get(room)?.by || null;

/** Род стола этой комнаты. Комнаты нет — песочница: стол всё равно откроется. */
export const kindOf = (room: string): string => rooms.get(room)?.kind ?? DEFAULT_DESK;

/** Набор крупье этой комнаты. */
export const crewKind = (room: string): string => rooms.get(room)?.crew ?? DEFAULT_CREW;

export function roomsAt(home: Home): RoomCard[] {
  return [...rooms.values()]
    .filter((e) => (home.kind === "chat" ? e.home.kind === "chat" && e.home.chat === home.chat : e.home.kind === "inline" && e.home.message === home.message))
    .map(card);
}

/**
 * ВСЕ СТОЛЫ ЭТОГО ЧЕЛОВЕКА — где бы они ни жили: и те, что он открыл (там он админ), и те, за которыми
 * он сидит. Из лички человек управляет своими и просто заходит в чужие.
 */
export const roomsBy = (by: string): RoomCard[] =>
  [...rooms.values()].filter((e) => e.by === by || (e.live?.people() ?? []).some((p) => p.key === by)).map(card);

/** Inline-карточка стала сообщением — теперь известно, где комната живёт. */
export function rehome(room: string, home: Home): RoomCard | undefined {
  const e = rooms.get(room);
  if (!e) return undefined;
  e.home = home;
  return card(e);
}

/**
 * СМЕНИТЬ РОД СТОЛА. Стол при этом не разгоняется: живая комната меняет правила на ходу, а карты,
 * руки и стулья остаются как были (`Table.recast`). Незнакомый род — отказ, а не тихая песочница:
 * здесь его выбирает человек кнопкой, а не бот из будущей версии.
 */
export function recast(room: string, kind: string): RoomCard | undefined {
  const e = rooms.get(room);
  if (!e || !isDesk(kind)) return undefined;
  // ИМЯ КОМНАТЫ ИДЁТ ЗА ИГРОЙ: «Песочница. Алый обоз» после смены рода — «Крестовый. Алый обоз».
  // Имя, данное человеком, не трогаем: он назвал комнату сам, и это важнее порядка.
  e.title = uniqueTitle(retitled(e.title, deskName(e.kind), deskName(kind)), takenTitles(room));
  e.kind = kind;
  e.live?.recast?.(kind);
  return card(e);
}

/**
 * ВЫДАТЬ ИЛИ ЗАБРАТЬ РАСПОРЯДИТЕЛЯ. Может только ХОЗЯИН комнаты — тот, кто её открыл.
 *
 * Распорядитель ролей не раздаёт нарочно: иначе комнату отбирают у хозяина его же кнопкой. Себя
 * хозяин в список не вносит: он и так хозяин, и снять это нельзя.
 */
export function setAdmin(room: string, by: string, key: string, on: boolean): RoomCard | undefined | "forbidden" {
  const e = rooms.get(room);
  if (!e) return undefined;
  if (by !== e.by) return "forbidden";
  if (key === e.by) return card(e);
  const keys = new Set(e.admins);
  if (on) keys.add(key);
  else keys.delete(key);
  e.admins = [...keys];
  e.live?.admins?.(e.admins);
  return card(e);
}

/** Сменить набор крупье. Незнакомый набор — отказ: его выбирает человек кнопкой. */
export function recrew(room: string, crew: string): RoomCard | undefined {
  const e = rooms.get(room);
  if (!e || !isCrew(crew)) return undefined;
  e.crew = crew;
  e.live?.recrew?.(crew);
  return card(e);
}

export function rename(room: string, title: string): RoomCard | undefined {
  const e = rooms.get(room);
  if (!e || !title.trim()) return undefined;
  e.title = uniqueTitle(title.trim(), takenTitles(room));
  return card(e);
}

/** Кому эта комната принадлежит: закрыть её может только он. */
export const ownerOf = (room: string): string | null => rooms.get(room)?.by || null;

/** Кому в этой комнате выдан распорядитель. */
export const adminsOf = (room: string): string[] => [...(rooms.get(room)?.admins ?? [])];

export function closeEntry(room: string): boolean {
  const e = rooms.get(room);
  if (!e) return false;
  rooms.delete(room);
  e.live?.close();
  return true;
}

/** Комната Colyseus встала под запись — или ушла из неё. */
export function attach(room: string, live: Entry["live"]): void {
  const e = rooms.get(room);
  if (e) e.live = live;
}

/** Команду — живой комнате. Комнаты нет (стол ещё никто не открывал) — `empty`, записи нет — `undefined`. */
export async function runIn(room: string, by: string, command: TableCommand): Promise<RunResult | undefined> {
  const e = rooms.get(room);
  if (!e) return undefined;
  if (!e.live?.run) return { error: "empty" };
  return e.live.run(by, command);
}

export function forgetAll(): void {
  rooms.clear();
}
