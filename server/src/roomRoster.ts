// КТО ЧИСЛИТСЯ ЗА ЭТИМ СТОЛОМ — и кто из них сейчас на связи.
//
// Два разных списка, и раньше наружу уходил только второй. Люди сессии (`roomPeople`) живут, пока
// идёт игра, и исчезают вместе с ней; членство и роль лежат в базе и переживают всё. Экран «ЗА
// СТОЛОМ» показывает ОБА сразу: зритель без стула — такой же участник комнаты, как игрок, и оунер
// остаётся оунером, пока его нет за столом.
//
// СШИВАЮТСЯ ПО ИМЕНИ, а не по номеру аккаунта: сессия знает про человека ровно имя и цвет — стул в
// ней принадлежит месту за столом, а не записи в базе. Имя внутри одной комнаты уникально,
// потому что его уникальность сервер держит на весь аккаунт.

import { accountById } from "./db/accountsRepo.js";
import { membersOf, type Role, type RoomRow } from "./db/roomsRepo.js";
import { peopleAt } from "./roomPeople.js";

export interface RosterPerson {
  readonly account: string;
  readonly name: string;
  readonly color: string | null;
  readonly role: Role;
  /** Держится ли за ним стул. Ложь — зритель: он в комнате, но не играет. */
  readonly seated: boolean;
  /** Стул держится, человека за ним нет. */
  readonly away?: boolean;
}

/** Оунер первым, дальше по старшинству роли, а внутри роли — по приходу. */
const RANK: Record<Role, number> = { owner: 0, admin: 1, player: 2, spectator: 3 };

export function rosterOf(room: RoomRow): RosterPerson[] {
  // Хозяин попадает сюда так же, как все: строку с ролью `owner` ему заводит сама комната.
  const here = new Map(peopleAt(room.id).map((one) => [one.name, one]));
  const out: RosterPerson[] = [];
  for (const member of membersOf(room.id)) {
    const account = accountById(member.accountId);
    if (!account) continue;
    // СТУЛ — ЭТО РОЛЬ, А НЕ СВЯЗЬ. Зритель без стула и тогда, когда он на связи; игрок со стулом и
    // тогда, когда отошёл, — иначе место за ним не держалось бы, а это и есть весь смысл стула.
    const role = member.role;
    const seated = role !== "spectator";
    const seen = here.get(account.name);
    const away = seated && (seen === undefined || seen.away === true);
    out.push({
      account: account.id,
      name: account.name,
      color: account.color,
      role,
      seated,
      ...(away ? { away: true } : {}),
    });
  }
  return out.sort((a, b) => RANK[a.role] - RANK[b.role]);
}
