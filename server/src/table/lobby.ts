// СПИСОК КОМНАТ СТОЛА. Работает из памяти, а переживает процесс через порт `LobbyKeep`.
//
// Комната принадлежит человеку, а не процессу: перезапуск и выкатка не должны отнимать у него стол.
// Каждое изменение записи тут же уходит в хранилище, а при старте список поднимается из него.
// Хранилища может не быть вовсе (тесты, стенд) — тогда список живёт, пока жив процесс.
//
// Одна запись — одна комната: где она живёт в Telegram, как называется и — пока в ней кто-то
// был — сама комната Colyseus, чтобы закрыть её отсюда.

import type { DeckSize, Home, Person, RoomCard, RunResult, SeatCard, TableCommand } from "./contract.js";
import type { Looked, Played } from "./bots/outside.js";
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
  live?: { people: () => Person[]; seats?: () => SeatCard[]; deck?: () => { size: DeckSize; jokers: boolean }; close: () => void; run?: (by: string, command: TableCommand) => Promise<RunResult>; look?: (by: string) => Looked; play?: (by: string, n: unknown) => Played; claim?: (by: string) => void; recast?: (kind: string) => void; recrew?: (crew: string) => void; admins?: (keys: string[]) => void };
}

const rooms = new Map<string, Entry>();

/** Куда список пишет себя. Что внутри строки, хранилище не знает. */
export interface LobbyKeep {
  card(room: string, json: string): void;
  drop(room: string): void;
  all(): { room: string; card: string }[];
  /** Слепок стола этой комнаты — непрозрачный JSON; пишется только комнате, у которой есть запись. */
  state(room: string, json: string): void;
  stateOf(room: string): string | null;
}

let keep: LobbyKeep | null = null;

/** Записать комнату как есть. Живая комната Colyseus в запись не входит: она принадлежит процессу. */
function save(e: Entry): void {
  if (!keep) return;
  const { live: _live, ...row } = e;
  try {
    keep.card(e.room, JSON.stringify(row));
  } catch (err) {
    // Беда хранилища не становится бедой стола: комната работает из памяти, как работала.
    console.error(`комната ${e.room} не записалась:`, err);
  }
}

/**
 * ПОДНЯТЬ СПИСОК ИЗ ХРАНИЛИЩА и дальше писать в него. Зовётся один раз при старте сервера. Битая строка
 * пропускается: одна испорченная запись не должна оставить без столов всех остальных.
 */
export function keepLobbyIn(store: LobbyKeep | null): number {
  keep = store;
  if (!store) return 0;
  let raised = 0;
  for (const row of store.all()) {
    try {
      const e = JSON.parse(row.card) as Entry;
      if (typeof e.room !== "string" || e.room !== row.room || typeof e.title !== "string" || !e.home) continue;
      if (rooms.has(e.room)) continue;
      rooms.set(e.room, { room: e.room, title: e.title, kind: isDesk(e.kind) ? e.kind : DEFAULT_DESK, crew: isCrew(e.crew) ? e.crew : DEFAULT_CREW, admins: Array.isArray(e.admins) ? e.admins.filter((k) => typeof k === "string") : [], home: e.home, by: typeof e.by === "string" ? e.by : "", createdAt: Number(e.createdAt) || Date.now() });
      raised += 1;
    } catch {
      // пропускаем
    }
  }
  return raised;
}

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
  seats: e.live?.seats?.() ?? [],
  deck: e.live?.deck?.() ?? { size: 36, jokers: false },
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
      save(had);
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
  save(entry);
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
  save(e);
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
  save(e);
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
  save(e);
  return card(e);
}

/** Сменить набор крупье. Незнакомый набор — отказ: его выбирает человек кнопкой. */
export function recrew(room: string, crew: string): RoomCard | undefined {
  const e = rooms.get(room);
  if (!e || !isCrew(crew)) return undefined;
  e.crew = crew;
  e.live?.recrew?.(crew);
  save(e);
  return card(e);
}

export function rename(room: string, title: string): RoomCard | undefined {
  const e = rooms.get(room);
  if (!e || !title.trim()) return undefined;
  e.title = uniqueTitle(title.trim(), takenTitles(room));
  save(e);
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
  try {
    keep?.drop(room);
  } catch (err) {
    console.error(`комната ${room} не стёрлась из хранилища:`, err);
  }
  e.live?.close();
  return true;
}

/** Комната Colyseus встала под запись — или ушла из неё. */
export function attach(room: string, live: Entry["live"]): void {
  const e = rooms.get(room);
  if (e) e.live = live;
}

/**
 * ВНЕШНЕМУ ИГРОКУ — ПОСМОТРЕТЬ. Комнаты нет или она не поднята в памяти — `undefined`: агент узнаёт
 * это как «стол ещё не открыт», а не как молчание.
 */
export function lookIn(room: string, by: string): Looked | undefined {
  return rooms.get(room)?.live?.look?.(by);
}

/** ВНЕШНЕМУ ИГРОКУ — СХОДИТЬ. Ход называется номером из списка, который дал `lookIn`. */
export function playIn(room: string, by: string, n: unknown): Played | undefined {
  return rooms.get(room)?.live?.play?.(by, n);
}

/** Команду — живой комнате. Комнаты нет (стол ещё никто не открывал) — `empty`, записи нет — `undefined`. */
export async function runIn(room: string, by: string, command: TableCommand): Promise<RunResult | undefined> {
  const e = rooms.get(room);
  if (!e) return undefined;
  if (!e.live?.run) return { error: "empty" };
  return e.live.run(by, command);
}

/** Слепок стола — в хранилище. Нет хранилища или комнату уже закрыли — не пишется. */
export function keepStateOf(room: string, json: string): void {
  if (!keep || !rooms.has(room)) return;
  try {
    keep.state(room, json);
  } catch (err) {
    console.error(`слепок комнаты ${room} не записался:`, err);
  }
}

export function keptStateOf(room: string): string | null {
  try {
    return keep?.stateOf(room) ?? null;
  } catch {
    return null;
  }
}

/** Забыть всё, что в памяти. Хранилище не трогается: так в тестах и выглядит перезапуск процесса. */
export function forgetAll(): void {
  rooms.clear();
}
