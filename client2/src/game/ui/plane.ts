import { DRAG_SCALE, FLOAT_SCALE, TEX_H, TEX_W } from "../engine/constants";
import type { CardState, ShadowShape } from "./Card";

// Маппинг «план элемента → вид»: масштаб покоя и силуэт тени. ЧИСТЫЕ функции без Pixi — тот
// самый маппinng «состояние → вид», который по плану уезжает из элемента наружу (item B).
// Тестируется юнитами: масштаб по плану + перспектива тени (выше план → тень дальше/крупнее).

/** Масштаб плана. Удержание = симуляция драга (тот же размер); парение чуть крупнее. */
export function scaleForState(s: CardState): number {
  if (s === "held" || s === "drag") return DRAG_SCALE;
  if (s === "floating") return FLOAT_SCALE;
  return 1;
}

export interface ShadowInput {
  px: number;
  py: number;
  shakeX: number; // боковое дрожание («стоп»-блок)
  bobY: number; // вертикальное покачивание парения
  bobLift: number; // добавка «высоты» от парения (0..~0.12)
  rotation: number;
  scaleVal: number; // текущий множитель масштаба тела (1 в покое, >1 в подъёме)
  scaleFactor: number; // базовый масштаб карты (px-текстура → экран)
}

// Силуэт тени. Смещение растёт с «высотой» (elev): свет сверху справа → тень уходит вниз-влево,
// сильнее вниз. РАЗМЕР тени — от размера ПОКОЯ (scaleFactor), лишь чуть подрастая с высотой:
// приподнятая карта кажется крупнее, но её тень на доске почти исходного размера.
export function shadowSilhouette(i: ShadowInput): ShadowShape {
  const elev = i.scaleVal - 1 + i.bobLift;
  const chpx = TEX_H * i.scaleFactor;
  const sc = i.scaleFactor * (1.06 + elev * 0.35);
  return {
    x: i.px + i.shakeX - chpx * (0.03 + elev * 0.32),
    y: i.py + i.bobY * 0.35 + chpx * (0.04 + elev * 0.85),
    hw: (TEX_W * sc) / 2,
    hh: (TEX_H * sc) / 2,
    rot: i.rotation,
  };
}
