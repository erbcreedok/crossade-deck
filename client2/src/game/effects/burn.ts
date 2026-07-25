import { TEX_H, TEX_W } from "../engine/constants";

// Эффект «сжечь» — ЧИСТАЯ математика кадра (без Pixi). Две фазы: ЗАМИРАНИЕ (держим, дрожь
// нарастает) → РАСХОД снизу вверх (маска отрезает низ волнистым «фронтом горения») при сильной
// дрожи. Возвращает описание кадра; элемент лишь применяет его (позиция/маска/тень). Тестируется.

export const BURN_FREEZE = 0.14;
export const BURN_DISSOLVE = 0.5;
export const BURN_DUR = BURN_FREEZE + BURN_DISSOLVE;

export interface BurnFrame {
  jitterX: number;
  jitterY: number;
  // null в фазе замирания; иначе — расход снизу вверх.
  dissolve: {
    p: number; // 0..1 прогресс расхода
    maskPoints: number[]; // полигон ВИДИМОЙ (верхней) части в локальных координатах карты
    shadowShrink: number | null; // множитель высоты тени; null → тень убрать
  } | null;
}

/** t — время с начала горения; age — непрерывный возраст (дрожь/волна); width — ширина карты. */
export function burnFrame(t: number, age: number, width: number): BurnFrame {
  const amp = width * 0.055; // «сильная дрожь»
  const jx = Math.sin(age * 92) * amp + Math.sin(age * 57) * amp * 0.5;
  const jy = Math.cos(age * 78) * amp * 0.7;

  if (t < BURN_FREEZE) {
    const q = t / BURN_FREEZE; // дрожь плавно нарастает
    return { jitterX: jx * q, jitterY: jy * q, dissolve: null };
  }

  const p = Math.min(1, (t - BURN_FREEZE) / BURN_DISSOLVE);
  const frontY = -TEX_H / 2 + TEX_H * (1 - p); // фронт едет вверх
  const pts: number[] = [-TEX_W / 2, -TEX_H / 2, TEX_W / 2, -TEX_H / 2]; // верхняя кромка
  const seg = 10;
  for (let k = 0; k <= seg; k++) {
    const x = TEX_W / 2 - TEX_W * (k / seg);
    pts.push(x, frontY + Math.sin(x * 0.18 + age * 26 + k) * TEX_H * 0.05); // волнистый фронт
  }
  return {
    jitterX: jx,
    jitterY: jy,
    dissolve: { p, maskPoints: pts, shadowShrink: p > 0.85 ? null : 1 - p },
  };
}
