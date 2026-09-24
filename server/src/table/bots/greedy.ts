// СКРИПТОВЫЙ МОЗГ — чистая функция от взгляда и характера.
//
// Он же ЗАПАСНОЙ для всех остальных: языковая модель упала, не уложилась в срок или вернула ход не
// из списка — ходит этот, мгновенно и всегда законно. Поэтому здесь нет ни сети, ни часов, ни
// случайности сверх той, что просит характер: запасной, который может не ответить, не запасной.
//
// ЦЕНА ХОДА — одно число, и всё различие характеров в весах. «Копитель» дорого оценивает расставание
// с козырем, «агрессор» дорого оценивает взятие из круга, «закрывала» — упущенное закрытие.

import { isJoker, TRUMP } from "../games/krest.js";
import type { Brain, BotView, Move, Profile } from "./brain.js";
import type { Face } from "../contract.js";

const ORDER = ["6", "7", "8", "9", "10", "J", "Q", "K", "A"];

/** Насколько эту карту жалко отдавать: от 0 (мусор) до 1 (джокер). */
export function worth(card: Face): number {
  if (isJoker(card)) return 1;
  const rank = ORDER.indexOf(card.rank) / (ORDER.length - 1);
  // КРЕСТИ ДОРОЖЕ ПРОЧЕГО: их бьют только крестями, поэтому крестовая карта — почти козырь.
  if (card.suit === "c") return 0.55 + rank * 0.4;
  if (card.suit === TRUMP) return 0.5 + rank * 0.45;
  // Шестёрка любой масти дороже своего ранга: ею бьют джокера.
  return (card.rank === "6" ? 0.25 : 0) + rank * 0.5;
}

/**
 * ЧЕГО СТОИТ ЭТОТ ХОД. Меньше — лучше: это цена, а не награда.
 *
 * Возвращается наружу ради сторожей: цену видно числом, и «почему бот так сходил» не приходится
 * угадывать по поведению.
 */
export function price(move: Move, view: BotView, profile: Profile): number {
  if (move.t === "take") {
    // ВЗЯТЬ — ШАГ НАЗАД ОТ ПОБЕДЫ, и это главный закон игры, а не оттенок характера: выигрывает
    // тот, кто первым остался без карт, а взявший прибавил себе одну. Поэтому цена взятия растёт
    // вместе с рукой: с двумя картами взять — почти проиграть круг, с десятью — мелочь.
    const low = view.ring[0];
    const gain = low === undefined ? 0 : worth(low) * 0.3;
    // Порог — настоящий край, а не «мало карт»: на трёх картах игрок ещё волен беречь козырь, и
    // сторож характеров это ловит. Считается от двух, где взятие отбрасывает прямо от победы.
    const close = view.hand.length <= 2 ? (3 - view.hand.length) * 0.5 : 0;
    return 0.5 + profile.presses * 0.5 + close - gain;
  }
  // ЦЕНА СИЛЬНОЙ КАРТЫ МЕНЯЕТ ЗНАК. Копителю дорогая карта — потеря, агрессору — замысел: он давит
  // старшей нарочно. Поэтому вес при `worth` у одного положительный, у другого отрицательный, и это
  // не «настройка силы», а разные игроки.
  let cost = worth(move.card) * (0.4 + profile.hoards * 0.6 - profile.presses * 0.65);
  // ЗАКРЫТЬ КРУГ — выгода: следующий круг открываю я и скидываю что захочу.
  if (view.closesIfLay) cost -= profile.closes * 0.6;
  // РУКА ПОЧТИ ПУСТА — избавляться от карт важнее, чем беречь их: выигрывает тот, кто вышел.
  if (view.hand.length <= 2) cost -= 0.4;
  return cost;
}

/** Самый дешёвый ход; при равенстве — первый по списку, чтобы бот был воспроизводим. */
export function best(legal: readonly Move[], view: BotView, profile: Profile): Move {
  let pick = legal[0]!;
  let low = Number.POSITIVE_INFINITY;
  for (const move of legal) {
    const cost = price(move, view, profile);
    if (cost < low) {
      low = cost;
      pick = move;
    }
  }
  return pick;
}

export const greedyBrain = (): Brain => ({
  key: "greedy",
  choose: async (legal, view, profile) => best(legal, view, profile),
});

/** Любой законный ход — для «новичка» и для сторожей, которым нужен непредсказуемый сосед. */
export const randomBrain = (rnd: () => number = Math.random): Brain => ({
  key: "random",
  choose: async (legal) => legal[Math.min(legal.length - 1, Math.floor(rnd() * legal.length))]!,
});
