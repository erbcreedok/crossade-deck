import type { ParticleParams } from "./engine/censorParticles";

// ЕДИНЫЙ источник правды «цензуры скрытой карты». Один и тот же дефолт крутит и dev-стенд
// (/motion), и реальную скрытую карту на доске (ui/Card) — чтобы «как на стенде» и «как в игре»
// не разъезжались. Чистый модуль (без Pixi): рычаги, дефолты и раскладка точек — под тесты.

/** Рычаги «танца» цензуры (общие для CPU-мозаики, GPU-вариантов и частиц-пыли). */
export interface DanceParams {
  block: number; // размер пиксель-блока/точки, px («частица»)
  swapsPerSec: number; // темп свапов/churn'а («свапы»)
  jitterAmp: number; // размах дрожания/разлёта («дрожание»)
  jitterFreq: number; // частота дрожания/мерцания («частота»)
}

/**
 * Выбранный дефолт цензуры — TG-пыль. Значения заданы пользователем: частица 5, свапы 25,
 * дрожание 1, частота 1. Их же показывают рычаги стенда при старте.
 */
export const DANCE_DEFAULT: DanceParams = { block: 5, swapsPerSec: 25, jitterAmp: 1, jitterFreq: 1 };

/** Мерцание частиц по умолчанию ВЫКЛ (фото-чувствительность + спокойнее выглядит). */
export const DUST_FLICKER = false;

/**
 * Пыль замедлена в 3 раза: дефолт = «как было на 0.3x». Не через глобальный ползунок скорости
 * (он бы тронул все секции стенда), а множителем времени в самих частицах — так и стенд, и
 * доска показывают одинаково медленную пыль при ползунке 1.0x.
 */
export const DUST_TIME_SCALE = 1 / 3;

/** Рычаги «танца» → параметры Telegram-частиц (замедление зашито множителем времени). */
export function dustParams(d: DanceParams, flicker: boolean): ParticleParams {
  return {
    dot: Math.max(1.5, d.block * 0.8),
    drift: d.jitterAmp * 14,
    life: Math.max(0.35, 1.3 - d.swapsPerSec / 120),
    twinkleHz: d.jitterFreq * 0.4,
    flicker,
    timeScale: DUST_TIME_SCALE,
  };
}

/**
 * Точки рождения частиц из булевой сетки силуэта: для каждой «включённой» клетки — perCell точек в
 * её центре. Центр облака в (cx,cy): стенд ставит контейнер в левый-верх и передаёт центр карты,
 * доска рисует от центра карты (cx=cy=0). Чистая: сетку извлекает Pixi-хелпер (engine/censorSource).
 */
export function dustPoints(on: boolean[], cols: number, rows: number, step: number, perCell: number, cx: number, cy: number): Array<{ x: number; y: number }> {
  const offX = cx - (cols * step) / 2;
  const offY = cy - (rows * step) / 2;
  const pts: Array<{ x: number; y: number }> = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!on[r * cols + c]) continue;
      for (let d = 0; d < perCell; d++) pts.push({ x: offX + c * step + step / 2, y: offY + r * step + step / 2 });
    }
  }
  return pts;
}
