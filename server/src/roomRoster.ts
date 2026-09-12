// КТО ЗА ЭТИМ СТОЛОМ — ОДИН СПИСОК НА ВСЕХ, А НЕ ДВА РАЗНЫХ ОТВЕТА.
//
// Людей здесь две породы, и раньше каждая жила своей жизнью: те, кто ЧИСЛИТСЯ в комнате (запись в
// базе, роль, переживает всё), и те, кто СЕЙЧАС СИДИТ (место в сессии Colyseus, живёт от первой
// посадки до последнего ухода). Полоса сверху показывала вторых, список за ней — первых, и два
// экрана рядом говорили про один стол разное: на сукне «К», в списке его нет.
//
// Поэтому список ОДИН и собирается из обоих: члены комнаты плюс все, кто сел, даже если в базе их
// нет (гость без аккаунта — тоже человек за столом).
//
// «ЗА СТОЛОМ» — ЭТО МЕСТО В ИДУЩЕЙ СЕССИИ, А НЕ РОЛЬ. Роль говорит, что человеку в этой комнате
// можно; стул говорит, сидит ли он сейчас. Хозяин, которого сегодня не было, — хозяин без стула, и
// врать про него «за столом · отошёл» нельзя: его места на сукне нет и не было.

import { accountById } from "./db/accountsRepo.js";
import { membersOf, type Role, type RoomRow } from "./db/roomsRepo.js";
import { peopleAt } from "./roomPeople.js";
import { inksApart } from "./profileInks.js";

export interface RosterPerson {
  /** Номер аккаунта. Пусто — за столом гость, которого база не знает. */
  readonly account?: string;
  readonly name: string;
  readonly color: string | null;
  /** Лицо, как человек его выбрал. Пусто — рисуется первая буква имени. */
  readonly face?: string;
  readonly role: Role;
  /** Место в идущей сессии. `null` — человек числится в комнате, но сейчас не сидит. */
  readonly seat: string | null;
  /** Стул держится, человека за ним нет. Бывает только у сидящего. */
  readonly away?: boolean;
  /** Здесь ли он сейчас — в идущей сессии. Стул дают только тому, кто пришёл. */
  readonly here: boolean;
}

/** Хозяин первым, дальше по старшинству роли, а внутри роли — по приходу. */
const RANK: Record<Role, number> = { owner: 0, admin: 1, player: 2, spectator: 3 };

export function rosterOf(room: RoomRow): RosterPerson[] {
  const sitting = peopleAt(room.id);
  const byAccount = new Map(sitting.filter((one) => one.accountId).map((one) => [one.accountId!, one]));
  const out: RosterPerson[] = [];
  const seen = new Set<string>();

  // ЦВЕТ СИДЯЩЕГО — ТОТ, ЧТО УЖЕ НА СУКНЕ. Сессия развела одинаковые цвета за этим столом, и
  // список обязан повторить её ответ, а не считать свой: два ответа однажды разойдутся, и человек
  // окажется одного цвета в списке и другого на своём стуле.
  const apart = inksApart(
    membersOf(room.id)
      .map((member) => accountById(member.accountId))
      .filter((one): one is NonNullable<typeof one> => one !== undefined)
      .map((one) => ({ id: one.id, color: byAccount.get(one.id)?.color ?? one.color })),
  );

  for (const member of membersOf(room.id)) {
    const account = accountById(member.accountId);
    if (!account) continue;
    seen.add(account.id);
    const here = byAccount.get(account.id);
    out.push({
      account: account.id,
      name: account.name,
      color: here?.color ?? apart.get(account.id) ?? account.color,
      ...(account.avatar ? { face: account.avatar } : {}),
      role: member.role,
      seat: here?.seat ?? null,
      here: here !== undefined,
      ...(here?.away ? { away: true } : {}),
    });
  }

  // СЕЛ, НО В КОМНАТЕ НЕ ЧИСЛИТСЯ — гость без аккаунта. Он сидит за столом на глазах у всех, и
  // список, который его прячет, расходится с сукном в ту же секунду.
  for (const one of sitting) {
    if (one.accountId && seen.has(one.accountId)) continue;
    out.push({
      ...(one.accountId ? { account: one.accountId } : {}),
      name: one.name,
      color: one.color,
      ...(one.face ? { face: one.face } : {}),
      role: "player",
      seat: one.seat ?? null,
      here: true,
      ...(one.away ? { away: true } : {}),
    });
  }

  return out.sort((a, b) => RANK[a.role] - RANK[b.role]);
}
