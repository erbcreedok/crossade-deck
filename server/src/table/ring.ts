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
 * ГДЕ ЛЕЖИТ КОЛОДА — не в середине стола, а у крупье: середину занимает круг хода, и колода там
 * спорила бы с ним за одно место. Радиус между кругом и стульями: до крупье рукой подать, до чужих
 * карт — нет.
 */
export const DECK_RADIUS = 5.4;
export const deckHome = (adminAngle = 0): { x: number; y: number } => seatPoint(croupierAngle(adminAngle), DECK_RADIUS);

/**
 * КРУГ ХОДА — его РАДИУС, в единицах сукна. Периметр статичен: круг нарисован раз и навсегда, а
 * меняется только то, что в нём лежит. Сукно — 8, стулья на 7: три единицы это плотный узел в
 * середине, который читается одним взглядом и на телефоне.
 */
export const RING_SPREAD = 3;

/** Карта в единицах сукна и зазор между соседями по кругу — тот же, что у веера руки. */
const CARD_W = 1;
const CARD_H = 1.4;
const APART = 1.15;

/**
 * КАРТЫ ЛЕЖАТ ВНУТРИ ОЧЕРЧЕННОГО КРУГА, а не верхом на его линии: контур — граница поля, и карта,
 * наполовину вылезшая наружу, читается как «упала мимо».
 */
export const RING_CARDS = RING_SPREAD - CARD_H / 2;

/**
 * СКОЛЬКО МЕСТ В КРУГЕ ПО УМОЛЧАНИЮ — не меньше трёх.
 *
 * Три и меньше карт стоят через 120°: круг читается как круг с первой же карты, а не как кучка
 * рядом. Четвёртая ужимает всех до 90°, и так дальше.
 */
export const RING_LEAST = 3;

/**
 * МЕСТ В КРУГЕ — ЧИСЛО, А НЕ ПРАВИЛО. `least` и `most` меняются на ходу: в партии оба станут числом
 * играющих, чтобы седьмая карта не легла при шести игроках. Сейчас `least` — три, `most` не задан.
 */
export function ringSlots(zone: { least?: number; most?: number; taken?: number }, n: number): number {
  const laid = (zone.taken ?? 0) + n;
  const most = zone.most;
  return Math.max(1, zone.least ?? RING_LEAST, most === undefined ? laid : Math.min(laid, most));
}

/** ШАГ МЕЖДУ СОСЕДЯМИ ПО КРУГУ, в градусах: места делят круг поровну, и только так. */
export const ringStep = (slots: number): number => 360 / Math.max(1, slots);

/**
 * ГДЕ ЛЕЖИТ КРУГ КАРТ, пока карты не начали тесниться.
 *
 * Кольцо у самого контура читается как ободок, а не как ход; кольцо в середине — как узел, где карты
 * стоят впритык. Отсюда это число: две трети пути до контура. РАЗЪЕЗЖАЮТСЯ карты только когда мест
 * стало столько, что соседи налезают друг на друга, и дальше контура не уходят никогда.
 */
export const RING_HOME = 1.5;

export function ringSpread(slots: number): number {
  const half = (ringStep(slots) * Math.PI) / 360;
  // Сколько нужно отойти от середины, чтобы между соседями осталась целая карта с зазором.
  const need = slots < 2 ? 0 : (CARD_W * APART) / (2 * Math.sin(half));
  return Math.min(RING_CARDS, Math.max(RING_HOME, need));
}

/**
 * ГДЕ ЛЕЖИТ i-я ИЗ n КАРТ В КРУГЕ — по окружности, в порядке хода, от угла зоны по часовой.
 *
 * Живёт здесь, а не в рисовании, потому что это ОБЩАЯ правда: по ней клиент рисует, а правила игр
 * считают, кто чью карту накрыл. Две копии этой формулы разошлись бы молча.
 */
export function ringSpot(at: { x: number; y: number; angle?: number }, i: number, slots: number, spread = ringSpread(slots)): { x: number; y: number } {
  const rad = (ringTurn(at.angle ?? 0, i, slots) * Math.PI) / 180;
  return { x: at.x + spread * Math.sin(rad), y: at.y - spread * Math.cos(rad) };
}

/** На каком угле круга стоит i-е из `slots` мест. */
export const ringTurn = (angle: number, i: number, slots: number): number => angle + ringStep(slots) * i;

/**
 * КАК ПОВЁРНУТА КАРТА КРУГА: ВЕРХОМ К СЕРЕДИНЕ. Круг читается как циферблат, а не как россыпь, и
 * сидящий напротив видит карту прямо — по кругу все карты смотрят в одну точку.
 */
export const ringFace = (angle: number, i: number, slots: number): number => ringTurn(angle, i, slots) + 180;

/**
 * ГДЕ РИСОВАТЬ i-Ю КАРТУ КРУГА — с учётом того, что уже сняли снизу.
 *
 * Место АБСОЛЮТНОЕ: снятые снизу плюс номер в стопке. Иначе взятая нижняя утащила бы за собой всех
 * остальных, а по правилу мастодонта на её месте должна остаться дыра — она и есть след того, что
 * кто-то взял.
 */
export function ringPlace(zone: { x: number; y: number; angle?: number; least?: number; most?: number; taken?: number }, i: number, n: number): { x: number; y: number } {
  return ringSpot(zone, (zone.taken ?? 0) + i, ringSlots(zone, n));
}

/** Как карта круга повёрнута — тот же счёт мест, что и у её места. */
export const ringPlaceFace = (zone: { angle?: number; least?: number; most?: number; taken?: number }, i: number, n: number): number =>
  ringFace(zone.angle ?? 0, (zone.taken ?? 0) + i, ringSlots(zone, n));
