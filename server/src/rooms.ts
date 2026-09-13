// КОМНАТЫ — ОДНО ОКНО ДЛЯ ВСЕГО СЕРВЕРА. Ниже него SQL (`db/roomsRepo.ts`), выше — только это.
//
// Комната вечна и принадлежит человеку; сессия Colyseus — то, что поднимается, когда за стол кто-то
// сел, и исчезает, когда все встали. Отсюда два разных вопроса, которые раньше были одним: «есть ли
// такая комната» (есть, пока её не закрыли) и «идёт ли там сейчас игра».

// ЧЕРЕЗ ПАКЕТ ЦЕЛИКОМ, А НЕ ИМЕНОВАННЫМ ИМПОРТОМ: `colyseus` — CommonJS, и `import { matchMaker }`
// собирается, проходит тесты и падает на живом сервере при первом же импорте модуля.
import colyseusPkg from "colyseus";

const { matchMaker } = colyseusPkg;
import { accountById } from "./db/accountsRepo.js";
import { hold, isHeld, promiseOf, release, type Promised } from "./codeHold.js";
import { getEmptyRoomTtlMs } from "./roomConfig.js";
import { forgetPeople } from "./roomPeople.js";
import {
  addMember,
  cleanCode,
  codeIsFree,
  freeCode,
  closeRoom,
  findRooms,
  insertRoom,
  roomByCode,
  roomById,
  roomsOfAccount,
  setSession,
  touchRoom,
  setRoomConfig,
  type Admission,
  type Mode,
  type Newcomer,
  type Role,
  type RoomRow,
  type Visibility,
} from "./db/roomsRepo.js";

export type { RoomRow } from "./db/roomsRepo.js";

/**
 * ПЕРЕНАСТРОИТЬ СТОЛ — стулья, вместимость, кем входит новый. Право спрашивается выше: настройка
 * принадлежит комнате, а кто ею распоряжается — правило комнаты, а не базы.
 */
export function reconfigure(
  roomId: string,
  patch: { chairs?: number | null; capacity?: number; newcomer?: Newcomer; newcomerChair?: boolean },
) {
  return setRoomConfig(roomId, patch);
}

/** Игры, под которые можно открыть стол. Список закрытый: опечатка — комната, которую не открыть. */
export const KIT_GAMES = ["cards", "chess", "nardy"] as const;
export type KitGame = (typeof KIT_GAMES)[number];

export function isKitGame(game: unknown): game is KitGame {
  return typeof game === "string" && (KIT_GAMES as readonly string[]).includes(game);
}

/**
 * СКОЛЬКО СТУЛЬЕВ У ЭТОЙ ИГРЫ ПО ЕЁ ПРАВИЛУ — и `undefined`, когда правила нет.
 *
 * За доской не бывает третьего места: в шахматах и нардах их всегда два, и это не настройка. В
 * карты играют вдвоём и вдесятером, поэтому стулья за карточным столом ставит хозяин, сколько
 * нужно, — до общего предела комнаты.
 */
const CHAIRS_BY_RULE: Partial<Record<KitGame, number>> = { chess: 2, nardy: 2 };

export function chairsAreFixed(game: string): number | undefined {
  return CHAIRS_BY_RULE[game as KitGame];
}

let counter = 0;

function newId(): string {
  counter += 1;
  return `room_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export interface OpenRoom {
  readonly game: string;
  /** Сколько стульев за столом. Пусто — столько, сколько велит игра. */
  readonly chairs?: number;
  /** Сколько человек комната держит: игроков, зрителей, админов и ушедших. Не больше 32. */
  readonly capacity?: number;
  /** С каким уровнем входит новый: админом или игроком. */
  readonly newcomer?: Newcomer;
  /** Даёт ли комната новому стул. */
  readonly newcomerChair?: boolean;
  readonly ownerAccount?: string;
  readonly title?: string;
  readonly visibility?: Visibility;
  readonly admission?: Admission;
  readonly mode?: Mode;
  readonly forever?: boolean;
  /** Код, названный человеком: он должен быть в руках ДО того, как за стол сели. */
  readonly code?: string | undefined;
}

/** Открыть комнату. Сессия при этом не поднимается: стол стоит и ждёт, пока за него сядут. */
export function openRoom(one: OpenRoom): RoomRow | undefined {
  // КОД БЕРЁТСЯ ИЗ ТОГО ЖЕ ОКНА, ЧТО И ПОКАЗАННЫЙ ЗАРАНЕЕ: комната, открытая без названного кода,
  // тоже не должна получить тот, который кто-то прямо сейчас держит в руках.
  const asked = cleanCode(one.code);
  const code = asked ?? reserveCode();
  // Код истрачен — бронь больше не нужна: дальше его держит сама комната.
  if (code) release(code);
  // ХОЗЯИН — ТОЛЬКО ТОТ, КОГО БАЗА ЗНАЕТ. Номер аккаунта присылает клиент, и выдуманный не должен
  // мешать открыть стол: комната просто останется ничьей.
  const owner = one.ownerAccount && accountById(one.ownerAccount) ? one.ownerAccount : null;
  return insertRoom({
    id: newId(),
    game: one.game,
    chairs: one.chairs ?? null,
    ...(one.capacity !== undefined ? { capacity: one.capacity } : {}),
    ...(one.newcomer ? { newcomer: one.newcomer } : {}),
    ...(one.newcomerChair !== undefined ? { newcomerChair: one.newcomerChair } : {}),
    ownerAccount: owner,
    title: one.title ?? null,
    visibility: one.visibility,
    admission: one.admission,
    mode: one.mode,
    forever: one.forever ?? false,
    ...(code ? { code } : {}),
  });
}

/**
 * ДАЙ КОД, КОТОРЫЙ МОЖНО ПОКАЗАТЬ ДО СОЗДАНИЯ СТОЛА.
 *
 * Он тут же придерживается за спросившим: между «дай код» и «открой комнату» проходят минуты (его
 * успевают отправить другу), и без брони второй человек получил бы в эту секунду тот же код.
 */
export function reserveCode(promised?: Promised): string | undefined {
  const code = freeCode(undefined, isHeld);
  if (code) hold(code, promised);
  return code;
}

/**
 * СТОЛ ЗА ЭТИМ КОДОМ — И ПОДНЯТЬ ЕГО, ЕСЛИ ОН БЫЛ ТОЛЬКО ОБЕЩАН.
 *
 * Приглашение в чужую переписку уходит раньше стола: карточка с кодом уже лежит в чате, а комнаты
 * ещё нет. Первый вошедший по такому коду и заводит её — с той игрой и тем хозяином, что были
 * обещаны. Ничего не обещано и комнаты нет — значит стол закрылся, и это говорится вслух.
 */
export function atCode(raw: string): RoomRow | undefined {
  const live = byCode(raw);
  if (live) return live;
  const code = cleanCode(raw);
  if (!code) return undefined;
  const promised = promiseOf(code);
  return promised ? openRoom({ ...promised, code }) : undefined;
}

/** Свободен ли названный человеком код: и в базе, и среди тех, что кто-то держит в руках. */
export function codeFree(raw: unknown): boolean {
  const code = cleanCode(raw);
  return code !== undefined && codeIsFree(code) && !isHeld(code);
}

/**
 * ГДЕ СЕЙЧАС ИДЁТ ИГРА В ЭТОЙ КОМНАТЕ — и если нигде, поднять сессию.
 *
 * Именно здесь кончается прежнее враньё: раньше ссылка на закрывшийся стол молча открывала НОВЫЙ,
 * и человек, думавший, что пришёл к друзьям, сидел один. Теперь новая сессия поднимается только для
 * ТОЙ ЖЕ комнаты — с её кодом, её игрой и её людьми.
 */
export async function sessionOf(room: RoomRow): Promise<string> {
  // За стол вернулись — назначенное закрытие отменяется само собой: будильник увидит живую сессию.
  if (room.sessionId) {
    const live = await matchMaker.query({ roomId: room.sessionId });
    if (live.length > 0) return room.sessionId;
  }
  const listing = await matchMaker.createRoom("kit_room", {
    game: room.game,
    room: room.id,
    code: room.code,
    // СТОЛУ — СТУЛЬЯ, А НЕ ЧИСЛО УЧАСТНИКОВ: сессия рассаживает людей по местам, и мест у неё
    // ровно столько, сколько их за этим столом.
    ...(room.chairs ? { chairs: room.chairs } : {}),
    capacity: room.capacity,
    // КЕМ ВСТРЕЧАТЬ НОВОГО — это знает комната, а сессия только исполняет.
    newcomer: room.newcomer,
    newcomerChair: room.newcomerChair,
  });
  setSession(room.id, listing.roomId);
  return listing.roomId;
}

/** Живая комната по коду. Закрытая не находится — и звонящий узнаёт об этом, а не получает новую. */
export function byCode(code: string): RoomRow | undefined {
  return roomByCode(code);
}

export function byId(id: string): RoomRow | undefined {
  return roomById(id);
}

/** Человек сел за стол: он теперь член этой комнаты, и она в списке его комнат. */
export function joined(roomId: string, accountId: string, role: Role = "player", chair = true): void {
  try {
    addMember(roomId, accountId, role, chair);
  } catch {
    // Аккаунта с таким номером база не знает — значит и членства быть не может. Это не повод не
    // пустить человека за стол: ростер его уже принял, просто комната не станет «его».
  }
  touchRoom(roomId);
}

/**
 * СЕССИЯ КОНЧИЛАСЬ. Вечный стол остаётся стоять — он принадлежит человеку, а не этой встрече.
 * Люди за столом забываются в обоих случаях: вчерашние лица в списке врут громче, чем «никого».
 */
export function sessionEnded(roomId: string): void {
  touchRoom(roomId);
  setSession(roomId, null);
  forgetPeople(roomId);
  const room = roomById(roomId);
  if (room && !room.forever) closeLater(roomId);
}

/** Столы, которым назначено закрытие. Ключ — комната; повторный вызов не заводит второй будильник. */
const closing = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * НЕВЕЧНЫЙ СТОЛ ЗАКРЫВАЕТСЯ НЕ В ТУ ЖЕ СЕКУНДУ, А ПРОСТОЯВ ПУСТЫМ.
 *
 * Закрытие вместе с сессией выглядит логично и ломает две обычные вещи: стол, за который ещё не
 * успели сесть (его открыли, чтобы прислать другу код), и перезагрузку страницы — она для сервера
 * такой же уход последнего. Поэтому стол ждёт: вернулись — живёт дальше, не вернулись — закрывается
 * сам и отдаёт код.
 */
export function closeLater(roomId: string, ms = getEmptyRoomTtlMs()): void {
  if (closing.has(roomId)) return;
  const timer = setTimeout(() => {
    closing.delete(roomId);
    const room = roomById(roomId);
    // Вернулись за стол (или стол уже закрыли руками) — закрывать нечего. И вечный не закрывается
    // по будильнику никогда: он принадлежит человеку, а не этой встрече.
    if (!room || room.closedAt || room.sessionId || room.forever) return;
    closeRoom(roomId);
  }, ms);
  // Будильник не держит процесс живым: пустой стол — не повод не дать серверу остановиться.
  timer.unref?.();
  closing.set(roomId, timer);
}

/** Только для тестов: снять все назначенные закрытия. */
export function forgetClosings(): void {
  for (const timer of closing.values()) clearTimeout(timer);
  closing.clear();
}

/** Закрыть комнату. Только хозяин: вечная комната принадлежит человеку. */
export function close(roomId: string, accountId: string): boolean {
  const room = roomById(roomId);
  if (!room || room.closedAt) return false;
  if (room.ownerAccount && room.ownerAccount !== accountId) return false;
  closeRoom(roomId);
  return true;
}

export function search(game?: string): RoomRow[] {
  return findRooms(game ? { game } : {});
}

export function mine(accountId: string): RoomRow[] {
  return roomsOfAccount(accountId);
}
