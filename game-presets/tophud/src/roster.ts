// КТО ЧИСЛИТСЯ ЗА СТОЛОМ — порядок строк и два числа над ними. Без документа, как и вся арифметика
// полосы: порядок можно проверить, не поднимая экрана.
//
// ЛИЦА НА ПОЛОСЕ И ЭТОТ СПИСОК — РАЗНЫЕ ВЕЩИ. На полосе те, кто сейчас на связи и за столом; здесь
// вся комната: зритель без стула, ушедший на час игрок и хозяин, которого сегодня не было. Полоса
// отвечает «кто играет», список — «чей это стол».

/** Роли за столом. Те же слова, что у сервера, и в том же порядке старшинства. */
export const ROSTER_ROLES = ["owner", "admin", "player", "spectator"] as const;
export type RosterRole = (typeof ROSTER_ROLES)[number];

/** Как роль называется человеку. Экран берёт отсюда, чтобы места не разошлись в словах. */
export const ROLE_WORD: Record<RosterRole, string> = {
  owner: "хозяин",
  admin: "админ",
  player: "игрок",
  spectator: "зритель",
};

export interface TopHudMember {
  readonly name: string;
  /** Его цвет, уже разрешённый в значение: список — это разметка, и палитры у неё нет. */
  readonly ink: string;
  /** Его лицо, как он его выбрал. Пусто — в кружке первая буква имени. */
  readonly face?: string;
  readonly role: RosterRole;
  /** Сидит ли он за столом ПРЯМО СЕЙЧАС — место в идущей партии, а не право его занять. */
  readonly seated: boolean;
  /** Стул держится, человека за ним нет. */
  readonly away?: boolean;
  /** Это я. Своя строка стоит первой — себя не ищут глазами в списке. */
  readonly mine?: boolean;
}

export interface RosterList {
  readonly rows: readonly TopHudMember[];
  /** Сколько стульев занято и сколько всего народу числится за столом. */
  readonly seated: number;
  readonly total: number;
}

const RANK: Record<RosterRole, number> = { owner: 0, admin: 1, player: 2, spectator: 3 };

/** Я первым, дальше по старшинству роли; равные роли остаются в том порядке, в каком пришли. */
export function rosterList(members: readonly TopHudMember[]): RosterList {
  const rows = members
    .map((one, i) => ({ one, i }))
    .sort((a, b) => {
      if (a.one.mine !== b.one.mine) return a.one.mine === true ? -1 : 1;
      const rank = RANK[a.one.role] - RANK[b.one.role];
      return rank !== 0 ? rank : a.i - b.i;
    })
    .map((pair) => pair.one);
  return { rows, seated: members.filter((one) => one.seated).length, total: members.length };
}
