// ЧТО МОСТУ ДАЮТ И ЧТО ОН ОТДАЁТ — и ничего больше.
//
// Мост стоит МЕЖДУ хабом и игрой: список комнат, поиск и создание нового стола. Он не знает ни
// нашего сервера, ни карт, ни шахмат — ему дают комнаты, кто смотрит и что ответил сервер, а он
// отдаёт три вещи: войти в комнату, создать такую, стол без комнаты.
//
// Поэтому здесь его СОБСТВЕННЫЕ типы, а не типы `@crossade/wire`: мост, знающий наш провод, — это
// мост, который нельзя показать на стенде и нельзя открыть из игры на её собственном URL.

/** Кто в комнате решает. Режим комнаты, а не роль: роли при всех трёх одни и те же. */
export type Mode = "free" | "council" | "assembly";

/** Один вопрос вместо двух осей — так спрашивает стенд; как это ложится на видимость и допуск,
 *  знает тот, кто монтирует мост. */
export type Openness = "code" | "friends" | "public";

/** В какой группе списка стоит комната. Свои — первыми. */
export type Group = "mine" | "friends" | "forever" | "public";

export interface Person {
  readonly name: string;
  /** Любимый цвет. Пусто — у человека его ещё нет, и кружок будет тёмным. */
  readonly color?: string | null;
  readonly away?: boolean;
}

export interface Room {
  /** Код — главное в строке: именно его называют вслух и присылают в чат. */
  readonly code: string;
  readonly group: Group;
  /** Игра — уже написанным именем и своим знаком. Мост игр не знает. */
  readonly game: { readonly id: string; readonly name: string; readonly sign: string };
  readonly seats: number;
  readonly taken: number;
  /** Сколько из занявших сейчас на связи. За СВОИМ столом важно не сколько мест, а есть ли там кто-то. */
  readonly online: number;
  readonly people: readonly Person[];
  readonly openness: Openness;
  readonly mode: Mode;
  readonly forever: boolean;
  readonly owner: string | null;
  /** Возраст своими словами: «только что», «14 минут», «вчера». Считает тот, кто даёт комнаты. */
  readonly age: string;
  /** Держится ли за мной стул за этим столом. */
  readonly mySeat?: boolean;
  /** Единственное, ради чего этот список открывают заново. */
  readonly myTurn?: boolean;
}

/** Что ответил сервер. Три из четырёх — собственные экраны моста, а не забота хозяина страницы. */
export type Answer = "rooms" | "loading" | "silent";

/** Кто смотрит. Гостю не видно друзей и вечных — и об этом ему говорят, а не молча сокращают список. */
export type Who = "member" | "guest";

/** Каким создают стол. Ровно это уходит наружу по «Создать и сесть». */
export interface NewTable {
  readonly game: string;
  readonly code: string;
  readonly openness: Openness;
  readonly mode: Mode;
  readonly seats: number;
  readonly forever: boolean;
}

/** Чем сузили список. Фильтры не открывают второй экран — они сужают то, что уже видно. */
export interface Filters {
  readonly game: string | "any";
  readonly seatsFrom: number;
  readonly onlyFree: boolean;
  readonly mode: Mode | "any";
}

export const NO_FILTERS: Filters = { game: "any", seatsFrom: 2, onlyFree: true, mode: "any" };

/** Подходит ли комната под фильтры. Одна правда для списка и для его пустого состояния. */
export function fits(room: Room, filters: Filters): boolean {
  if (filters.game !== "any" && room.game.id !== filters.game) return false;
  if (room.seats < filters.seatsFrom) return false;
  if (filters.onlyFree && room.taken >= room.seats && !room.mySeat) return false;
  if (filters.mode !== "any" && room.mode !== filters.mode) return false;
  return true;
}

/**
 * ЧЕМ ИМЕННО СУЖЕН СПИСОК — чипсами, каждый со своим ✕.
 *
 * Это не украшение, а ответ на «почему тут пусто»: фильтр, которого не видно, через минуту
 * становится поломкой — человек возвращается в список, комнат нет, и винит сервер.
 */
export function chipsOf(filters: Filters, nameOfGame: (id: string) => string): { id: string; text: string }[] {
  const chips: { id: string; text: string }[] = [];
  if (filters.game !== "any") chips.push({ id: "game", text: nameOfGame(filters.game) });
  if (filters.seatsFrom > 2) chips.push({ id: "seatsFrom", text: `мест от ${filters.seatsFrom}` });
  if (filters.onlyFree) chips.push({ id: "onlyFree", text: "есть места" });
  if (filters.mode !== "any") chips.push({ id: "mode", text: MODE_WORDS[filters.mode] });
  return chips;
}

/** Как уклад зовут по-русски. Одно место: он называется в списке, в поиске и при создании. */
export const MODE_WORDS: Record<Mode, string> = {
  free: "вольница",
  council: "совет",
  assembly: "вече",
};

/** Что уклад значит — подписью под выбором, а не в справке, которую никто не откроет. */
export const MODE_MEANS: Record<Mode, string> = {
  free: "Каждый админ делает что хочет. Хочешь решать один — не назначай админов.",
  council: "Действия админов решают админы голосованием; у оунера голос тяжелее на волос.",
  assembly: "Комнату настраивают все игроки голосованием. Людьми и укладом по-прежнему ведают админы.",
};

export const OPENNESS_WORDS: Record<Openness, string> = {
  code: "по коду",
  friends: "для друзей",
  public: "публичная",
};

export const OPENNESS_MEANS: Record<Openness, string> = {
  code: "Стол не увидит никто: пускают по коду, который ты пришлёшь.",
  friends: "Стол увидят только друзья; остальным нужен код.",
  public: "Стол увидят все — подсядут незнакомые.",
};
