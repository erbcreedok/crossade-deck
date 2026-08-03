// Подключение к комнате. Форма перенесена из client/src/colyseus.ts + retryJoin.ts (та же идея
// «первая попытка будит спящий сервер»), реализация своя.
//
// Первый create()/join() бьётся об ещё не проснувшуюся машину — на бесплатных хостингах она
// засыпает при простое, и HTTP-матчмейкинг успевает пройти, а WebSocket рвётся («socket hang
// up»). Повтор через паузу почти всегда проходит. Полезно и без спящего сервера — мобильная
// сеть роняет первый коннект регулярно.

import { Client, Room } from "colyseus.js";
import { serverUrl } from "./runtimeConfig";

export interface JoinOptions {
  accountId?: string;
  name: string;
  deckType?: "36" | "52";
  isPrivate?: boolean;
}

const CARD_ROOM = "card_room";
const TEST_ROOM = "test_room";

// Расписание попыток: пауза (в мс) ПЕРЕД попыткой с данным номером (считая с 0 — первая попытка
// без паузы). Растёт, а не одна и та же величина — если сервер ещё не проснулся после 1с, ждать
// то же самое ещё раз бессмысленно.
const RETRY_DELAYS_MS = [0, 1000, 3000];

export function delaysFor(attempt: number): number {
  return RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)];
}

export interface RetryOptions {
  attempts?: number;
  sleep?: (ms: number) => Promise<void>;
}

const DEFAULT_ATTEMPTS = 3;
const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(action: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const attempts = Math.max(1, opts.attempts ?? DEFAULT_ATTEMPTS);
  const sleep = opts.sleep ?? realSleep;

  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await sleep(delaysFor(i));
    try {
      return await action();
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

// Один Client на модуль: colyseus.js мультиплексирует join/create поверх одного соединения к
// матчмейкеру, заводить второй Client под каждый вызов незачем.
let sharedClient: Client | undefined;
function client(): Client {
  if (!sharedClient) sharedClient = new Client(serverUrl());
  return sharedClient;
}

export async function joinCardRoom(opts: JoinOptions): Promise<Room> {
  return withRetry(() => client().create(CARD_ROOM, opts));
}

// Тестовая комната: за столом сразу боты (сервер, TestRoom) — площадка для проверки стола без
// живых игроков.
export async function joinTestRoom(opts: JoinOptions): Promise<Room> {
  return withRetry(() => client().create(TEST_ROOM, opts));
}

export async function joinRoomById(roomId: string, opts: JoinOptions): Promise<Room> {
  return withRetry(() => client().joinById(roomId, opts));
}
