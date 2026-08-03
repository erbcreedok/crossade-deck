// СВОБОДНАЯ СТОПКА В БОКСЕ (zone.layout.kind === "free"): чистая геометрия дропа колоды-блока.
// Правила (решение владельца): колоду можно бросить ТОЛЬКО в её бокс; дроп мимо — стопка
// возвращается туда, откуда её подняли (сдвиг не меняется); внутри бокса стопку держим ЦЕЛИКОМ
// (иначе её тень вылезает за контент и обрезается). Здесь ни Pixi, ни состояния — только числа.

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Vec {
  x: number;
  y: number;
}

export function inside(r: Rect, p: Vec): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

function clamp(v: number, lo: number, hi: number): number {
  if (lo > hi) return (lo + hi) / 2; // бокс уже стопки — сажаем по центру, а не вырождаемся
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Новый сдвиг свободной стопки после дропа.
 *
 * @param box    рамка-бокс зоны (экран/контент-координаты)
 * @param offset текущий сдвиг стопки от её дерева-дома
 * @param grab   точка захвата (там же, где offset был актуален)
 * @param drop   точка отпускания
 * @param base   дерево-дом нижней карты стопки БЕЗ сдвига (центр карты)
 * @param half   полу-габарит футпринта стопки (карта + разбег стаггера)
 * @returns новый сдвиг; РАВЕН offset (т.е. без изменений → возврат к подъёму), если drop вне бокса
 */
export function blockDropOffset(box: Rect, offset: Vec, grab: Vec, drop: Vec, base: Vec, half: { w: number; h: number }): Vec {
  if (!inside(box, drop)) return { ...offset }; // мимо бокса — не двигаем: release вернёт к подъёму
  const nx = offset.x + (drop.x - grab.x);
  const ny = offset.y + (drop.y - grab.y);
  // Держим всю стопку внутри бокса: центр нижней карты (base + сдвиг) в пределах бокса с полями.
  return {
    x: clamp(nx, box.x + half.w - base.x, box.x + box.w - half.w - base.x),
    y: clamp(ny, box.y + half.h - base.y, box.y + box.h - half.h - base.y),
  };
}
