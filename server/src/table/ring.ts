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
 * МЕСТ В КРУГЕ НЕ МЕНЬШЕ ТРЁХ — дело самого метода раскладки, а не настройка зоны.
 *
 * Три и меньше карт стоят через 120°: круг читается как круг с первой же карты, а не как кучка рядом.
 */
export const RING_LEAST = 3;

/** ШАГ МЕЖДУ СОСЕДЯМИ ПО КРУГУ, в градусах: места делят круг поровну, и только так. */
export const ringStep = (slots: number): number => 360 / Math.max(1, slots);

/**
 * КАК ДАЛЕКО ОТ СЕРЕДИНЫ ЛЕЖИТ КРУГ.
 *
 * Кольцо у самого контура читается как ободок, а не как ход; кольцо в середине — как узел, где карты
 * стоят впритык. Отсюда `RING_HOME`: две трети пути до контура. Стало тесно — круг РАЗДВИГАЕТСЯ
 * наружу, пока соседям не хватит места, и дальше контура не уходит никогда.
 */
export const RING_HOME = 1.5;

export function ringSpread(slots: number): number {
  const half = (ringStep(slots) * Math.PI) / 360;
  const need = slots < 2 ? 0 : (CARD_W * APART) / (2 * Math.sin(half));
  return Math.min(RING_CARDS, Math.max(RING_HOME, need));
}

/**
 * ГДЕ ЛЕЖИТ i-е ИЗ `slots` МЕСТ — по окружности, в порядке хода, от угла зоны по часовой.
 *
 * Живёт здесь, а не в рисовании, потому что это ОБЩАЯ правда: по ней раскладка пишет места, а
 * правила игр считают, кто чью карту накрыл. Две копии этой формулы разошлись бы молча.
 */
export function ringSpot(at: { x: number; y: number }, turn: number, spread: number): { x: number; y: number } {
  const rad = (turn * Math.PI) / 180;
  return { x: at.x + spread * Math.sin(rad), y: at.y - spread * Math.cos(rad) };
}

/**
 * КАК ПОВЁРНУТА КАРТА КРУГА: ВЕРХОМ К СЕРЕДИНЕ. Круг читается как циферблат, а не как россыпь, и
 * сидящий напротив видит карту прямо — по кругу все карты смотрят в одну точку.
 */
export const ringFace = (turn: number): number => facing(turn + 180);

/** Поворот в тех же пределах, в каких стол держит все повороты: (−180, 180]. */
function facing(deg: number): number {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
}

/** Место карты: где лежит и как повёрнута. То же, что едет в снимке (`Laid`). */
export interface RingPlace {
  x: number;
  y: number;
  angle: number;
}

/**
 * РАСКЛАДКА КРУГА — ЕДИНСТВЕННОЕ МЕСТО, ГДЕ У КАРТ ПОЯВЛЯЮТСЯ МЕСТА.
 *
 * Зовётся только когда в круг КЛАДУТ карту со сменой порядка. Между вызовами кода, который следил бы
 * за порядком, не существует вовсе: подвинули карту — она там и лежит, вынесли — осталась дыра.
 *
 * `anchor` — угол, за который круг держится: угол первой карты, как она лежала до перекладывания.
 * Без него круг проворачивался бы целиком от каждого реордера.
 */
export function ringLay(middle: { x: number; y: number }, n: number, anchor = 0): RingPlace[] {
  const slots = Math.max(RING_LEAST, n);
  const step = ringStep(slots);
  const spread = ringSpread(slots);
  return Array.from({ length: n }, (_, i) => {
    const turn = anchor + step * i;
    const at = ringSpot(middle, turn, spread);
    return { x: at.x, y: at.y, angle: ringFace(turn) };
  });
}

/**
 * ПОМНИТ ЛИ КАРТА СВОЁ МЕСТО В ЭТОМ КРУГЕ. Место — просто точка стола, и само по себе не говорит, чьё
 * оно: круг узнаёт своё по тому, что оно лежит внутри его поля. Чужое или устаревшее — не подойдёт, и
 * карте дадут новое.
 */
export const ringKeeps = (middle: { x: number; y: number }, at: { x: number; y: number }): boolean =>
  Math.hypot(at.x - middle.x, at.y - middle.y) <= RING_SPREAD;

/**
 * ГДЕ В КРУГЕ ДЫРЫ — выводится ИЗ САМИХ КАРТ, а не хранится.
 *
 * Шаг виден по ближайшим соседям: самый маленький угол между разложенными картами и есть шаг круга.
 * Всё, что кратно ему и пусто, — дыра, оставшаяся от взятой карты. Поэтому дыры не надо ни писать, ни
 * чистить: они исчезают вместе с перекладыванием, само собой.
 */
export function ringHoles(middle: { x: number; y: number }, laid: readonly RingPlace[]): RingPlace[] {
  if (laid.length < 2) return [];
  const turns = laid.map((one) => norm((Math.atan2(one.x - middle.x, middle.y - one.y) * 180) / Math.PI)).sort((a, b) => a - b);
  const gaps = turns.map((one, i) => norm(turns[(i + 1) % turns.length]! - one) || 360);
  const step = Math.min(...gaps);
  if (step < 1) return [];
  const spread = Math.hypot(laid[0]!.x - middle.x, laid[0]!.y - middle.y);
  const out: RingPlace[] = [];
  for (const [i, gap] of gaps.entries()) {
    // Дыр между соседями столько, сколько целых шагов в промежутке сверх одного.
    for (let k = 1; k < Math.round(gap / step); k += 1) {
      const turn = norm(turns[i]! + step * k);
      const at = ringSpot(middle, turn, spread);
      out.push({ x: at.x, y: at.y, angle: ringFace(turn) });
    }
  }
  return out;
}

const norm = (deg: number): number => ((deg % 360) + 360) % 360;
