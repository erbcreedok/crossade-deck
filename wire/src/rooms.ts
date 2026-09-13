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
  /** Номер записи. `null` — стол только обещан: код уже в чьей-то переписке, комнаты ещё нет. */
  readonly room: string | null;
  readonly code: string | null;
  readonly game: string;
  readonly title: string | null;
  /** Сколько стульев за столом. `null` — столько, сколько велит игра. */
  readonly chairs: number | null;
  /** Сколько человек комната держит: игроки, зрители, админы и ушедшие. Не больше 32. */
  readonly capacity: number;
  /** Кем комната встречает нового: админом, игроком со стулом или зрителем. */
  readonly newcomer: Newcomer;
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
  /** Ждут ли за этим столом ИМЕННО МЕНЯ. Чужую очередь сервер не рассказывает. */
  readonly myTurn?: boolean;
  /** Идущая сейчас сессия. Её отсутствие значит «стол стоит, за ним никого». */
  readonly roomId?: string;
  readonly players?: number;
  /** Мой ли это стол — отвечает только список своих комнат. */
  readonly own?: boolean;
  /** За стол ещё никто не садился: он поднимется, когда по коду придут. */
  readonly waiting?: boolean;
}

export interface OpenRoomOptions {
  readonly game: string;
  readonly chairs?: number;
  readonly capacity?: number;
  readonly newcomer?: Newcomer;
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

/**
 * ДАЙ КОД ДО СТОЛА. Комнату зовут кодом, и он должен быть в руках раньше, чем стол открыт: его
 * отправляют другу, ещё не сев за него. Сервер тут же придерживает выданный за нами.
 */
export async function reserveCode(): Promise<string | undefined> {
  try {
    const res = await fetch(`${serverUrl()}/rooms/code`, { method: "POST" });
    return (await json<{ code: string }>(res))?.code;
  } catch {
    return undefined;
  }
}

/** Свободен ли код, который человек назвал сам. Спрашивается ДО создания, а не после. */
export async function codeIsFree(code: string): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl()}/rooms/code/${encodeURIComponent(code)}`);
    return (await json<{ free: boolean }>(res))?.free === true;
  } catch {
    return false;
  }
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

/**
 * КЕМ КОМНАТА ВСТРЕЧАЕТ НОВОГО. Хозяином родиться нельзя — он у стола уже есть; стул дальше выдаёт
 * панель людей, а это лишь то, с чем человек входит.
 */
export type Newcomer = "admin" | "player" | "spectator";

/** Роль человека в комнате. Те же слова, что у сервера: комната их и заводит. */
export type RoomRole = "owner" | "admin" | "player" | "spectator";

/** Что можно сделать с человеком за столом — как это разрешил сервер, его же словами. */
export interface RoomDeed {
  readonly deed: string;
  readonly label: string;
  /** Уклад требует голоса: та же кнопка, другое слово и другое последствие. */
  readonly vote: boolean;
}

/** ...и чего нельзя, с причиной: кнопка, пропавшая молча, читается как поломка. */
export interface RoomDenial {
  readonly deed: string;
  readonly label: string;
  readonly why: string;
}

/** Участник комнаты — тот, кто в ней числится, а не только тот, кто сейчас за столом. */
export interface RoomMember {
  /** Номер аккаунта. Пусто — за столом гость, которого сервер не знает по имени. */
  readonly account?: string;
  readonly name: string;
  readonly color: string | null;
  /** Лицо, как человек его выбрал. Пусто — рисуется первая буква имени. */
  readonly face?: string;
  readonly role: RoomRole;
  /**
   * МЕСТО В ИДУЩЕЙ ПАРТИИ, и только оно значит «за столом». `null` — человек в комнате числится, но
   * сейчас не сидит: роль у него при этом та же, что была.
   */
  readonly seat: string | null;
  /** Стул держится, человека за ним нет. Бывает только у сидящего. */
  readonly away?: boolean;
  /** Что Я могу сделать с ним — считает сервер, когда его спросили от моего лица. */
  readonly can?: readonly RoomDeed[];
  readonly cant?: readonly RoomDenial[];
  /**
   * САМ СТОЛ — сколько за ним стульев и вправе ли я поставить ещё. Ответ про МЕБЕЛЬ, одинаковый в
   * каждой строке: он про спрашивающего, а не про того, чья это строка.
   */
  readonly table?: { readonly chairs?: number; readonly mayAddChair?: boolean; readonly whyNoChair?: string };
}

/**
 * КТО ЧИСЛИТСЯ ЗА СТОЛОМ — по коду комнаты или по её номеру.
 *
 * Не то же, что люди сессии: те живут, пока идёт игра. Здесь вся комната — с ролями, со зрителями
 * и с теми, кого сейчас нет за экраном. Пустой список значит «не спросилось»: стол, которого нет,
 * и молчащий сервер отвечают одинаково, и экран в обоих случаях остаётся при лицах сессии.
 */
export async function roomRoster(room: string, me?: string): Promise<RoomMember[]> {
  try {
    // ОТ ЧЬЕГО ЛИЦА СПРАШИВАЮТ — от этого зависит, какие кнопки вернутся: права считает сервер.
    const who = me ? `?me=${encodeURIComponent(me)}` : "";
    return (await json<RoomMember[]>(await fetch(`${serverUrl()}/rooms/${encodeURIComponent(room)}/roster${who}`))) ?? [];
  } catch {
    return [];
  }
}

/**
 * ПЕРЕНАСТРОИТЬ СТОЛ — стулья, вместимость, кем встречают нового. Ставится при создании и
 * переставляется потом: стол живёт дольше, чем разговор, ради которого его завели. `undefined` —
 * сервер не дал (чужой стол) или не ответил.
 */
export async function reconfigureRoom(
  room: string,
  by: string,
  patch: { chairs?: number; capacity?: number; newcomer?: Newcomer },
): Promise<RoomCard | undefined> {
  try {
    const res = await fetch(`${serverUrl()}/rooms/${encodeURIComponent(room)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ by, ...patch }),
    });
    return await json<RoomCard>(res);
  } catch {
    return undefined;
  }
}
