// ЧАСЫ ЗАПИСИ — как идёт проигрывание.
//
//   `time` — В РЕАЛЬНОМ ВРЕМЕНИ: часы записи идут непрерывно, как шли у игроков, и каждое мгновение
//            встаёт ровно тогда, когда оно случилось. Паузы не поджимаются: сидел и думал минуту —
//            минута и идёт (или её четверть на 4×).
//   `step` — ПОШАГОВО: каждое мгновение по очереди, через ровный промежуток, как бы далеко во времени
//            ни было следующее.
//
// Скорость у обоих своя и одна и та же ручка: 1×, 2×, 4×…
//
// Чистое: мгновения и настенные часы на вход, номер шага на выход. Ни таймеров, ни DOM.

export type ReplayMode = "time" | "step";
export const REPLAY_MODES: readonly ReplayMode[] = ["time", "step"];
export const REPLAY_SPEEDS = [1, 2, 4, 8, 16] as const;
/** Промежуток между шагами на 1× в пошаговом режиме. */
export const STEP_MS = 600;

/** Последнее мгновение не позже `recordAt`, не раньше `from`: куда часы записи уже дошли. */
export function stepAt(ats: readonly number[], from: number, recordAt: number): number {
  let i = Math.max(0, from);
  while (i + 1 < ats.length && ats[i + 1]! <= recordAt) i += 1;
  return i;
}

/**
 * ПРОИГРЫВАНИЕ, ПРИВЯЗАННОЕ К СТЕНЕ. Точка отсчёта — шаг и настенное время, когда нажали «играть» (или
 * сменили скорость, или перемотали): дальше шаг считается от них, а не накапливается от кадра к кадру,
 * поэтому пропущенный кадр браузера не сдвигает запись и не копит отставание.
 */
export function playhead(ats: readonly number[], anchor: { step: number; wall: number }, mode: ReplayMode, speed: number) {
  const startAt = ats[anchor.step] ?? 0;
  return {
    /** Время записи сейчас — для часов на экране; в пошаговом это время текущего шага. */
    recordAt(wall: number): number {
      if (mode === "time") return Math.min(ats[ats.length - 1] ?? startAt, startAt + (wall - anchor.wall) * speed);
      return ats[this.step(wall)] ?? startAt;
    },
    step(wall: number): number {
      if (mode === "time") return stepAt(ats, anchor.step, startAt + (wall - anchor.wall) * speed);
      return Math.min(ats.length - 1, anchor.step + Math.floor(((wall - anchor.wall) * speed) / STEP_MS));
    },
  };
}

/** Время записи словами: «1:05.3». */
export const clockText = (ms: number): string => {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
};
