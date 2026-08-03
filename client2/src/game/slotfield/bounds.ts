// Ограничение движения фигуры рамкой контейнера — «не могут выбраться из контейнера». Клампим
// центр так, чтобы полурзмеры (half) остались внутри rect. Если рамка уже фигуры — центрируем.
// Чистая функция.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function clampToBounds(pos: { x: number; y: number }, half: { w: number; h: number }, rect: Rect): { x: number; y: number } {
  return {
    x: clampAxis(pos.x, half.w, rect.x, rect.w),
    y: clampAxis(pos.y, half.h, rect.y, rect.h),
  };
}

function clampAxis(v: number, half: number, min: number, size: number): number {
  const lo = min + half;
  const hi = min + size - half;
  if (lo > hi) return min + size / 2; // рамка уже фигуры → центр
  return v < lo ? lo : v > hi ? hi : v;
}
