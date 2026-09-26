// МОИ КОМНАТЫ — список, с которого мини-апп начинается без ссылки на конкретный стол.
//
// ОСНОВАНИЯ — ТОЛЬКО ТО, ЧТО СТОЛ ЗНАЕТ САМ, без догадок об истории Telegram:
//   `owner`   — он открыл комнату (лобби: `by`);
//   `admin`   — ему выдан распорядитель (лобби: `admins`);
//   `visited` — он в ней сидел или её открывал (журнал: `join`, `room.open`);
//   `chat`    — комната живёт в чате, где он уже бывал за столом: чат известен по комнатам, в которых
//               он сидел, — других чатов человека стол не знает и не угадывает.
// Одна комната — одна строка со всеми своими основаниями.
//
// ЗАКРЫТАЯ КОМНАТА НЕ ДЕЙСТВУЮЩАЯ: её нет в лобби, и сюда она попадает отдельным списком — только ради
// записей. Войти в неё нельзя и оживить отсюда тоже: список лишь читает лобби и журнал.

import type { Home, RoomCard } from "./contract.js";

export type MyWhy = "owner" | "admin" | "visited" | "chat";

export interface MyRoom {
  room: string;
  title: string;
  kind: string;
  why: MyWhy[];
  /** Имя чата, где комната живёт, если оно известно. */
  chat: string | null;
  /** Кто за столом сейчас — люди, без ботов. */
  now: string[];
  /** Когда он там был последний раз; для живой, где его не было, — когда комнату открыли. */
  lastAt: number;
}

export interface MyClosed {
  room: string;
  title: string;
  lastAt: number;
}

const chatOf = (home: Home | null | undefined): string | null => (home?.kind === "chat" ? home.chat : null);

/**
 * @param key      кто спрашивает (`tg:<id>`)
 * @param live     живые комнаты лобби
 * @param journal  комнаты из журнала, где он сидел или которые открыл, с последним разом
 * @param homeOf   где жила комната по журналу — для закрытых, которых лобби уже не знает
 * @param titleOf  имя закрытой комнаты по журналу
 */
export function myRooms(
  key: string,
  live: readonly RoomCard[],
  journal: readonly { room: string; last: number }[],
  homeOf: (room: string) => Home | null,
  titleOf: (room: string) => string | null,
): { rooms: MyRoom[]; closed: MyClosed[] } {
  const alive = new Map(live.map((one) => [one.room, one]));
  const been = new Map(journal.map((one) => [one.room, one.last]));
  // ЧАТЫ, ГДЕ ОН БЫВАЛ ЗА СТОЛОМ — по его же комнатам, живым и закрытым.
  const chats = new Set<string>();
  for (const room of been.keys()) {
    const chat = chatOf(alive.get(room)?.home ?? homeOf(room));
    if (chat) chats.add(chat);
  }
  for (const one of live) if (one.by === key || one.admins.includes(key)) {
    const chat = chatOf(one.home);
    if (chat) chats.add(chat);
  }

  const rooms: MyRoom[] = [];
  for (const one of live) {
    const why: MyWhy[] = [];
    if (one.by === key) why.push("owner");
    if (one.admins.includes(key)) why.push("admin");
    if (been.has(one.room) || one.people.some((p) => p.key === key)) why.push("visited");
    const chat = chatOf(one.home);
    if (chat && chats.has(chat) && why.length === 0) why.push("chat");
    if (why.length === 0) continue;
    rooms.push({
      room: one.room,
      title: one.title,
      kind: one.kind,
      why,
      chat: one.home.kind === "chat" ? (one.home.chatTitle ?? null) : null,
      now: one.people.filter((p) => !p.bot).map((p) => p.name),
      lastAt: been.get(one.room) ?? one.createdAt,
    });
  }
  rooms.sort((a, b) => b.lastAt - a.lastAt);
  const closed: MyClosed[] = [...been]
    .filter(([room]) => !alive.has(room))
    .map(([room, lastAt]) => ({ room, title: titleOf(room) ?? "Закрытый стол", lastAt }))
    .sort((a, b) => b.lastAt - a.lastAt);
  return { rooms, closed };
}
