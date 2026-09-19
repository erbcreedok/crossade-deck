// РАССКАЗ ЭКРАНА — копилка и правила отправки.
//
// Лежит в общем коде обоих концов (рядом с `contract.ts` и `patch.ts`): пользуется им клиент, а
// проверяется он серверным прогоном — для того и написан без единого обращения к браузеру.
//
// Здесь только копилка и правила отправки. Ни одного обращения к браузеру: всё, что свидетель знает
// о мире, ему приносят снаружи. Поэтому его можно прогнать обычным тестом, без страницы и без
// Playwright, — а ловля нажатий, звука и падений живёт в `watchScreen`, где браузер уже есть.
//
// Три правила, и все три — про то, чтобы рассказ не мешал игре:
//
// 1. НИЧЕГО НЕ ЖДЁМ В ОТВЕТ. Рассказ ни на что не влияет; потерянная пачка — не беда.
// 2. ПАЧКА, А НЕ РУЧЕЁК. Слать по событию значит слать во время жеста, ровно тогда, когда сеть нужна
//    самому жесту.
// 3. ОДИНАКОВОЕ ПОДРЯД СЖИМАЕТСЯ. Палец по экрану — это сотни событий в секунду, и сотня записей
//    «двигал пальцем» не рассказывает больше, чем одна запись «двигал пальцем, 143 раза».

import type { Seen } from "./contract.js";

/** Как часто копилка уходит на сервер. */
export const TELL_EVERY_MS = 5000;
/** Больше этого не копим: на сервере всё равно предел, а память экрана не бездонная. */
export const HEAP_MAX = 60;
/** Одинаковые события, случившиеся подряд в этом окне, сливаются в одно со счётчиком. */
export const SAME_MS = 1000;

export interface Witness {
  /** Отметить случившееся. */
  saw(kind: string, what?: unknown): void;
  /** Отправить накопленное прямо сейчас. */
  tell(): void;
  /** Что лежит в копилке — для прогонов. */
  readonly heap: readonly Seen[];
}

interface Held extends Seen {
  times?: number;
}

const same = (a: Held, kind: string, what: unknown, at: number): boolean =>
  a.kind === kind && at - a.at < SAME_MS && JSON.stringify(a.what) === JSON.stringify(what);

export interface Clock {
  now(): number;
  later(run: () => void, ms: number): unknown;
  stop(timer: unknown): void;
}

/**
 * @param send  куда уходит пачка
 * @param clock часы и таймер; подменяются в прогонах
 * @param every через сколько копилка уходит сама
 */
export function tableWitness(send: (seen: readonly Seen[]) => void, clock: Clock, every: number = TELL_EVERY_MS): Witness {
  let heap: Held[] = [];
  let timer: unknown;

  const tell = (): void => {
    if (timer !== undefined) {
      clock.stop(timer);
      timer = undefined;
    }
    if (heap.length === 0) return;
    const going = heap;
    heap = [];
    try {
      send(going.map(({ times, ...one }) => (times === undefined ? one : { ...one, what: { ...(one.what as object), times } })));
    } catch {
      // Рассказ не доехал — и не надо. Ошибка отправки не имеет права всплыть в игру, а повторять
      // потерянное значит слать вдвое больше ровно тогда, когда с сетью уже плохо.
    }
  };

  return {
    get heap() {
      return heap;
    },
    saw(kind, what) {
      const at = clock.now();
      const last = heap[heap.length - 1];
      if (last && same(last, kind, what, at)) {
        last.times = (last.times ?? 1) + 1;
        return;
      }
      heap.push({ at, kind, ...(what === undefined ? {} : { what }) });
      if (heap.length >= HEAP_MAX) tell();
      else if (timer === undefined) timer = clock.later(tell, every);
    },
    tell,
  };
}
