import { DRAG_SCALE, LIFT_SCALE } from "../engine/constants";
import type { CardState } from "./Card";

// План элемента → масштаб покоя. Тень живёт отдельно и одна на всех: ui/shadow.ts.

/** Масштаб плана. Удержание = симуляция драга (тот же размер); парение чуть крупнее. */
export function scaleForState(s: CardState): number {
  if (s === "held" || s === "drag") return DRAG_SCALE;
  if (s === "lifted") return LIFT_SCALE;
  return 1;
}
