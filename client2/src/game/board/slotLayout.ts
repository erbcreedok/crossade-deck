// Геометрия покоя членов ВНУТРИ слота. EC2 (GRID-DESIGN.md): «прилёт» — это spring в эту позицию,
// отдельной системы нет. Чистая функция: смещение каждого члена от центра слота. Rot/scale (0/rest)
// добавляет движок — здесь только раскладка стопки. Веерная раскладка (открытая) — отдельно позже.

/** Центрированная стопка: член i смещён на (i-(n-1)/2)·шаг. Верх (последний) — с макс. сдвигом. */
export function stackOffsets(count: number, dx: number, dy: number): Array<{ dx: number; dy: number }> {
  const mid = (count - 1) / 2;
  return Array.from({ length: count }, (_, i) => ({ dx: nz((i - mid) * dx), dy: nz((i - mid) * dy) }));
}

// -0 → +0 (иначе тесты/сравнения различают знак нуля, а для позиции он не значит ничего).
function nz(v: number): number {
  return v === 0 ? 0 : v;
}
