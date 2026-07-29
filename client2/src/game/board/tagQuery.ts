// Предикаты над тегами элемента (SELECTION-DESIGN §2). Чистые комбинаторы — приходят ИЗ КОНФИГА
// игры, движок их только ВЫЧИСЛЯЕТ. «green elements» = hasTag('color:green'); «в раунде только
// буби» = hasAllTags(['card','suit:♦']). Новый словарь = новые теги + предикат тут в конфиге,
// движок не трогаем.

export type TagSet = ReadonlySet<string>;
export type TagPredicate = (tags: TagSet) => boolean;

/** Есть тег. */
export const hasTag = (tag: string): TagPredicate => (t) => t.has(tag);

/** Есть ВСЕ перечисленные (пустой список → всегда true). */
export const hasAllTags = (tags: readonly string[]): TagPredicate => (t) => tags.every((x) => t.has(x));

/** Есть ХОТЯ БЫ ОДИН (пустой список → всегда false). */
export const hasAnyTag = (tags: readonly string[]): TagPredicate => (t) => tags.some((x) => t.has(x));

/** Отрицание. */
export const not = (p: TagPredicate): TagPredicate => (t) => !p(t);

/** Конъюнкция (пусто → true). */
export const and = (...ps: TagPredicate[]): TagPredicate => (t) => ps.every((p) => p(t));

/** Дизъюнкция (пусто → false). */
export const or = (...ps: TagPredicate[]): TagPredicate => (t) => ps.some((p) => p(t));

/** Всегда истинный предикат (дефолт «выбирать можно всё»). */
export const any: TagPredicate = () => true;
