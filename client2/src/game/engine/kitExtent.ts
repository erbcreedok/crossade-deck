// ЧИСТАЯ математика витрины стори: габарит содержимого и вписывание его в экран. Вынесена из
// KitScene отдельно ровно потому, что всё остальное там — Pixi, а Pixi в node не исполняется
// (docs/HANDOFF.md: «зелёные гейты про канвас не значат ничего»). Что можно проверить юнитом —
// проверяется юнитом.

export interface Extent {
  w: number;
  h: number;
}

export interface Footprint {
  x: number;
  y: number;
  hw: number;
  hh: number;
}

/**
 * Габарит витрины: правый-нижний край содержимого плюс поле.
 *
 * УСЛОВНОСТЬ КООРДИНАТ (та же, что в песочнице): содержимое живёт в ПОЛОЖИТЕЛЬНОЙ четверти,
 * (0,0) — левый верхний угол витрины. Камера сцены раскладывает контент в прямоугольнике
 * [0..w]×[0..h] и всё, что левее или выше нуля, обрезает — поэтому мерить bounding box с
 * отрицательными краями было бы бессмысленно: габарит получился бы верный, а половина витрины
 * оставалась бы за кромкой. Элемент прибит за ЦЕНТР, поэтому первый ставится в (padding+hw, padding+hh).
 *
 * Меряем полуразмерами (hw/hh), а не позициями: витрина из одной карты иначе получила бы нулевую ширину.
 */
export function extentOf(items: readonly Footprint[], padding: number): Extent {
  // Пустая витрина всё равно должна иметь размер: камера делит экран на габарит контента,
  // а деление на ноль даёт NaN и «чёрный канвас без объяснений».
  let maxX = 0;
  let maxY = 0;
  for (const it of items) {
    if (it.x + it.hw > maxX) maxX = it.x + it.hw;
    if (it.y + it.hh > maxY) maxY = it.y + it.hh;
  }
  return { w: Math.max(1, maxX + padding), h: Math.max(1, maxY + padding) };
}

/** Зум, при котором витрина видна ЦЕЛИКОМ. Меньший из двух коэффициентов, зажатый в [min, max]. */
export function fitZoom(extent: Extent, screen: Extent, minZoom: number, maxZoom: number): number {
  // Первый кадр приходит с нулевым экраном (хост ещё не померен) — тогда просто отдаём minZoom,
  // иначе Infinity/NaN уедет в матрицу камеры и сцена не покажется вообще.
  if (!(extent.w > 0) || !(extent.h > 0) || !(screen.w > 0) || !(screen.h > 0)) return minZoom;
  const z = Math.min(screen.w / extent.w, screen.h / extent.h);
  return Math.max(minZoom, Math.min(maxZoom, z));
}
