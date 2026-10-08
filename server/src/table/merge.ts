// СЛИЯНИЕ ДЕРЖАНИЕМ: что происходит с вещью, которую навели на другую и держат неподвижно. Чистые функции от времени — по ним же считает и экран, и сторож.
//
//   0 … задержка          нет реакции, вещь свободна;
//   задержка … + свет     верхняя вещь легла на нижнюю, горит ровный свет;
//   … + мигание           свет гаснет и мигает всё чаще и всё дольше горит;
//   дальше                нижняя вещь поднимается под палец (слияние началось).
// Палец, сдвинувшийся от места остановки больше чем на `MERGE_STILL` пикселей до начала подъёма, всё отменяет.

import type { MergeKnobs } from "./contract.js";

export type MergePhase = "free" | "steady" | "blink" | "lift";

/** Сдвиг пальца от места остановки, начиная с которого это уже «движение», пикселей. */
export const MERGE_STILL = 14;

/** Фаза через `el` мс после остановки пальца над целью. */
export function mergePhase(el: number, t: Pick<MergeKnobs, "delay" | "glow" | "blink">): MergePhase {
  if (el < t.delay) return "free";
  if (el < t.delay + t.glow) return "steady";
  if (el < t.delay + t.glow + t.blink) return "blink";
  return "lift";
}

/**
 * Горит ли свет в мигании, `at` мс после его начала из `blink` мс. Начинается с паузы; вспышки учащаются, и доля «горит» растёт от `BLINK.duty0` до `BLINK.duty1`:
 * сначала горит реже, чем не горит, потом чаще. Вспышек не меньше `BLINK.min` даже в коротком мигании (400 мс), иначе его не видно; в длинном — по одной на `BLINK.perMs` мс.
 */
export const BLINK = { min: 3, perMs: 180, duty0: 0.3, duty1: 0.85 } as const;
export function blinkOn(at: number, blink: number): boolean {
  if (blink <= 0) return false;
  const k = Math.max(0, Math.min(at, blink)) / blink, cycles = Math.max(BLINK.min, Math.round(blink / BLINK.perMs));
  const phase = cycles * k * (0.55 + 0.45 * k);
  const duty = BLINK.duty0 + (BLINK.duty1 - BLINK.duty0) * k;
  return phase - Math.floor(phase) >= 1 - duty;
}
