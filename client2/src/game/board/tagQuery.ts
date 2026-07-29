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

/**
 * Значения СЕМЕЙСТВА тегов в наборе: для `family="suit"` из `suit:♠`/`suit:♥` вернёт `["♠","♥"]`.
 * Дедуп не нужен на входе-Set, но порядок — вставки. Фундамент под правила, спрашивающие «какие
 * масти/цвета/команды есть в наборе» (напр. tagValues(pile.tagsAny, "suit")). Элемент без тега
 * семейства (кастом без масти) просто не даёт значения — сентинел «нет» решает вызывающий слой.
 */
export function tagValues(tags: TagSet, family: string): string[] {
  const p = family.endsWith(":") ? family : `${family}:`;
  const out: string[] = [];
  for (const t of tags) if (t.startsWith(p)) out.push(t.slice(p.length));
  return out;
}
