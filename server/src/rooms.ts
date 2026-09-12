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
import {
  addMember,
  closeRoom,
  findRooms,
  insertRoom,
  roomByCode,
  roomById,
  roomsOfAccount,
  setSession,
  touchRoom,
  type Admission,
  type RoomRow,
  type Visibility,
} from "./db/roomsRepo.js";

export type { RoomRow } from "./db/roomsRepo.js";

/** Игры, под которые можно открыть стол. Список закрытый: опечатка — комната, которую не открыть. */
export const KIT_GAMES = ["cards", "chess", "nardy"] as const;
export type KitGame = (typeof KIT_GAMES)[number];

export function isKitGame(game: unknown): game is KitGame {
  return typeof game === "string" && (KIT_GAMES as readonly string[]).includes(game);
}

let counter = 0;

function newId(): string {
  counter += 1;
  return `room_${Date.now().toString(36)}_${counter.toString(36)}`;
}

export interface OpenRoom {
  readonly game: string;
  readonly seats?: number;
  readonly ownerAccount?: string;
  readonly title?: string;
  readonly visibility?: Visibility;
  readonly admission?: Admission;
}

/** Открыть комнату. Сессия при этом не поднимается: стол стоит и ждёт, пока за него сядут. */
export function openRoom(one: OpenRoom): RoomRow | undefined {
  // ХОЗЯИН — ТОЛЬКО ТОТ, КОГО БАЗА ЗНАЕТ. Номер аккаунта присылает клиент, и выдуманный не должен
  // мешать открыть стол: комната просто останется ничьей.
  const owner = one.ownerAccount && accountById(one.ownerAccount) ? one.ownerAccount : null;
  return insertRoom({
    id: newId(),
    game: one.game,
    seats: one.seats ?? null,
    ownerAccount: owner,
    title: one.title ?? null,
    visibility: one.visibility,
    admission: one.admission,
  });
}

/**
 * ГДЕ СЕЙЧАС ИДЁТ ИГРА В ЭТОЙ КОМНАТЕ — и если нигде, поднять сессию.
 *
 * Именно здесь кончается прежнее враньё: раньше ссылка на закрывшийся стол молча открывала НОВЫЙ,
 * и человек, думавший, что пришёл к друзьям, сидел один. Теперь новая сессия поднимается только для
 * ТОЙ ЖЕ комнаты — с её кодом, её игрой и её людьми.
 */
export async function sessionOf(room: RoomRow): Promise<string> {
  if (room.sessionId) {
    const live = await matchMaker.query({ roomId: room.sessionId });
    if (live.length > 0) return room.sessionId;
  }
  const listing = await matchMaker.createRoom("kit_room", {
    game: room.game,
    room: room.id,
    code: room.code,
    ...(room.seats ? { seats: room.seats } : {}),
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
export function joined(roomId: string, accountId: string): void {
  try {
    addMember(roomId, accountId);
  } catch {
    // Аккаунта с таким номером база не знает — значит и членства быть не может. Это не повод не
    // пустить человека за стол: ростер его уже принял, просто комната не станет «его».
  }
  touchRoom(roomId);
}

/** Сессия кончилась — стол остался. Забываем только то, что кончилось. */
export function sessionEnded(roomId: string): void {
  touchRoom(roomId);
  setSession(roomId, null);
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
