// Хит-тест карт: среди всех, чей прямоугольник накрыл точку, побеждает ВЕРХНЯЯ по z (а не первая
// по порядку массива). Без этого в стопке цеплялась нижняя карта, попавшая в зону тапа раньше.
// Чистая функция — тестируется без Pixi.

export interface HitBox {
  px: number;
  py: number;
  hw: number; // полуширина
  hh: number; // полувысота
  z: number; // глубина (zIndex); выше — приоритетнее
}

/** Индекс верхней (по z) коробки, накрывшей точку, иначе -1. */
export function topmostAt(boxes: readonly HitBox[], cx: number, cy: number): number {
  let best = -1;
  let bestZ = -Infinity;
  boxes.forEach((b, i) => {
    if (Math.abs(cx - b.px) <= b.hw && Math.abs(cy - b.py) <= b.hh && b.z >= bestZ) {
      best = i;
      bestZ = b.z;
    }
  });
  return best;
}
