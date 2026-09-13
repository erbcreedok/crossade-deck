// КТО ЧИСЛИТСЯ ЗА СТОЛОМ — порядок строк и два числа над ними. Без документа, как и вся арифметика
// полосы: порядок можно проверить, не поднимая экрана.
//
// ЛИЦА НА ПОЛОСЕ И ЭТОТ СПИСОК — РАЗНЫЕ ВЕЩИ. На полосе те, кто сейчас на связи и за столом; здесь
// вся комната: зритель без стула, ушедший на час игрок и хозяин, которого сегодня не было. Полоса
// отвечает «кто играет», список — «чей это стол».

/**
 * УРОВЕНЬ КОНТРОЛЯ — те же три слова, что у сервера. Зрителя среди них нет: это не уровень.
 */
export const ROSTER_ROLES = ["owner", "admin", "player"] as const;
export type RosterRole = (typeof ROSTER_ROLES)[number];

/**
 * КАК ЧЕЛОВЕК НАЗЫВАЕТСЯ ЗА СТОЛОМ — из ДВУХ источников: его уровень и есть ли у него стул.
 *
 * Одно слово на уровень не работает: хозяин, вставший из-за стола, продолжает вести его, но не
 * играет, — это ВЕДУЩИЙ; игрок без стула не понижен в правах, он просто смотрит — это ЗРИТЕЛЬ. А
 * админ и там и там админ: он и заведён, чтобы распоряжаться, а не играть, и разницу говорит
 * соседняя строка («без стула»).
 */
export function roleWord(role: RosterRole, seated: boolean): string {
  if (role === "owner") return seated ? "хозяин" : "ведущий";
  if (role === "admin") return "админ";
  return seated ? "игрок" : "зритель";
}

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
  /** Кого спрашивать про действия — номер его аккаунта, как его знает комната. */
  readonly account?: string;
  /**
   * СОСТОЯНИЕ ЕГО РУКИ — включены ли лок, пин и скрытность. Живёт в дереве стола, а не в комнате:
   * панель только показывает, что горит, и гасит обратно.
   */
  readonly hand?: { readonly lock?: boolean; readonly pin?: boolean; readonly hide?: boolean };
  /** Что Я могу с ним сделать. Считает комната; панель рисует только это и её же словами. */
  readonly can?: readonly { readonly deed: string; readonly label: string; readonly vote?: boolean }[];
  /** ...и чего нельзя, с причиной: кнопка, пропавшая молча, читается как поломка. */
  readonly cant?: readonly { readonly deed: string; readonly label: string; readonly why: string }[];
}

export interface RosterList {
  readonly rows: readonly TopHudMember[];
  /** Сколько стульев занято и сколько всего народу числится за столом. */
  readonly seated: number;
  readonly total: number;
}

const RANK: Record<RosterRole, number> = { owner: 0, admin: 1, player: 2 };

/** Я первым, дальше по старшинству роли; равные роли остаются в том порядке, в каком пришли. */
export function rosterList(members: readonly TopHudMember[]): RosterList {
  const rows = members
    .map((one, i) => ({ one, i }))
    .sort((a, b) => {
      if (a.one.mine !== b.one.mine) return a.one.mine === true ? -1 : 1;
      const rank = RANK[a.one.role] - RANK[b.one.role];
      if (rank !== 0) return rank;
      // Внутри уровня сидящие идут первыми: за столом они ближе, чем те, кто смотрит.
      if (a.one.seated !== b.one.seated) return a.one.seated ? -1 : 1;
      return a.i - b.i;
    })
    .map((pair) => pair.one);
  return { rows, seated: members.filter((one) => one.seated).length, total: members.length };
}
