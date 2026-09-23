// ЧТО БОТ ВИДИТ И ЧТО ЕМУ МОЖНО — собирается здесь, из стола и тени.
//
// Сервер знает все карты. Мозгу он отдаёт только публичное: круг, свою руку, РАЗМЕРЫ чужих рук и
// сводку памяти. Не из вежливости: бот, знающий чужую руку, играет в другую игру, и по его ходам
// это видно сразу — он перестаёт ошибаться там, где человек ошибается всегда.
//
// Легальные ходы собираются здесь же и отдаются мозгу списком. Мозг выбирает ИЗ списка — поэтому
// нелегального хода бот сделать не может, что бы ни ответила языковая модель.

import type { Face } from "../contract.js";
import type { Seats } from "../referee.js";
import { allowed, type Board, type Match } from "../games/match.js";
import { closed, nextOpener, RING } from "../games/krest.js";
import { krestMemory, type Deed } from "../games/krestMemory.js";
import type { BotView, Move } from "./brain.js";

/** Стол глазами тени: те же руки и круг, что читает судья. */
export function boardOf(seats: Seats): Board {
  const hands: Record<string, readonly Face[]> = {};
  for (const chair of seats.chairs) {
    if (chair.croupier) continue;
    hands[chair.id] = chair.hand.map((id) => seats.faceOf(id)).filter((f): f is Face => f !== undefined);
  }
  return { hands, circle: seats.pile(RING).map((id) => seats.faceOf(id)).filter((f): f is Face => f !== undefined) };
}

/**
 * ЧТО ЭТОМУ БОТУ МОЖНО ПРЯМО СЕЙЧАС. Пустой список — ходить не его дело: либо не его очередь, либо
 * партия кончена.
 */
export function legalMoves(seats: Seats, match: Match, chair: string): Move[] {
  const board = boardOf(seats);
  const can = allowed(match, board, chair);
  const seat = seats.chairs.find((one) => one.id === chair);
  const left = [...can.lay];
  const moves: Move[] = [];
  for (const id of seat?.hand ?? []) {
    const face = seats.faceOf(id);
    const at = face === undefined ? -1 : left.findIndex((one) => one.rank === face.rank && one.suit === face.suit);
    if (at !== -1) {
      left.splice(at, 1);
      moves.push({ t: "lay", id, card: face! });
    }
  }
  if (can.take) moves.push({ t: "take" });
  return moves;
}

/**
 * СТОЛ ГЛАЗАМИ БОТА.
 *
 * @param deeds история ходов партии — из неё считается память стола
 */
export function botView(seats: Seats, match: Match, chair: string, deeds: readonly Deed[]): BotView {
  const board = boardOf(seats);
  const hand = (seats.chairs.find((one) => one.id === chair)?.hand ?? [])
    .map((id) => ({ id, face: seats.faceOf(id) }))
    .filter((one): one is { id: string; face: Face } => one.face !== undefined);

  // ОСТАЛЬНЫЕ — ПО РАССАДКЕ ОТ СЕБЯ: кто ходит следующим, тот и первый в списке. Мозгу важен
  // порядок, а не имена: «следующему одна карта» — это угроза, «кому-то одна карта» — нет.
  const ring = match.ring;
  const at = ring.indexOf(chair);
  const order = at === -1 ? ring : [...ring.slice(at + 1), ...ring.slice(0, at)];
  const others = order.map((one) => ({
    chair: one,
    name: seats.chairs.find((c) => c.id === one)?.owner ?? one,
    cards: (board.hands[one] ?? []).length,
  }));

  // ЗАКРОЕТСЯ ЛИ КРУГ, ЕСЛИ Я ПОЛОЖУ: круг с порогом считает `krest.ts`, второго исполнения нет.
  const closesIfLay = match.threshold > 0 && closed({ table: [...board.circle, board.circle[0] ?? { rank: "6", suit: "d" }], threshold: match.threshold });
  const openerIfTake = board.circle.length <= 1 ? nextOpener({ by: "taken", who: chair }, ring) : null;

  const cards = Object.fromEntries(Object.entries(board.hands).map(([key, one]) => [key, one.length]));
  return { ring: board.circle, hand, others, closesIfLay, openerIfTake, facts: krestMemory(deeds, cards) };
}
