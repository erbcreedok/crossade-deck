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

/**
 * Крупье сидит ВНЕ кольца — сразу за кромкой сукна (она на 8), чтобы место не путали со стулом игрока.
 * Дальше отодвигать нельзя: на узком экране он уезжает за край и до него не дотянуться.
 */
export const CROUPIER_RADIUS = SEAT_RADIUS + 1.2;
/**
 * КРУПЬЕ СИДИТ НА ДЕСЯТИ ЧАСАХ ОТ АДМИНА. Углы растут против часовой стрелки на экране (0 — своя сторона,
 * шесть часов), поэтому час убывает на каждые 30°: десять часов от админа — это его угол плюс 240°.
 */
export const croupierAngle = (adminAngle = 0): number => (((adminAngle + 240) % 360) + 360) % 360;

/** Середина места на столе — те же оси, что у сукна: +y к своей стороне, вниз экрана. */
export function seatPoint(angle: number, radius = SEAT_RADIUS): { x: number; y: number } {
  const t = (angle * Math.PI) / 180;
  return { x: Math.sin(t) * radius, y: Math.cos(t) * radius };
}

/**
 * РАДИУС КОЛЬЦА ЗОНЫ с позой `ring`, в единицах сукна: карта стоит НА кольце, а не в середине.
 */
export const RING_SPREAD = 1.6;

/**
 * ГДЕ ЛЕЖИТ i-я ИЗ n КАРТ В ЗОНЕ-КОЛЬЦЕ — по кругу, в порядке хода, от угла зоны по часовой.
 *
 * Живёт здесь, а не в рисовании, потому что это ОБЩАЯ правда: по ней клиент рисует, а правила игр
 * считают, кто чью карту накрыл. Две копии этой формулы разошлись бы молча.
 */
export function ringSpot(at: { x: number; y: number; angle?: number }, i: number, n: number, spread = RING_SPREAD): { x: number; y: number } {
  const rad = (((at.angle ?? 0) + (360 / Math.max(1, n)) * i) * Math.PI) / 180;
  return { x: at.x + spread * Math.sin(rad), y: at.y - spread * Math.cos(rad) };
}

/**
 * ГДЕ РИСОВАТЬ i-Ю КАРТУ ЗОНЫ-КОЛЬЦА — с учётом того, что уже сняли снизу.
 *
 * Место АБСОЛЮТНОЕ: снятые снизу плюс номер в стопке. Иначе взятая нижняя утащила бы за собой всех
 * остальных, а по правилу мастодонта на её месте должна остаться дыра — она и есть след того, что
 * кто-то взял. Мест в кольце не меньше, чем карт легло за круг: положили ещё одну — прежние стоят.
 */
export function ringPlace(zone: { x: number; y: number; angle?: number; seats?: number; taken?: number }, i: number, n: number): { x: number; y: number } {
  const taken = zone.taken ?? 0;
  return ringSpot(zone, taken + i, Math.max(zone.seats ?? 0, taken + n));
}
