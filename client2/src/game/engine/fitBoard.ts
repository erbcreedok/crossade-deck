// ВПИСЫВАНИЕ ДОСКИ В ЭКРАН — чистое правило, отдельно от камеры: сколько увеличения дать, чтобы
// доска целиком влезла в ОСТАТОК экрана под хромом.
//
// Два условия, каждое из которых ломалось по отдельности:
//   • края экрана заняты хромом (топбар, док руки у любого края), и вписывать надо в остаток —
//     иначе панель накрывает крайний ряд слотов, и доска «влезла» только на бумаге;
//   • увеличивать доску сверх 1 нельзя: маленький стол, растянутый на весь экран, — это не
//     вписывание, а зум, и пиксельная графика на нём рассыпается.

export interface FitBoard {
  viewW: number;
  viewH: number;
  /** Сколько сверху занято хромом (0 — стол без хрома). */
  insetTop: number;
  /** Сколько снизу занято хромом: полоса действий, а при экранной руке — её band (0 — ничего). */
  insetBottom?: number;
  /** Боковые доки (экранная рука side:left/right) — вписываемся в остаток ширины. */
  insetLeft?: number;
  insetRight?: number;
  size: { w: number; h: number };
}

export function fitZoom({ viewW, viewH, insetTop, insetBottom = 0, insetLeft = 0, insetRight = 0, size }: FitBoard): number {
  const usableW = Math.max(1, viewW - insetLeft - insetRight);
  const usableH = Math.max(1, viewH - insetTop - insetBottom);
  return Math.min(1, usableW / size.w, usableH / size.h);
}
