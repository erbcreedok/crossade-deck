// ЧИСТАЯ математика «цензурной» пиксель-анимации. Ни Pixi, ни состояния (свап-сетку держит вызывающий).
// Ложится в философию anim/config: на вход идёт ВРЕМЯ `t` (уже домноженное на глобальный множитель
// скорости вызывающим → 1x/2x/слайдер бесплатны; пауза = замороженный `t`). На выход — геометрия блоков.
// Это анимация САМОГО НИЗКОГО приоритета: когда выключена, вызывающий рисует статичный кадр (запечённую
// текстуру) и не будит рендер-цикл. Источник-агностик: знает только про сетку cols×rows, не про карты.

export type CensorKind = "swap-dance" | "row-shear" | "combo";

export interface CensorSpec {
  kind: CensorKind;
  block: number; // px, размер пиксель-блока
  // row-shear: ряды едут вбок в противофазе, направление флипается, соседи НИКОГДА не совпадают
  speedPxSec: number; // |горизонтальная скорость| ряда
  flipEverySec: number; // период смены направления (напр. 0.3с)
  rowBias: number; // ПОСТОЯННЫЙ сдвиг на ряд (в долях блока) — гарантия «соседние ряды не выровняются»
  // swap-dance: блоки мельтешат и меняются местами с соседями (чаще свапы, чем толкание)
  swapsPerSec: number; // сколько свапов-соседей в секунду
  jitterAmp: number; // px, амплитуда мелкого дрожания каждого блока (никогда не стоит ровно)
  jitterFreq: number; // рад/с, частота дрожания
  // combo: доля сдвига рядов, добавляемая к свап-танцу (0..1)
  shearMix: number;
}

// Небольшой набор пресетов — чтобы витрина показала варианты, а реальная карта взяла один по имени.
// НЕ «магия»: числа подобраны под твоё описание (10 px/с вбок, флип 0.3с). rowBias = золотое сечение —
// иррациональная доля блока, поэтому соседний ряд смещён на ~0.382 блока ВСЕГДА и в ноль не сходится.
const GOLDEN = 0.381966;
export const CENSOR_PRESETS: Record<string, CensorSpec> = {
  swap: { kind: "swap-dance", block: 8, speedPxSec: 0, flipEverySec: 0.3, rowBias: GOLDEN, swapsPerSec: 90, jitterAmp: 2.2, jitterFreq: 9, shearMix: 0 },
  shearCoarse: { kind: "row-shear", block: 8, speedPxSec: 42, flipEverySec: 0.3, rowBias: GOLDEN, swapsPerSec: 0, jitterAmp: 0, jitterFreq: 0, shearMix: 1 },
  shearFine: { kind: "row-shear", block: 5, speedPxSec: 30, flipEverySec: 0.3, rowBias: GOLDEN, swapsPerSec: 0, jitterAmp: 0, jitterFreq: 0, shearMix: 1 },
  combo: { kind: "combo", block: 7, speedPxSec: 34, flipEverySec: 0.3, rowBias: GOLDEN, swapsPerSec: 55, jitterAmp: 1.4, jitterFreq: 8, shearMix: 0.7 },
};

// Знаковое «проинтегрированное время» треугольной волны: скорость постоянна по модулю, но знак
// флипается каждые P секунд. Даёт ход вбок «туда P секунд, обратно P секунд» БЕЗ скачка (непрерывно).
// Результат колеблется в [0, P]; умножается на скорость → амплитуда сдвига ≈ speed*P.
export function shearSignedTime(t: number, periodSec: number): number {
  const P = periodSec > 0 ? periodSec : 1;
  const k = Math.floor(t / P);
  const frac = t - k * P;
  const completeSum = k % 2 === 0 ? 0 : P; // сумма знаков завершённых интервалов (пары гасятся)
  const signK = k % 2 === 0 ? 1 : -1; // знак текущего (незавершённого) интервала
  return completeSum + signK * frac;
}

// Горизонтальный сдвиг РЯДА r во времени t (px, ДО оборачивания по ширине — это делает рендер).
// Соседние ряды идут в противофазе (dir по чётности) + постоянный rowBias-сдвиг → ни один ряд не
// встаёт ровно относительно соседнего даже в момент, когда движение проходит через ноль.
export function rowShearOffset(spec: CensorSpec, row: number, t: number): number {
  const dir = row % 2 === 0 ? 1 : -1;
  const motion = dir * spec.speedPxSec * shearSignedTime(t, spec.flipEverySec);
  const bias = row * spec.rowBias * spec.block; // постоянная «расстройка» рядов
  return motion + bias;
}

// Детерминированный хеш (без Math.random — чисто и воспроизводимо). Возвращает [0,1).
function hash2(a: number, b: number): number {
  let h = (a * 73856093) ^ (b * 19349663);
  h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
  h ^= h >>> 15;
  return ((h >>> 0) % 100000) / 100000;
}
function hashInt(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

// Мелкое дрожание блока (col,row) — так он «никогда не стоит ровно». Фаза от координат → соседи
// колышутся вразнобой, а не унисоном. Чистая функция времени.
export function cellJitter(spec: CensorSpec, col: number, row: number, t: number): { dx: number; dy: number } {
  const ph = hash2(col, row) * Math.PI * 2;
  return {
    dx: spec.jitterAmp * Math.sin(t * spec.jitterFreq + ph),
    dy: spec.jitterAmp * Math.cos(t * spec.jitterFreq * 0.9 + ph * 1.3),
  };
}

// Пара соседних клеток для свапа №step (детерминированно). Вызывающий применяет свапы по порядку к
// своей рабочей сетке — накопление состояния это его забота, здесь только «кого с кем на шаге step».
export function swapPairAt(step: number, cols: number, rows: number): { a: number; b: number } {
  const h = hashInt(step);
  const c = h % cols;
  const r = Math.floor(h / cols) % rows;
  const horiz = ((h >>> 20) & 1) === 0;
  const c2 = horiz ? Math.min(cols - 1, c + 1) : c;
  const r2 = horiz ? r : Math.min(rows - 1, r + 1);
  return { a: r * cols + c, b: r2 * cols + c2 };
}

// mod, всегда неотрицательный (для оборачивания сдвига по ширине).
export function wrap(x: number, m: number): number {
  return ((x % m) + m) % m;
}
