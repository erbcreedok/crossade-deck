// КУДА ПОСТАВИТЬ НОВЫЙ СТУЛ — арифметика круга, и ничего больше.
//
// НЕ СЕТКА, В КОТОРОЙ СТУЛЬЯ ЖИВУТ. Стул двигают свободно, и никаких гнёзд на сукне нет; эти точки
// нужны РОВНО В ОДИН МОМЕНТ — когда за стол ставят ещё один стул. Иначе все новые стулья валились
// бы в одно место, и стол, за которым никто не потрудился подвинуться, выглядел бы свалкой.
//
// ПОРЯДОК — КАК РЕЖУТ ПИЦЦУ, не по номерам людей: сначала своя сторона (шесть часов), потом
// напротив, потом слева и справа, потом углы между ними — и каждый раз пополам от того, что уже
// занято. Занятость и решает: человек, пересевший с трёх часов на семь, освобождает три часа, и
// следующий стул встанет туда, а не «третьим по счёту».
//
// СВОБОДЕН — ЗНАЧИТ НИКОГО РЯДОМ. Место, где стул задел бы соседний, занято: рассадка не ставит
// людей друг на друга, даже если формально точка ещё ничья.

import type { Vec } from "game-kit";

/** Полный круг в градусах — чтобы число не расползлось по файлу. */
const ROUND = 360;

/** Шесть часов: своё место, ближний край стола. От него и пляшет весь круг. */
const NEAR = 0;

/**
 * УГЛЫ ПО ПОРЯДКУ РАЗРЕЗАНИЯ. Первый — ближний край, второй — напротив, дальше каждый уровень
 * делит пополам то, что уже разложено: слева, справа, затем углы.
 *
 * `levels` — сколько раз делить. Восемь уровней — это 256 точек, больше, чем комната держит людей.
 */
export function ringOrder(levels = 8): readonly number[] {
  const out: number[] = [NEAR, NEAR + ROUND / 2];
  for (let k = 2; k <= levels; k += 1) {
    const step = ROUND / 2 ** k;
    const fresh: number[] = [];
    for (let i = 0; i < 2 ** k; i += 1) {
      const angle = (i * step) % ROUND;
      if (!out.includes(angle) && !fresh.includes(angle)) fresh.push(angle);
    }
    // БЛИЖНИЕ К СВОЕМУ КРАЮ — ПЕРВЫМИ, И СНАЧАЛА ЛЕВАЯ ИЗ ПАРЫ: садиться начинают от себя, а не от
    // дальнего края, и из двух равных углов человек занимает тот, что по левую руку.
    fresh.sort((a, b) => {
      const near = Math.min(a, ROUND - a) - Math.min(b, ROUND - b);
      return near !== 0 ? near : b - a;
    });
    // ...и каждый занятый угол тут же тянет за собой свой противоположный: стол должен оставаться
    // уравновешенным, пока за ним не сели все.
    const left = new Set(fresh);
    for (const angle of fresh) {
      if (!left.has(angle)) continue;
      left.delete(angle);
      out.push(angle);
      const across = (angle + ROUND / 2) % ROUND;
      if (left.delete(across)) out.push(across);
    }
  }
  return out;
}

/** Точка на круге этого радиуса, в тех же осях, что и места стола (`seatPlaces`). */
export function ringSpot(angle: number, radius: number): { readonly at: Vec; readonly facing: number } {
  const turn = (angle * Math.PI) / 180;
  return { at: { x: Math.sin(turn) * radius, y: Math.cos(turn) * radius }, facing: angle };
}

/**
 * МЕСТА ПО ПОРЯДКУ РАЗРЕЗАНИЯ — сколько просят, столько и будет: первое у своего края, второе
 * напротив, дальше пополам. Ими стол и открывается, чтобы стартовая рассадка и новый стул считались
 * одним правилом, а не двумя, которые однажды разойдутся.
 */
export function ringPlaces(n: number, radius: number): readonly { readonly at: Vec; readonly facing: number }[] {
  return ringOrder()
    .slice(0, Math.max(0, n))
    .map((angle) => ringSpot(angle, radius));
}

export interface FreeSpotAsk {
  /** Где уже стоят стулья — их точки, как они сейчас на сукне. */
  readonly taken: readonly Vec[];
  /** Радиус круга, по которому рассаживают. */
  readonly radius: number;
  /** Ближе этого стул задевает соседний, и точка считается занятой. */
  readonly apart: number;
  readonly levels?: number;
}

/**
 * ПЕРВАЯ СВОБОДНАЯ ТОЧКА ПО ПОРЯДКУ РАЗРЕЗАНИЯ.
 *
 * ТОЧЕК НЕ ХВАТИЛО — СТУЛ ВСЁ РАВНО ВСТАЁТ: в середину самого широкого промежутка между соседями.
 * Стол не отказывает в стуле из-за тесноты и не ставит его поверх чужого; он ищет, где просторнее
 * всего, — ровно как это сделал бы человек, подвигая себе место в плотном ряду.
 */
export function freeRingSpot(ask: FreeSpotAsk): { readonly at: Vec; readonly facing: number } {
  const away = (spot: Vec): number =>
    ask.taken.length === 0 ? Infinity : Math.min(...ask.taken.map((one) => Math.hypot(one.x - spot.x, one.y - spot.y)));
  for (const angle of ringOrder(ask.levels)) {
    const spot = ringSpot(angle, ask.radius);
    if (away(spot.at) >= ask.apart) return spot;
  }
  return ringSpot(widestGap(ask.taken), ask.radius);
}

/** Середина самой широкой дуги между занятыми углами. Пусто — свой край, там никого нет вовсе. */
function widestGap(taken: readonly Vec[]): number {
  if (taken.length === 0) return NEAR;
  const angles = taken
    .map((one) => ((Math.atan2(one.x, one.y) * 180) / Math.PI + ROUND) % ROUND)
    .sort((a, b) => a - b);
  let best = { middle: NEAR, gap: -1 };
  for (let i = 0; i < angles.length; i += 1) {
    const from = angles[i]!;
    const to = i + 1 < angles.length ? angles[i + 1]! : angles[0]! + ROUND;
    const gap = to - from;
    if (gap > best.gap) best = { middle: (from + gap / 2) % ROUND, gap };
  }
  return best.middle;
}
