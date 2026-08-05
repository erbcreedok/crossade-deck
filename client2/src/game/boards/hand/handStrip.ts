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

/** Доля высоты экрана под карту руки: на узком высоком телефоне рост ограничивает ИМЕННО высота. */
const HAND_H_FRAC = 0.2;
const HAND_W_MIN = 48;
const HAND_W_MAX = 120;

/** АДАПТИВНЫЙ размер карты руки под экран: ширина — меньшее из «влезает fit штук по ширине» (конфиг
 *  size руки, дефолт 5) и «не выше доли высоты», зажатое в пределы; высота — по аспекту cell. Так на
 *  телефоне (узко-высоко) карты мельчают, на десктопе упираются в потолок. Чистая — без Pixi. */
export function handCardSize(availWidth: number, screenH: number, cell: Size, fit = 5): Size {
  const aspect = cell.h / cell.w;
  const byWidth = Math.max(1, availWidth) / Math.max(1, fit);
  const byHeight = (screenH * HAND_H_FRAC) / aspect;
  const w = Math.max(HAND_W_MIN, Math.min(HAND_W_MAX, byWidth, byHeight));
  return { w, h: w * aspect };
}

/** Ряд с ФАНТОМ-ГЭПОМ под вставку (груз навис над рукой): count карт занимают count+1 позиций
 *  ряда, позиция gapIndex пустует — карты раздвигаются, показывая, куда ляжет груз. КАНОН: индекс
 *  вставки считается по БАЗОВОМУ ряду (handStrip без гэпа) — подсказка не смеет двигать цель под
 *  неподвижным пальцем, иначе индекс осциллирует (урок playHover старого клиента). */
export function handStripWithGap(count: number, gapIndex: number, cell: Size, width: number, gap = 12): HandPose[] {
  const g = Math.max(0, Math.min(gapIndex, count));
  return handStrip(count + 1, cell, width, gap).filter((_, i) => i !== g);
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
