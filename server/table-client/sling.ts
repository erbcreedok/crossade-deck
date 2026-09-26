// РОГАТКА — бросок карты из руки в центр камеры. Здесь только числа: натянута ли, как быстро заряжается,
// как пружинит карта, как часто вибрирует и что сделает отпускание. Кто что рисует и что уходит на сервер,
// решает экран (`screen.ts`).
//
// Как это чувствуется: палец вышел под карту — карта не едет за ним, только пружинит; пошла вибрация, к
// точке попадания растёт полупрозрачная стрелка. Чем дальше палец, тем быстрее заряд. Зарядилась — стрелка
// дотянулась, появился контур, финальный толчок. Бросок — только теперь; отпустил раньше или вернул палец на
// карту — отмена. Стрелка и контур — обещание: контур виден — карта улетит.

import { SLING } from "./screenConst.js";

/** Натянута ли: палец ниже карты (`dist` — сколько пикселей под её нижним краем). На карте — нет. */
export const tensed = (dist: number): boolean => dist > 0;

/** Заряд через `dt` секунд: чем дальше палец под картой, тем быстрее. 1 — заряжена. */
export function charged(charge: number, dist: number, dt: number): number {
  if (!tensed(dist) || dt <= 0) return Math.max(0, Math.min(1, charge));
  return Math.min(1, charge + dt * (SLING.rate0 + dist * SLING.ratePx));
}

/** Пружина: палец уходит сколько угодно, карта — не дальше `SLING.spring`. */
export const spring = (dist: number): number => SLING.spring * (1 - Math.exp(-Math.max(0, dist) / SLING.springPx));

/** Через сколько мс следующий толчок вибрации: реже в начале, чаще к заряду. */
export const buzzEvery = (charge: number): number => SLING.buzzSlow + (SLING.buzzFast - SLING.buzzSlow) * Math.max(0, Math.min(1, charge));

/** Что сделает отпускание: бросок — заряжена и цель на сукне; отказ — заряжена, но цель мимо; иначе — отмена. */
export function onRelease(armed: boolean, valid: boolean): "throw" | "refuse" | "cancel" {
  return !armed ? "cancel" : valid ? "throw" : "refuse";
}
