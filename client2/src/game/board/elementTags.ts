import { cardColor, rankOf } from "./cardFace";
import { suitOf } from "./collectOrder";

// Авто-теги элемента — ОТКРЫТЫЙ словарь идентичности-ДАННЫХ (SELECTION-DESIGN §2). Не enum движка:
// карта раскладывается на `card, suit:♦, rank:7, color:red`, игра ДОМЕШИВАЕТ свои (`role:trump`).
// Предикаты (tagQuery) читают эти строки; движок их вычисляет, а не перечисляет. Способности
// (Peekable/Flippable) — отдельная ось (ISP-интерфейсы), тут их НЕТ.

/** Теги карты по её лицу. Пустое лицо (значение придержано) → знаем лишь, что это `card`. */
export function cardTags(face: string): Set<string> {
  const t = new Set<string>(["card"]);
  if (!face) return t; // значение не раскрыто — масть/ранг/цвет неизвестны
  t.add(`suit:${suitOf(face)}`);
  t.add(`rank:${rankOf(face)}`);
  t.add(`color:${cardColor(face)}`);
  return t;
}

/** Собрать теги элемента: авто-теги + домешанные игрой (дедуп через Set). */
export function withTags(base: Iterable<string>, extra?: Iterable<string>): Set<string> {
  const t = new Set(base);
  if (extra) for (const x of extra) t.add(x);
  return t;
}
