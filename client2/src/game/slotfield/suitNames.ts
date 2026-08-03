import { tagValues } from "./tagQuery";

// Презентация мастей для лог-дропбокса «называю масть» (issue #62). Чистая: идентичность (теги)
// приходит из движка, тут — только ПОДПИСИ. 4 основные масти → рус. имя; новая масть (по желанию
// игры — словарь тегов открытый) → символ как есть; карта-член БЕЗ масти (кастом/джокер) → «???».

const SUIT_LABELS: Record<string, string> = { "♠": "Пики", "♥": "Черви", "♦": "Бубны", "♣": "Трефы" };

/** Подпись масти по символу: 4 основные → рус. имя, любая иная (новая масть игры) → символ как есть. */
export function suitLabel(sym: string): string {
  return SUIT_LABELS[sym] ?? sym;
}

/**
 * Уникальные подписи мастей набора. Конкретные масти берём из union-тегов
 * (`tagValues(tagsAny, "suit")` — Set уже без повторов, порядок первой встречи) и маппим в подписи.
 * Карта-член с тегом `card`, но без `suit:*` (кастом/джокер) добавляет ОДИН общий «???».
 * Не-карты (фишки и пр.) в лог не попадают — у них нет тега `card`.
 */
export function namedSuits(tagsAny: ReadonlySet<string>, memberTags: readonly ReadonlySet<string>[]): string[] {
  const names = tagValues(tagsAny, "suit").map(suitLabel);
  const suitless = memberTags.some((t) => t.has("card") && tagValues(t, "suit").length === 0);
  if (suitless) names.push("???");
  return names;
}
