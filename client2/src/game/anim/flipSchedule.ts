import { scaled, type AnimPreset } from "./presets";

// РАСПИСАНИЕ ПЕРЕВОРОТА ПАЧКИ — чистая функция «кто когда переворачивается».
//
// Вынесено из движка сознательно. Раньше переворот пачки был методом `PlaygroundEngine.flipGroup`:
// он и решал, что делать, и делал это. Проверить решение было нечем — Pixi в node не исполняется,
// а значит любой ответ про порядок и задержки пришлось бы принимать на слово.
//
// Здесь решение отделено от исполнения: функция говорит, какая карта переворачивается на какой
// секунде и куда переезжает; движок только исполняет. Тестируется юнитом, живёт без сцены и —
// главное — подменяется пресетом, не трогая ни строки движка.

export interface FlipStep {
  id: string;
  /** Через сколько секунд от команды карта начнёт переворот. */
  delay: number;
  /**
   * Чей дом занимает карта после переворота — ИНДЕКС в исходном порядке.
   * При `reverse: false` это её собственный индекс, то есть карта остаётся на месте.
   */
  toIndex: number;
}

/**
 * Расписание переворота пачки.
 *
 * `whole` — пачку перевернули как ПРЕДМЕТ: все карты стартуют одновременно, задержек нет.
 * `cascade` — волна слева направо: каждая следующая отстаёт на `stagger`.
 *
 * Реверс порядка — отдельная ось (см. `StackFlipTiming.reverse`) и применяется к обоим режимам.
 * Ускорение `speed` сжимает задержки: волна на «быстром» пресете обязана быть короче, иначе
 * ускорился бы флип каждой карты, а сама волна тянулась бы прежнее время.
 */
export function flipSchedule(ids: readonly string[], p: AnimPreset): FlipStep[] {
  const n = ids.length;
  const { mode, stagger, reverse } = p.stackFlip;
  const step = mode === "cascade" ? scaled(stagger, p.speed) : 0;
  return ids.map((id, i) => ({ id, delay: i * step, toIndex: reverse ? n - 1 - i : i }));
}

/** Сколько всего длится переворот пачки: последняя задержка плюс её собственный флип. */
export function flipDuration(count: number, p: AnimPreset): number {
  if (count <= 0) return 0;
  const last = flipSchedule(Array.from({ length: count }, (_, i) => String(i)), p).at(-1)!;
  return last.delay + scaled(p.flip.dur, p.speed);
}
