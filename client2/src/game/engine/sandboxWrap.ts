// Перенос строк для рядов песочницы, которые не помещаются в целевую ширину (не паникуют в
// мировых координатах канваса до бесконечности, а переносятся, как тайлы каталога). Чистая
// геометрия, без Pixi — движок только раскладывает по готовым (x,y).

export interface WrappedItem {
  x: number;
  y: number;
  row: number;
}

/** Однорядная упаковка (все айтемы одной высоты itemH): копим x в строке, пока влезает в
 *  maxWidth, иначе переносим на новую строку. widths уже включают собственный отступ/шаг между
 *  айтемами (т.е. это ШАГ, а не голая ширина карточки) — вызывающий сам решает, что в них зашито. */
export function wrapRow(widths: number[], maxWidth: number, itemH: number, rowGap: number): { items: WrappedItem[]; totalH: number } {
  const items: WrappedItem[] = [];
  let row = 0;
  let x = 0;
  widths.forEach((w) => {
    if (x > 0 && x + w > maxWidth) {
      row++;
      x = 0;
    }
    items.push({ x, y: row * (itemH + rowGap), row });
    x += w;
  });
  const rows = items.length ? row + 1 : 0;
  const totalH = rows ? rows * itemH + (rows - 1) * rowGap : 0;
  return { items, totalH };
}

export interface FlowItem {
  w: number;
  h: number;
}

export interface FlowSlot {
  x: number;
  y: number;
  row: number;
}

/** Построчная упаковка РАЗНОРАЗМЕРНЫХ блоков (борды: grid/ring/шахматы/смешанный — все разной
 *  ширины и высоты): копим в строку, пока влезает в maxWidth (с gap между айтемами), высота
 *  строки = максимум по высоте айтемов В НЕЙ, следующая строка ложится под этим максимумом. */
export function wrapFlow(items: FlowItem[], maxWidth: number, gap: number): { slots: FlowSlot[]; totalH: number } {
  const slots: FlowSlot[] = [];
  let row = 0;
  let x = 0;
  let y = 0;
  let rowH = 0;
  items.forEach((it) => {
    if (x > 0 && x + it.w > maxWidth) {
      y += rowH + gap;
      row++;
      x = 0;
      rowH = 0;
    }
    slots.push({ x, y, row });
    x += it.w + gap;
    rowH = Math.max(rowH, it.h);
  });
  const totalH = items.length ? y + rowH : 0;
  return { slots, totalH };
}
