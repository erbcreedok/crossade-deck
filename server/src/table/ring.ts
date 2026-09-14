// МЕСТА ЗА КРУГЛЫМ СТОЛОМ — одно правило на сервер и на клиент.
//
// Сервер решает, на какой угол сядет новый стул; клиент рисует стул на этом угле. Считай они порядок
// каждый своим кодом — стул на экране стоял бы не там, где его видит сосед.

/** Радиус, на котором стоят стулья, в единицах стола (сукно — 8). */
export const SEAT_RADIUS = 7;

/** ПОРЯДОК РАЗРЕЗАНИЯ ПИЦЦЫ: своя сторона, напротив, слева, справа, дальше пополам. */
export function ringOrder(levels = 8): number[] {
  const out = [0, 180];
  for (let k = 2; k <= levels; k += 1) {
    const step = 360 / 2 ** k;
    const fresh: number[] = [];
    for (let i = 0; i < 2 ** k; i += 1) {
      const a = (i * step) % 360;
      if (!out.includes(a) && !fresh.includes(a)) fresh.push(a);
    }
    fresh.sort((a, b) => {
      const near = Math.min(a, 360 - a) - Math.min(b, 360 - b);
      return near !== 0 ? near : b - a;
    });
    const left = new Set(fresh);
    for (const a of fresh) {
      if (!left.has(a)) continue;
      left.delete(a);
      out.push(a);
      const across = (a + 180) % 360;
      if (left.delete(across)) out.push(across);
    }
  }
  return out;
}

/** Первый угол по порядку пиццы, на котором ещё нет стула. */
export const freeAngle = (taken: readonly number[]): number => ringOrder().find((a) => !taken.includes(a)) ?? 0;

/** Середина места на столе — те же оси, что у сукна: +y к своей стороне, вниз экрана. */
export function seatPoint(angle: number, radius = SEAT_RADIUS): { x: number; y: number } {
  const t = (angle * Math.PI) / 180;
  return { x: Math.sin(t) * radius, y: Math.cos(t) * radius };
}
