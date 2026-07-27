// Чистая вёрстка блоков раздела «Управление» (песочница). Рамка подгоняется под контент (fit):
// ширина = max(текст-кнопка, внутренний контент) + отступы; внутри — кнопка сверху, карты ниже.
// Была багоопасной (перелив текста за рамку) — держим отдельно и под тестами.

export const BLOCK_PAD = 16; // внутренний отступ рамки
export const BLOCK_GAP = 12; // зазор между кнопкой-названием и картами

// ——— общие токены отступов песочницы (один ритм вместо самопальных чисел в каждой секции) ———
export const SB_MARGIN = 40; // внешний отступ страницы
export const SB_SECTION_GAP = 24; // между низом одной секции-бокса и верхом следующей
export const SB_HEADER_GAP = 16; // заголовок -> контент, ВНУТРИ бокса секции
export const SB_ITEM_GAP = 16; // между соседними элементами/рядами внутри секции
export const SB_BOX_PAD = BLOCK_PAD; // внутренний паддинг бокса секции (переиспользуем 16)

export interface BlockBox {
  boxW: number;
  boxH: number;
  btnCY: number; // центр кнопки по y (ОТНОСИТЕЛЬНО верха блока)
  cardCY: number; // центр карт по y (относительно верха блока)
}

/** Размеры блока и вертикальные центры кнопки/карт. btnW/innerW — ширины текст-кнопки и контента. */
export function fitBlock(btnW: number, innerW: number, btnH: number, cardH: number, pad = BLOCK_PAD, gap = BLOCK_GAP): BlockBox {
  return {
    boxW: Math.max(btnW, innerW) + pad * 2,
    boxH: pad + btnH + gap + cardH + pad,
    btnCY: pad + btnH / 2,
    cardCY: pad + btnH + gap + cardH / 2,
  };
}

export interface SectionBox {
  boxW: number;
  boxH: number;
  contentTop: number; // где начинается контент, ОТНОСИТЕЛЬНО верха бокса
  contentLeft: number; // где начинается контент, ОТНОСИТЕЛЬНО левого края бокса
}

/** Размеры бокса секции (генерализация fitBlock: не один айтем, а произвольный контент —
 *  ряд карт, грид борда, столбец тоглов — вызывающий сам знает contentW/H своего контента). */
export function fitSection(contentW: number, contentH: number, pad = SB_BOX_PAD, headerH = 26, headerGap = SB_HEADER_GAP): SectionBox {
  return {
    boxW: contentW + pad * 2,
    boxH: pad + headerH + headerGap + contentH + pad,
    contentTop: pad + headerH + headerGap,
    contentLeft: pad,
  };
}

// Сдвиги карт пачки относительно пальца при драге «в руку»: тесная стопка, центрированная под
// пальцем. Шаг маленький — передняя карта прячет номинал задних, но общая ширина ненулевая, чтобы
// на глаз читалось количество. i=0 — низ (сзади), i=n-1 — верх (спереди).
export function squeezeOffsets(n: number, cardW: number, cardH: number): Array<{ dx: number; dy: number }> {
  const sx = cardW * 0.06; // тесный боковой шаг (пара пикселей)
  const sy = cardH * 0.03;
  const mid = (n - 1) / 2;
  return Array.from({ length: n }, (_, i) => ({ dx: (i - mid) * sx, dy: (i - mid) * sy }));
}
