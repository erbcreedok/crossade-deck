// СТОЛЫ, КАК ИХ ВИДИТ ЭКРАН: открыть, найти, сесть по коду, закрыть свой.
//
// Комната здесь — вечная запись на сервере, а не процесс: она переживает пустоту вместе со своим
// кодом. Поэтому у звонящего два разных вопроса, и оба честные: «есть ли такая комната» и «сколько
// человек за ней сейчас».

import { serverUrl } from "./server.js";

/** Кто ВИДИТ комнату в списке. */
export type Visibility = "public" | "friends" | "hidden";
/** Кого в неё ПУСКАЮТ. */
export type Admission = "open" | "code" | "invite";
/** Кто в комнате решает: вольница, совет, вече. Режим комнаты, а не роль. */
export type Mode = "free" | "council" | "assembly";
/** В какой группе списка стоит комната. Свои — первыми. */
export type RoomGroup = "mine" | "forever" | "friends" | "public";

/** Человек за столом — лицом и цветом, а не номером. */
export interface PersonAtTable {
  readonly name: string;
  readonly color: string | null;
  readonly away?: boolean;
}

export interface RoomCard {
  readonly room: string;
  readonly code: string | null;
  readonly game: string;
  readonly title: string | null;
  readonly seats: number | null;
  readonly visibility: Visibility;
  readonly admission: Admission;
  readonly mode: Mode;
  /** Переживёт ли стол уход последнего. */
  readonly forever: boolean;
  readonly createdAt: number;
  /** Как зовут хозяина. «Стол Марата» — это код плюс это имя. */
  readonly owner: string | null;
  readonly people: readonly PersonAtTable[];
  /** Сколько стульев занято и сколько из них сейчас на связи. */
  readonly taken: number;
  readonly online: number;
  readonly group?: RoomGroup;
  /** Держится ли за мной стул за этим столом. */
  readonly mySeat?: boolean;
  /** Идущая сейчас сессия. Её отсутствие значит «стол стоит, за ним никого». */
  readonly roomId?: string;
  readonly players?: number;
  /** Мой ли это стол — отвечает только список своих комнат. */
  readonly own?: boolean;
}

export interface OpenRoomOptions {
  readonly game: string;
  readonly seats?: number;
  readonly by?: string;
  readonly title?: string;
  readonly visibility?: Visibility;
  readonly admission?: Admission;
  readonly mode?: Mode;
  readonly forever?: boolean;
  /** Код, названный человеком. Занятый или кривой — сервер выдаст свой. */
  readonly code?: string;
}

async function json<T>(res: Response): Promise<T | undefined> {
  if (!res.ok) return undefined;
  return (await res.json()) as T;
}

/** Открыть стол. `undefined` — сервер не смог (свободных кодов нет или он недоступен). */
export async function openRoom(options: OpenRoomOptions): Promise<RoomCard | undefined> {
  try {
    const res = await fetch(`${serverUrl()}/rooms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
    return await json<RoomCard>(res);
  } catch {
    return undefined;
  }
}

/**
 * ЧТО ЗА СТОЛ ПРЯЧЕТСЯ ЗА КОДОМ — не садясь за него. `undefined` значит «стол закрылся», и это
 * ответ, который человеку надо ПОКАЗАТЬ: раньше ему молча открывали новый, и он сидел один.
 */
export async function peekRoom(code: string): Promise<RoomCard | undefined> {
  try {
    return await json<RoomCard>(await fetch(`${serverUrl()}/rooms/by-code/${encodeURIComponent(code)}`));
  } catch {
    return undefined;
  }
}

/**
 * СПИСОК СТОЛОВ, И СВОИ В НЁМ ЖЕ. `me` — чтобы сервер отметил, где держится мой стул: без него
 * пришлось бы вторым запросом собирать второй список, а два списка однажды разойдутся.
 */
export async function findRooms(game?: string, me?: string): Promise<RoomCard[]> {
  try {
    const ask = new URLSearchParams();
    if (game) ask.set("game", game);
    if (me) ask.set("me", me);
    const query = ask.toString() ? `?${ask}` : "";
    return (await json<RoomCard[]>(await fetch(`${serverUrl()}/rooms${query}`))) ?? [];
  } catch {
    return [];
  }
}

/** Мои комнаты — открытые мной и те, где я состою. Скрытые тоже: они мои. */
export async function myRooms(accountId: string): Promise<RoomCard[]> {
  try {
    return (await json<RoomCard[]>(await fetch(`${serverUrl()}/accounts/${accountId}/rooms`))) ?? [];
  } catch {
    return [];
  }
}

/** Закрыть свой стол. Ложь — сервер не дал (чужой стол или он недоступен). */
export async function closeRoom(room: string, by: string): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl()}/rooms/${encodeURIComponent(room)}?by=${encodeURIComponent(by)}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}
