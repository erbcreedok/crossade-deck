// ИМЕНА СТОЛОВ. Стол называется по чату, в котором открыт: `Стол «Чат пиццы»`. Вне чата (inline-карточка, личка)
// имени взять неоткуда — берётся случайное, на тему крестового похода.
//
// Одинаковых имён у живых комнат не бывает: второму такому же ставится префикс `[2] `, третьему — `[3] `.
// Первому номер не ставится, и номер всегда наименьший свободный: закрыли `[2] ` — он снова свободен.

/** Вид стола. Пока один; будет `Дурак «Бандиты»`. */
export const TABLE_GAME = "Стол";

const EPITHETS = [
  "Утренний", "Последний", "Железный", "Песчаный", "Обетованный", "Терновый", "Соляный", "Алый",
  "Пыльный", "Молчаливый", "Кривой", "Дальний", "Ржавый", "Северный", "Осадный", "Вечерний",
];
const THINGS = [
  "поход", "привал", "обоз", "шатёр", "щит", "рубеж", "дозор", "лагерь",
  "брод", "постой", "караван", "редут", "вал", "подкоп", "штандарт", "бивак",
];

const TITLE_MAX = 48;

/** Имя стола по названию чата: `Стол «Чат пиццы»`. Чат без названия — как без чата. */
export function titleFrom(chat: string | undefined, pick: () => number = Math.random): string {
  const name = (chat ?? "").trim().slice(0, TITLE_MAX);
  return `${TABLE_GAME} «${name || crusadeName(pick)}»`;
}

/** Случайное имя на тему крестового похода: `Утренний обоз`. */
export function crusadeName(pick: () => number = Math.random): string {
  const a = EPITHETS[Math.floor(pick() * EPITHETS.length) % EPITHETS.length]!;
  const b = THINGS[Math.floor(pick() * THINGS.length) % THINGS.length]!;
  return `${a} ${b}`;
}

/** Номер в префиксе, если он есть: `[2] Стол «Чат»` → 2. */
export function numberOf(title: string): number {
  const m = /^\[([0-9]{1,3})\] /.exec(title);
  return m ? Number(m[1]) : 1;
}

/** Имя без префикса: `[2] Стол «Чат»` → `Стол «Чат»`. */
export const bareTitle = (title: string): string => title.replace(/^\[[0-9]{1,3}\] /, "");

/**
 * Имя, которого ещё нет среди занятых. Свободно — как есть; занято — наименьший свободный номер,
 * начиная со второго: `[2] `, `[3] `. Префикс входящего имени не учитывается — он назначается заново.
 */
export function uniqueTitle(wanted: string, taken: Iterable<string>): string {
  const bare = bareTitle(wanted.trim()).slice(0, TITLE_MAX) || TABLE_GAME;
  const busy = new Set<number>();
  for (const t of taken) if (bareTitle(t) === bare) busy.add(numberOf(t));
  if (!busy.has(1)) return bare;
  let n = 2;
  while (busy.has(n)) n += 1;
  return `[${n}] ${bare}`;
}
