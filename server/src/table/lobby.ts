// СПИСОК КОМНАТ СТОЛА — в памяти, и только в ней.
//
// Комната живёт ровно столько, сколько живёт этот процесс: перезапуск Colyseus — и столов нет. Это
// решение, а не недосмотр: писать их на диск значило бы обещать то, чего сервер на ноутбуке не
// сдержит. Бот узнаёт о перезапуске по маяку (новый `boot`) и сам говорит чатам, что их столы закрылись.
//
// Одна запись — одна комната: где она живёт в Telegram, как называется и — пока в ней кто-то
// был — сама комната Colyseus, чтобы закрыть её отсюда.

import type { Home, Person, RoomCard } from "./contract.js";

interface Entry {
  room: string;
  title: string;
  home: Home;
  by: string;
  createdAt: number;
  live?: { people: () => Person[]; close: () => void };
}

const rooms = new Map<string, Entry>();

export const DEFAULT_TITLE = "Стол";

const card = (e: Entry): RoomCard => ({
  room: e.room,
  title: e.title,
  home: e.home,
  people: e.live?.people() ?? [],
  createdAt: e.createdAt,
});

export function openEntry(room: string, home: Home, by: string, title?: string, now = Date.now()): RoomCard {
  const had = rooms.get(room);
  if (had) return card(had);
  const entry: Entry = { room, home, by, title: title?.trim() || DEFAULT_TITLE, createdAt: now };
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

export function roomsAt(home: Home): RoomCard[] {
  return [...rooms.values()]
    .filter((e) => (home.kind === "chat" ? e.home.kind === "chat" && e.home.chat === home.chat : e.home.kind === "inline" && e.home.message === home.message))
    .map(card);
}

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
  e.title = title.trim().slice(0, 48);
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

export function forgetAll(): void {
  rooms.clear();
}
