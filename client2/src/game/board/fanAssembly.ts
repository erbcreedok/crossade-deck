// Раскладка набора ВЕЕРОМ (issue #69, SELECTION-DESIGN §4.D). ОСЬ «форма», сестра rowAssembly:
// по упорядоченным id — offset ОТ якоря плюс НАКЛОН каждой карты (в отличие от ряда/стопки, у веера
// карты повёрнуты). Чистая геометрия дуги, без Pixi. GroupDrag ждёт offsets индекс-в-индекс со своим
// массивом элементов и применяет rot в setTarget.
//
// Модель: воображаемый шарнир НАД якорем на расстоянии R; карты свисают с него, повёрнутые на свой
// угол. Центральная карта — ровно на якоре (dx=dy=rot=0), края расходятся в стороны и ПРОВИСАЮТ вниз
// (dy>0), наклонённые наружу. Размах капается FAN_MAX_SPREAD, чтобы большой набор не перекрутился в
// кольцо — вместо этого шаг между картами ужимается.

import type { Offset } from "./assembly";

/** Угловой шаг между соседними картами при «свободном» веере (рад, ~10°). */
export const FAN_STEP = 0.18;
/** Максимальный суммарный размах веера (рад, ~86°) — крайние карты не расходятся дальше. */
export const FAN_MAX_SPREAD = 1.5;
/** Радиус дуги в ширинах карты: чем больше, тем положе веер. */
export const FAN_RADIUS_MULT = 2.6;

/** Веер всегда задаёт наклон — rot обязателен (у базового Offset он опционален). */
export type FanOffset = Offset & { rot: number };

/** Offsets веера для уже упорядоченного набора. Якорь — центральная карта. */
export function fanAssembly(orderedIds: readonly string[], cardW: number): FanOffset[] {
  const n = orderedIds.length;
  if (n === 0) return [];
  const R = cardW * FAN_RADIUS_MULT;
  const mid = (n - 1) / 2; // индекс центра (дробный при чётном n)
  // шаг ужимаем, если при FAN_STEP суммарный размах превысил бы кап
  const step = n > 1 ? Math.min(FAN_STEP, FAN_MAX_SPREAD / (n - 1)) : 0;
  return orderedIds.map((id, i) => {
    const angle = (i - mid) * step;
    return {
      id,
      dx: R * Math.sin(angle),
      dy: R * (1 - Math.cos(angle)), // провис: центр 0, края вниз
      rot: angle,
    };
  });
}
