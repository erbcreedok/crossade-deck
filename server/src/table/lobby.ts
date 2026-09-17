// СПИСОК КОМНАТ СТОЛА — в памяти, и только в ней.
//
// Комната живёт ровно столько, сколько живёт этот процесс: перезапуск Colyseus — и столов нет. Это
// решение, а не недосмотр: писать их на диск значило бы обещать то, чего сервер на ноутбуке не
// сдержит. Бот узнаёт о перезапуске по маяку (новый `boot`) и сам говорит чатам, что их столы закрылись.
//
// Одна запись — одна комната: где она живёт в Telegram, как называется и — пока в ней кто-то
// был — сама комната Colyseus, чтобы закрыть её отсюда.

import type { Home, Person, RoomCard, RunResult, TableCommand } from "./contract.js";
import { DEFAULT_DESK, isDesk } from "./desks.js";
import { titleFrom, uniqueTitle } from "./names.js";

interface Entry {
  room: string;
  title: string;
  /** РОД СТОЛА — имя конфига правил (`desks.ts`). Записан при открытии и живёт с комнатой. */
  kind: string;
  home: Home;
  by: string;
  createdAt: number;
  live?: { people: () => Person[]; close: () => void; run?: (by: string, command: TableCommand) => Promise<RunResult>; claim?: (by: string) => void };
}

const rooms = new Map<string, Entry>();

export const DEFAULT_TITLE = "Стол";

/** Имена всех живых комнат — по ним и держится уникальность. Себя (при переименовании) не считаем. */
const takenTitles = (except?: string): string[] => [...rooms.values()].filter((e) => e.room !== except).map((e) => e.title);

const card = (e: Entry): RoomCard => ({
  room: e.room,
  title: e.title,
  by: e.by,
  home: e.home,
  people: e.live?.people() ?? [],
  createdAt: e.createdAt,
});

export function openEntry(room: string, home: Home, by: string, title?: string, now = Date.now(), kind: string = DEFAULT_DESK): RoomCard {
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
  const entry: Entry = { room, home, by, kind: isDesk(kind) ? kind : DEFAULT_DESK, title: uniqueTitle(title?.trim() || titleFrom(home.kind === "chat" ? home.chatTitle : undefined), takenTitles()), createdAt: now };
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

export function rename(room: string, title: string): RoomCard | undefined {
  const e = rooms.get(room);
  if (!e || !title.trim()) return undefined;
  e.title = uniqueTitle(title.trim(), takenTitles(room));
  return card(e);
}

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
