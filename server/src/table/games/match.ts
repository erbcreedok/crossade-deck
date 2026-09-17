// СУДЬЯ ПАРТИИ КРЕСТОВОГО — кто сейчас ходит, что ему можно, и что случилось после его хода.
//
// Чистый автомат: входит состояние и ход, выходит новое состояние или отказ. Ни стола, ни сети, ни
// часов — поэтому вся партия, включая случаи, до которых за настоящим столом доигрывают полчаса,
// проверяется таблицей за миллисекунду.
//
// ГЛАВНОЕ, ЧТО ЗДЕСЬ ЛЕГКО СДЕЛАТЬ НЕВЕРНО: игрок с пустой рукой ВНУТРИ незакрытого круга остаётся
// участником этого круга. Очередь до него доходит, бить ему нечем, и он поднимает нижнюю — снова с
// картами. Именно на этом держится трудность выигрыша, и именно это ломается первым, если считать
// «пустая рука — значит вышел».

import type { Face } from "../contract.js";
import { beats, bottom, closed, firstMover, lay, openCircle, takeBottom, top, type Circle } from "./krest.js";

export interface Match {
  /** Кто ещё в партии, в порядке хода. Вышедшие отсюда убраны. */
  ring: readonly string[];
  hands: Readonly<Record<string, readonly Face[]>>;
  /** Круг идёт; `null` — круга нет, ждём, что его откроет `turn`. */
  circle: Circle | null;
  /** Чей ход. `null` — партия кончена. */
  turn: string | null;
  /** Кто закрыл последний круг — у него живой грип кольца. */
  closer: string | null;
  /** Вышедшие, в порядке выхода: первый — первый победитель. */
  out: readonly string[];
  /** Кто раздавал эту партию. Партия кончилась — раздаёт проигравший. */
  dealer: string | null;
  /** Проигравший: последний оставшийся с картами. Партия идёт — `null`. */
  loser: string | null;
}

export type Move = { t: "lay"; card: Face } | { t: "take" };
export type Refusal = "не-твой-ход" | "нет-такой-карты" | "не-бьёт" | "нечего-брать" | "партия-кончена" | "круг-надо-открыть";

/** Начало партии: ходит тот, у кого шестёрка буби, иначе раздающий. */
export function start(hands: Record<string, readonly Face[]>, dealer: string | null): Match {
  const ring = Object.keys(hands);
  return {
    ring,
    hands,
    circle: null,
    turn: firstMover(hands) ?? dealer ?? ring[0] ?? null,
    closer: null,
    out: [],
    dealer,
    loser: null,
  };
}

/** Следующий по кругу за этим. Его самого в кольце нет — берём начало. */
const after = (ring: readonly string[], who: string): string | null => {
  if (ring.length === 0) return null;
  const i = ring.indexOf(who);
  return i === -1 ? (ring[0] ?? null) : (ring[(i + 1) % ring.length] ?? null);
};

const without = (hand: readonly Face[], card: Face): readonly Face[] => {
  const i = hand.findIndex((f) => f.rank === card.rank && f.suit === card.suit);
  return i === -1 ? hand : [...hand.slice(0, i), ...hand.slice(i + 1)];
};

/**
 * ХОД. Отказ — это ответ, а не исключение: стол показывает его человеку так же, как «приёмка закрыта».
 */
export function move(m: Match, who: string, mv: Move): Match | { refused: Refusal } {
  if (m.turn === null) return { refused: "партия-кончена" };
  if (who !== m.turn) return { refused: "не-твой-ход" };
  return mv.t === "lay" ? layCard(m, who, mv.card) : takeCard(m, who);
}

function layCard(m: Match, who: string, card: Face): Match | { refused: Refusal } {
  const hand = m.hands[who] ?? [];
  if (without(hand, card) === hand) return { refused: "нет-такой-карты" };
  // КРУГА НЕТ — этот ход его открывает, и бить нечего: кладут что угодно, даже джокера.
  if (m.circle === null) {
    const withCards = m.ring.filter((p) => (m.hands[p] ?? []).length > 0).length;
    return handOff({ ...m, circle: openCircle(card, withCards), hands: { ...m.hands, [who]: without(hand, card) } }, who, "laid");
  }
  const over = top(m.circle);
  if (over !== undefined && !beats(card, over)) return { refused: "не-бьёт" };
  return handOff({ ...m, circle: lay(m.circle, card), hands: { ...m.hands, [who]: without(hand, card) } }, who, "laid");
}

function takeCard(m: Match, who: string): Match | { refused: Refusal } {
  if (m.circle === null) return { refused: "круг-надо-открыть" };
  const low = bottom(m.circle);
  if (low === undefined) return { refused: "нечего-брать" };
  const { circle } = takeBottom(m.circle);
  return handOff({ ...m, circle, hands: { ...m.hands, [who]: [...(m.hands[who] ?? []), low] } }, who, "taken");
}

/**
 * ЧТО ПОСЛЕ ХОДА: закрылся ли круг, кто вышел, кончилась ли партия, к кому перешла очередь.
 *
 * Выход считается ТОЛЬКО здесь и только при закрытом круге — в этом вся разница с наивным «рука
 * пуста, значит свободен».
 */
function handOff(m: Match, who: string, how: "laid" | "taken"): Match {
  if (m.circle === null || !closed(m.circle)) return { ...m, turn: after(m.ring, who) };

  // КРУГ ЗАКРЫТ. Сгребает тот, кто его закончил; следующий круг открывает он же, а если стол
  // разобрали — следующий за последним взявшим: сам взявший только что набрал руку.
  const opener = how === "laid" ? who : after(m.ring, who);
  const left = m.ring.filter((p) => (m.hands[p] ?? []).length > 0);
  const gone = m.ring.filter((p) => (m.hands[p] ?? []).length === 0);
  const ring = left;
  const out = [...m.out, ...gone];

  // Партия кончается, когда с картами остался один: он проигравший и он же раздаёт следующую.
  if (ring.length <= 1) {
    return { ...m, circle: null, ring, out, closer: who, turn: null, loser: ring[0] ?? null, dealer: ring[0] ?? m.dealer };
  }
  const turn = ring.includes(opener ?? "") ? opener : after(ring, opener ?? ring[0]!);
  return { ...m, circle: null, ring, out, closer: who, turn: turn ?? ring[0]! };
}

/** Что этот игрок может прямо сейчас — по этому стол зажигает зоны и подсказки. */
export function allowed(m: Match, who: string): { lay: Face[]; take: boolean } {
  if (m.turn !== who) return { lay: [], take: false };
  const hand = m.hands[who] ?? [];
  if (m.circle === null) return { lay: [...hand], take: false };
  const over = top(m.circle);
  return { lay: over === undefined ? [...hand] : hand.filter((f) => beats(f, over)), take: bottom(m.circle) !== undefined };
}
