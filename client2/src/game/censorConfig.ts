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

/** Точка рождения частицы. Цвет — СВОЙ у каждой: пыль повторяет то, что под ней. */
export interface DustPoint {
  x: number;
  y: number;
  color: number;
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

/**
 * Точки рождения из ЦВЕТНОЙ сетки — пыль как смаз того, что под ней.
 *
 * Прежний путь (dustPoints выше) знал ровно один силуэт — «фак» — и красил все частицы одним
 * амбером. Это делало цензуру НЕЗАВИСИМОЙ от карты: и туз пик, и джокер прятались за одинаковой
 * жёлтой крошкой, которая ни на что похожа не была. Здесь клетка отдаёт СВОЙ цвет, поэтому облако
 * повторяет лицо: туз пик размазывается тузом пик, джокер — джокером.
 *
 * Прозрачные клетки (скруглённые углы карты) точек не дают — иначе пыль лезла бы за кромку.
 */
export function colorDustPoints(
  cells: ReadonlyArray<{ on: boolean; color: number }>,
  cols: number,
  rows: number,
  step: number,
  perCell: number,
  cx: number,
  cy: number,
  weight?: (color: number) => number,
): DustPoint[] {
  const offX = cx - (cols * step) / 2;
  const offY = cy - (rows * step) / 2;
  const pts: DustPoint[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r * cols + c];
      if (!cell || !cell.on) continue;
      const x = offX + c * step + step / 2;
      const y = offY + r * step + step / 2;
      // Вес 0 — клетку пропускаем целиком: она неотличима от подложки, её частицы невидимы, а кадр
      // они едят наравне со всеми. Раньше здесь стоял Math.max(1, …), и 85 % облака составляла
      // невидимая кремовая рябь — шесть таких карт роняли сцену до 7 кадров в секунду.
      const n = weight ? Math.round(perCell * weight(cell.color)) : perCell;
      for (let d = 0; d < n; d++) pts.push({ x, y, color: cell.color });
    }
  }
  return pts;
}

/** Расстояние между цветами в 0..1 (по каналам, без гамма-игр — нам нужна грубая «непохожесть»). */
export function colorDistance(a: number, b: number): number {
  const dr = ((a >> 16) & 255) - ((b >> 16) & 255);
  const dg = ((a >> 8) & 255) - ((b >> 8) & 255);
  const db = (a & 255) - (b & 255);
  return Math.min(1, Math.sqrt(dr * dr + dg * dg + db * db) / 441.673);
}

/**
 * Вес клетки: во сколько раз чаще она рождает частицы по сравнению с фоном карты.
 *
 * Без этого пыль выходит равномерной рябью, в которой рисунок ТОНЕТ: краска занимает небольшую долю
 * лица (пипсы, углы, подпись), а кремовое поле — почти всё, и кремовые частицы на кремовой подложке
 * невидимы. Взвешивание по «непохожести на фон» возвращает смазу форму: чем дальше клетка от общего
 * тона карты, тем плотнее над ней облако, и туз пик читается как размазанный туз пик.
 *
 * Клетки цвета фона не выбрасываем — они дают дрожащее поле, без которого карта выглядела бы просто
 * чистой с горсткой крошек.
 */
export function contrastWeight(background: number, gain: number, floor = 0): (color: number) => number {
  return (color) => {
    const d = colorDistance(color, background);
    return d < floor ? 0 : gain * d;
  };
}

/**
 * Проредить облако до потолка, сохранив пропорции: берём каждую k-ю точку.
 *
 * Потолок нужен не «на всякий случай»: частицы перерисовываются КАЖДЫЙ кадр, и цена облака линейна
 * по числу точек. Одна нарядная карта не должна иметь права уронить сцену, на которой их шесть.
 */
export function thinPoints(pts: readonly DustPoint[], cap: number): DustPoint[] {
  if (pts.length <= cap) return [...pts];
  const k = pts.length / cap;
  const out: DustPoint[] = [];
  for (let i = 0; i < cap; i++) out.push(pts[Math.floor(i * k)]!);
  return out;
}

/** Преобладающий цвет сетки = фон карты. Считаем по огрублённым бинам: близкие оттенки кремового
 *  должны попасть в один, иначе «фоном» окажется случайный уникальный пиксель. */
export function dominantColor(cells: ReadonlyArray<{ on: boolean; color: number }>): number {
  const bins = new Map<number, { n: number; color: number }>();
  for (const cell of cells) {
    if (!cell.on) continue;
    const key = ((cell.color >> 21) << 10) | (((cell.color >> 13) & 7) << 5) | ((cell.color >> 5) & 31);
    const b = bins.get(key);
    if (b) b.n++;
    else bins.set(key, { n: 1, color: cell.color });
  }
  let best = { n: 0, color: 0xffffff };
  for (const b of bins.values()) if (b.n > best.n) best = b;
  return best.color;
}
