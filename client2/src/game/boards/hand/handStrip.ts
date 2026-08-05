// ГЕОМЕТРИЯ РУКИ-РЯДА — карты руки, вписанные в ШИРИНУ (экран HUD или док на борде): пока ряд
// влезает целиком — стоят с гэпом; когда карт больше, чем помещается, уходят в РОВНЫЙ нахлёст и ряд
// всегда центрируется по ширине. Чистая геометрия (как handRow старого клиента), без Pixi: её
// одинаково зовёт экранный HandHud и бордовая рука-док. Веер (fan) — отдельная раскладка позже.

import type { Size } from "../../slot/types";

/** Поза карты в руке: x/y — ЦЕНТР карты, rot — наклон (ряд ровный, rot=0). */
export interface HandPose {
  x: number;
  y: number;
  rot: number;
}

/** Ряд count карт шириной cell, вписанный в `width`. gap — зазор при свободном ряде. Возвращает
 *  ЦЕНТРЫ карт (y — середина полосы высотой cell.h). Один card — по центру; переполнение — нахлёст. */
export function handStrip(count: number, cell: Size, width: number, gap = 12): HandPose[] {
  if (count <= 0) return [];
  const spread = cell.w + gap; // шаг между центрами в свободном ряду
  const full = cell.w + (count - 1) * spread; // ширина ряда без нахлёста
  const step = full <= width || count < 2 ? spread : (width - cell.w) / (count - 1); // нахлёст при переполнении
  const total = cell.w + (count - 1) * step;
  const firstCx = (width - total) / 2 + cell.w / 2; // ряд центрирован по ширине
  return Array.from({ length: count }, (_, i) => ({ x: firstCx + i * step, y: cell.h / 2, rot: 0 }));
}
