// ИМЕНА КОМНАТ. Комната зовётся по своей игре и по тому, что в ней: `Песочница. Оранжевый круг`.
// Первое слово — род (песочница, крестовый, дальше шахматы и нарды), второе — имя этой комнаты:
// название чата, если она открыта в чате, иначе случайное на тему крестового похода.
//
// СЛОВА «СТОЛ» В ИМЕНИ НЕТ. Стол — это то, что нарисовано; человек же ходит в КОМНАТУ, и в разных
// комнатах разные игры. Поэтому имя начинается с игры, а не с мебели.
//
// Одинаковых имён у живых комнат не бывает: второму такому же ставится префикс `[2] `, третьему — `[3] `.
// Первому номер не ставится, и номер всегда наименьший свободный: закрыли `[2] ` — он снова свободен.

/** Имя комнаты, о которой ничего не известно. */
export const ROOM_WORD = "Комната";

/** Род с большой буквы: `песочница` → `Песочница`. */
export const capital = (word: string): string => (word ? word[0]!.toUpperCase() + word.slice(1) : word);

const EPITHETS = [
  "Утренний", "Последний", "Железный", "Песчаный", "Обетованный", "Терновый", "Соляный", "Алый",
  "Пыльный", "Молчаливый", "Кривой", "Дальний", "Ржавый", "Северный", "Осадный", "Вечерний",
];
const THINGS = [
  "поход", "привал", "обоз", "шатёр", "щит", "рубеж", "дозор", "лагерь",
  "брод", "постой", "караван", "редут", "вал", "подкоп", "штандарт", "бивак",
];

const TITLE_MAX = 48;

/** Имя комнаты: род и её собственное имя — из названия чата, иначе случайное. */
export function titleFrom(kind: string, chat: string | undefined, pick: () => number = Math.random): string {
  const name = (chat ?? "").trim().slice(0, TITLE_MAX);
  return `${capital(kind)}. ${name || crusadeName(pick)}`;
}

/** Та же комната, но другой игрой: `Песочница. Алый обоз` → `Крестовый. Алый обоз`. */
export function retitled(title: string, was: string, now: string): string {
  const head = `${capital(was)}. `;
  return title.startsWith(head) ? `${capital(now)}. ${title.slice(head.length)}` : title;
}

/** Случайное имя на тему крестового похода: `Утренний обоз`. */
export function crusadeName(pick: () => number = Math.random): string {
  const a = EPITHETS[Math.floor(pick() * EPITHETS.length) % EPITHETS.length]!;
  const b = THINGS[Math.floor(pick() * THINGS.length) % THINGS.length]!;
  return `${a} ${b}`;
}

/** Номер в префиксе, если он есть: `[2] Песочница. Чат` → 2. */
export function numberOf(title: string): number {
  const m = /^\[([0-9]{1,3})\] /.exec(title);
  return m ? Number(m[1]) : 1;
}

/** Имя без префикса: `[2] Песочница. Чат` → `Песочница. Чат`. */
export const bareTitle = (title: string): string => title.replace(/^\[[0-9]{1,3}\] /, "");

/**
 * Имя, которого ещё нет среди занятых. Свободно — как есть; занято — наименьший свободный номер,
 * начиная со второго: `[2] `, `[3] `. Префикс входящего имени не учитывается — он назначается заново.
 */
export function uniqueTitle(wanted: string, taken: Iterable<string>): string {
  const bare = bareTitle(wanted.trim()).slice(0, TITLE_MAX) || ROOM_WORD;
  const busy = new Set<number>();
  for (const t of taken) if (bareTitle(t) === bare) busy.add(numberOf(t));
  if (!busy.has(1)) return bare;
  let n = 2;
  while (busy.has(n)) n += 1;
  return `[${n}] ${bare}`;
}
