// Дабл-тап-зум на зону: чистая геометрия «навести камеру на границы». Наводим ЦЕНТР границ в центр
// доступной области и зумим так, чтобы границы влезли в factor (90%) её размера — зум зажат в
// пределы камеры. Возвращает целевые (x, y, zoom) вьюпорта. Ни Pixi, ни состояния.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * @param b      границы цели (координаты контента)
 * @param avail  доступная область экрана (ширина/высота под камеру)
 * @param zoom   пределы зума камеры
 * @param factor доля области, которую должны занять границы (по умолчанию 0.9)
 */
export function fitBoundsView(b: Rect, avail: { w: number; h: number }, zoom: { min: number; max: number }, factor = 0.9): { x: number; y: number; zoom: number } {
  const z = clamp(factor * Math.min(avail.w / b.w, avail.h / b.h), zoom.min, zoom.max);
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;
  // screen(p) = p*z + viewport; хотим центр b → центр доступной области.
  return { x: avail.w / 2 - bcx * z, y: avail.h / 2 - bcy * z, zoom: z };
}
