import type { CardOptions } from "../ui/Card";
import { SB_ITEM_GAP } from "../engine/sandboxLayout";
import { wrapRow } from "../engine/sandboxWrap";
import type { Pt, SectionContext, SectionSize } from "./context";

// Ряд «Карты — варианты»: по одной карте на каждую заметную опцию, с подписью под ней.
//
// Это и есть ответ на «я уже запутался, что у карты есть»: список ниже — единственное место, где
// варианты перечислены рядом и их видно одновременно. Полный список ОПЦИЙ живёт отдельно
// (stories/kit/cardArgs.ts, там же принудительная сверка с CardOptions через satisfies); здесь —
// то, что стоит увидеть глазами, потому что описанием эти вещи не передаются.

export interface CardVariant {
  caption: string;
  opts: CardOptions;
}

export const CARD_VARIANTS: readonly CardVariant[] = [
  { caption: "открытая", opts: { faceUp: true } },
  { caption: "закрытая", opts: { faceUp: false } },
  // Лицом — живая «пыль»-цензура (TG-спойлер); рубашка уже показана «закрытой».
  { caption: "скрытая (пыль)", opts: { hidden: true, faceUp: true } },
  { caption: "рубашка: изумруд", opts: { faceUp: false, back: "emerald" } },
  { caption: "лицо: символ", opts: { card: "K♥", faceStyle: "symbol" } },
  { caption: "4-цветная", opts: { card: "Q♦", fourColor: true } },
  { caption: "порванная", opts: { card: "10♦", torn: true } },
  { caption: "меньше ×0.7", opts: { size: 0.7 } },
  { caption: "нельзя тащить", opts: { card: "7♣", draggable: false } },
  { caption: "удерживаемая", opts: { card: "8♦", rest: "held" } },
  { caption: "приподнятая (в руке)", opts: { card: "9♠", rest: "floating" } },
  // Кастом-лицо из реестра CUSTOM_FACES, а не хардкод-флаг.
  { caption: "джокер", opts: { custom: "joker" } },
];

/**
 * Ряд вариантов карты.
 *
 * cellW — ШАГ между картами (карта + запас под длинную подпись вроде «приподнятая (в руке)», не
 * задевающий соседа), а НЕ ширина контента. Правый край поэтому считается по РЕАЛЬНОМУ краю
 * последней карты/подписи в строке: справа от последней карты соседа нет, чтобы оправдывать шаг,
 * а слева у первой такого запаса и не было — раскладка не симметрична.
 *
 * wrapRow переносит строки на узком экране: 12 карточек без него росли вправо без ограничения и
 * переполняли 390px.
 */
export function cardVariantsSection(ctx: SectionContext, at: Pt, idPrefix = "story"): SectionSize {
  const cellW = ctx.cardW * 2.15;
  const itemH = ctx.cardH + 40; // карта + место под подпись
  const { items, totalH } = wrapRow(CARD_VARIANTS.map(() => cellW), ctx.cardW * 8, itemH, SB_ITEM_GAP);
  let width = 0;
  CARD_VARIANTS.forEach((s, i) => {
    const p = items[i]!;
    const cx = at.x + p.x + ctx.cardW / 2;
    const cy = at.y + p.y + ctx.cardH / 2;
    // Явный id обязателен: без него Card.id === "" — и ЛЮБЫЕ две карты ряда делят один ключ
    // идентичности. Всё, что адресует элементы по id («подглядеть», реестр byId), тогда путает их
    // между собой: показ одной карты снимал таймер у соседней.
    ctx.card({ ...s.opts, id: s.opts.id ?? `${idPrefix}-${i}` }, { x: cx, y: cy }, i, i * 0.9);
    const cap = ctx.label(s.caption, cx, cy + ctx.cardH / 2 + 8, 14, 0x9aa89f, cellW * 0.9);
    width = Math.max(width, Math.max(p.x + ctx.cardW, p.x + ctx.cardW / 2 + cap.width / 2));
  });
  return { bottom: at.y + totalH, width };
}
