// Чистая вёрстка блоков раздела «Управление» (песочница). Рамка подгоняется под контент (fit):
// ширина = max(текст-кнопка, внутренний контент) + отступы; внутри — кнопка сверху, карты ниже.
// Была багоопасной (перелив текста за рамку) — держим отдельно и под тестами.

export const BLOCK_PAD = 16; // внутренний отступ рамки
export const BLOCK_GAP = 12; // зазор между кнопкой-названием и картами

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
