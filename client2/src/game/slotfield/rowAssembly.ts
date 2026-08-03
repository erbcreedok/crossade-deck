// Раскладка набора В РЯД при старте драга (issue #56). ОСЬ №2: геометрия, отдельная от порядка
// (collectOrder). По упорядоченным id — offset каждой карты ОТ курсора: одна строка (dy=0), ряд
// центрирован на курсоре, шаг = ширина карты + зазор. Чистая, без Pixi; GroupDrag ждёт offsets
// выровненными индекс-в-индекс со своим массивом элементов.

export interface RowOffset {
  id: string;
  dx: number; // сдвиг центра карты от курсора по горизонтали
  dy: number; // 0 — один ряд
}

/** Offsets ряда для уже упорядоченного набора. Центр ряда — курсор. */
export function rowAssembly(orderedIds: readonly string[], cardW: number, gap: number): RowOffset[] {
  const n = orderedIds.length;
  const step = cardW + gap;
  const mid = (n - 1) / 2; // индекс центра ряда (дробный при чётном n)
  return orderedIds.map((id, i) => ({ id, dx: (i - mid) * step, dy: 0 }));
}
