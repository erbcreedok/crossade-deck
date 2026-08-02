import { SB_ITEM_GAP } from "../engine/sandboxLayout";
import { wrapRow } from "../engine/sandboxWrap";
import type { Pt, SectionContext, SectionSize } from "./context";

// ГАЛЕРЕЯ — сетка «вид + подпись», одна на все разделы.
//
// Галерея отвечает на вопрос «что тут вообще бывает»: виды СРАВНИВАЮТ, а сравнить можно только
// рядом. Это ровно та страница, которой нет места на странице с рычагами: там крутят ОДНУ вещь,
// и соседи мешают.
//
// Механизм общий, а не по копии на раздел: раскладка с переносом строк, ячейка по самому крупному
// виду, подпись под НАРИСОВАННЫМ низом. Каждое из этих правил уже нарушалось поодиночке — в общем
// месте их можно нарушить только один раз.

export interface GalleryCell {
  caption: string;
  /** Ширина и высота ТОГО, ЧТО РИСУЕТСЯ, в единицах сцены. Ячейка считается по ним, не наоборот. */
  w: number;
  h: number;
  /** Нарисовать вид. `at` — ЦЕНТР отведённого места, `i` — номер ячейки (для id и глубины). */
  draw: (ctx: SectionContext, at: Pt, i: number) => void;
}

export interface GalleryOpts {
  /** Во что вписывать по ширине. Не задано — восемь карт: та же полоса, что у прочих секций. */
  maxWidth?: number;
  /** Запас между ячейками сверх габарита вида. */
  gap?: number;
  /** Кегль подписи. */
  capSize?: number;
}

/**
 * Разложить виды сеткой с подписями.
 *
 * Ячейка одна на всю галерею и меряется по САМОМУ КРУПНОМУ виду: разные ячейки под разные виды
 * рассыпают сетку, а сетка тут и есть способ сравнения. Подпись ставится под нарисованный низ
 * САМОГО ВЫСОКОГО вида — иначе крупный вид накрывает подпись соседа снизу.
 */
export function gallerySection(ctx: SectionContext, at: Pt, cells: readonly GalleryCell[], o: GalleryOpts = {}): SectionSize {
  if (cells.length === 0) return { bottom: at.y, width: 0 };
  const gap = o.gap ?? SB_ITEM_GAP;
  const capSize = o.capSize ?? 13;
  const cellW = Math.max(...cells.map((c) => c.w)) + gap;
  const viewH = Math.max(...cells.map((c) => c.h));
  const itemH = viewH + capSize * 2 + 16; // вид + место под подпись в одну-две строки
  const { items, totalH } = wrapRow(
    cells.map(() => cellW),
    o.maxWidth ?? ctx.cardW * 8,
    itemH,
    gap,
  );
  let width = 0;
  cells.forEach((c, i) => {
    const p = items[i]!;
    const cx = at.x + p.x + cellW / 2;
    const cy = at.y + p.y + viewH / 2;
    c.draw(ctx, { x: cx, y: cy }, i);
    const cap = ctx.label(c.caption, cx, at.y + p.y + viewH + 10, capSize, 0x9aa89f, cellW * 0.94);
    width = Math.max(width, p.x + cellW, p.x + cellW / 2 + cap.width / 2);
  });
  return { bottom: at.y + totalH, width };
}
