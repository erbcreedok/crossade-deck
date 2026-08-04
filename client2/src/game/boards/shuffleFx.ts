// ПОЗЫ АНИМАЦИИ ПЕРЕМЕШИВАНИЯ — чистая функция: куда разлетаются карты стопки на время «шурух»,
// прежде чем слететься обратно уже в новом порядке. Позы ДЕТЕРМИНИРОВАНЫ по индексу (никакого
// рандома): в live-режиме все клиенты рисуют один и тот же «шурух» (тот же канон, что у heap).
// Разлетается только ВЕРХ стопки (SHUFFLE_FX_CARDS): силуэт читается, а 52 летящих карты — каша.

export interface ShufflePose {
  dx: number;
  dy: number;
  rot: number;
}

export const SHUFFLE_FX_CARDS = 10;
export const SHUFFLE_FX_SECONDS = 0.42;

export function shufflePoses(n: number): ShufflePose[] {
  const m = Math.min(n, SHUFFLE_FX_CARDS);
  return Array.from({ length: m }, (_, i) => {
    const side = i % 2 === 0 ? -1 : 1; // веером в обе стороны попеременно
    const row = Math.floor(i / 2);
    return {
      dx: side * (34 + row * 16),
      dy: -46 - row * 14,
      rot: side * (0.18 + row * 0.05),
    };
  });
}
