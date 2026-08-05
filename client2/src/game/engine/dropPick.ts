// ВЫБОР ЦЕЛИ ДРОПА — чистая геометрия, одна на все столы (движок, косынка, песочница).
//
// Правило владельца: попадание считает ФИГУРА, а не палец. Игрок смотрит на предмет: если тот
// хотя бы частично накрыл зону — дроп обязан засчитаться, даже когда палец ещё вне зоны (палец
// часто держит карту за угол). Из нескольких накрытых зон побеждает БОЛЬШИЙ нахлёст; ничья
// решается пальцем (он внутри — его зона), затем близостью центра зоны к пальцу.

export interface DropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Pt {
  x: number;
  y: number;
}

/** Площадь пересечения прямоугольников. 0 — не пересекаются. */
export function overlapArea(a: DropRect, b: DropRect): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export function containsPt(r: DropRect, p: Pt): boolean {
  return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
}

/** Прямоугольник фигуры по центру и полуразмерам (footprint × текущий масштаб тела). */
export function itemRect(cx: number, cy: number, hw: number, hh: number): DropRect {
  return { x: cx - hw, y: cy - hh, w: hw * 2, h: hh * 2 };
}

/**
 * Выбрать зону под грузом. `zones` — кандидаты, УЖЕ отфильтрованные по способности принять груз
 * (accepts): геометрия не должна знать правил. Возвращает индекс победителя или -1.
 */
export function pickDropZone(zones: readonly DropRect[], item: DropRect, finger: Pt): number {
  let best = -1;
  let bestScore = 0;
  for (let i = 0; i < zones.length; i++) {
    const zone = zones[i]!;
    const area = overlapArea(zone, item);
    // Палец внутри зоны — тоже попадание (например, палец на зоне, а фигура пружиной отстала).
    if (area <= 0 && !containsPt(zone, finger)) continue;
    // Ничья по площади (нахлёст нулевой у обеих или равный) → пальцу виднее, затем ближний центр.
    const score = area + (containsPt(zone, finger) ? 0.5 : 0) - distScore(zone, finger);
    if (best === -1 || score > bestScore) {
      best = i;
      bestScore = score;
    }
  }
  return best;
}

// Микроштраф за удалённость центра зоны от пальца: решает только РАВНЫЕ площади (< 1 px²),
// на выбор между зонами с разным нахлёстом не влияет.
function distScore(r: DropRect, p: Pt): number {
  const dx = r.x + r.w / 2 - p.x;
  const dy = r.y + r.h / 2 - p.y;
  return Math.min(0.4, Math.hypot(dx, dy) / 1e6);
}
