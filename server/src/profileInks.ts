// ВОСЕМЬ ЛЮБИМЫХ ЦВЕТОВ — те же, что у экранов (`@crossade/look`, `FAVOURITE_INKS`).
//
// Здесь они не оформление, а ДАННЫЕ ПРОФИЛЯ: цвет выдаётся человеку вместе с кличкой и с этой
// минуты принадлежит ему, как имя. Без него половина стола была одинаково-серой — «цвета нет»
// рисуется одинаково у всех, и двух людей за столом становится не различить.
//
// Лежит отдельным файлом, потому что спрашивают его двое: заведение аккаунта и миграция, которая
// раздала цвет тем, кто завёлся раньше этого правила.

export const INKS = ["#f2c14e", "#7fd1b9", "#e08b3f", "#b98fe0", "#8fb4e0", "#e0483f", "#a8e08f", "#e08fb4"] as const;

/** Цвет по номеру аккаунта: один и тот же при каждом вопросе, разный у разных людей. */
export function inkFor(id: string): string {
  let sum = 0;
  for (const ch of id) sum = (sum * 31 + ch.codePointAt(0)!) % 0xffffffff;
  return INKS[sum % INKS.length]!;
}

/**
 * ЦВЕТА ЗА ОДНИМ СТОЛОМ НЕ ПОВТОРЯЮТСЯ. Цвет принадлежит человеку, но восемь цветов на всех — и
 * рано или поздно двое приходят за один стол одинаковыми. Тогда узнавать по цвету нечего: именно
 * ради узнавания цвет и существует.
 *
 * Разводит их СЕРВЕР, а не экран: разойдись экраны в этом сами, один и тот же человек оказался бы
 * разного цвета у разных соседей. Первый занявший цвет его и держит; остальным даётся ближайший
 * свободный по кругу, а когда свободных нет — свой собственный, потому что врать некуда.
 */
export function inksApart(people: readonly { readonly id: string; readonly color?: string | null }[]): Map<string, string> {
  const taken = new Set<string>();
  const out = new Map<string, string>();
  for (const one of people) {
    const own = one.color ?? inkFor(one.id);
    const from = Math.max(0, INKS.indexOf(own as (typeof INKS)[number]));
    let ink = own;
    if (taken.has(ink)) {
      for (let step = 1; step <= INKS.length; step += 1) {
        const next = INKS[(from + step) % INKS.length]!;
        if (!taken.has(next)) {
          ink = next;
          break;
        }
      }
    }
    taken.add(ink);
    out.set(one.id, ink);
  }
  return out;
}
