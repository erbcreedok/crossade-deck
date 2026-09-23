// СУДЬЯ КРЕСТОВОГО — обёртка над тенью партии (`match.ts`): переводит жесты стола в ходы партии.
//
// Положил в круг хода — `lay`, забрал из круга в свою руку — `take`. Всё остальное, что делают со
// столом руками (админ вернул карту в круг, дал игроку недостающую, переложил из чужой руки), — это
// УБОРКА СТОЛА: очередь она не двигает, но и не ломает ничего, потому что тень карт не помнит и
// перечитывает их перед каждым ответом.
//
// Если тень вдруг сказала бы «нельзя», судья её не слушает: стол уже сходил, и расходиться им нельзя.

import type { Face, Intent, Play } from "../contract.js";
import type { Referee, Seats } from "../referee.js";
import { RING } from "./krest.js";
import { advance, allowed, start, type Board, type Match } from "./match.js";

const ownerOf = (seats: Seats, chair: string | null): string | null => (chair === null ? null : (seats.chairs.find((c) => c.id === chair)?.owner ?? null));

/** СТОЛ ГЛАЗАМИ ТЕНИ — читается заново перед каждым ответом, ни одна карта не кэшируется. */
function boardOf(seats: Seats): Board {
  const hands: Record<string, readonly Face[]> = {};
  for (const chair of seats.chairs) {
    if (chair.croupier) continue;
    hands[chair.id] = chair.hand.map((id) => seats.faceOf(id)).filter((f): f is Face => f !== undefined);
  }
  const circle = seats.pile(RING).map((id) => seats.faceOf(id)).filter((f): f is Face => f !== undefined);
  return { hands, circle };
}

export function krestReferee(): Referee {
  let match: Match | null = null;
  return {
    start(seats, dealer) {
      const board = boardOf(seats);
      match = Object.values(board.hands).filter((h) => h.length > 0).length > 1 ? start(board, dealer) : null;
    },
    stop() {
      match = null;
    },
    follow(seats, by, intent: Intent) {
      if (match === null || intent.t !== "drop") return false;
      const chair = seats.chairs.find((c) => c.owner === by);
      if (!chair || chair.id !== match.turn) return false;
      // ХОД — ТОЛЬКО МЕЖДУ СВОЕЙ РУКОЙ И КРУГОМ. Остальное — уборка стола: очередь стоит.
      const laid = intent.to.in === "deck" && intent.to.pile === RING && seats.faceOf(intent.id) !== undefined;
      const took = intent.to.in === "hand" && intent.to.chair === chair.id;
      if (!laid && !took) return false;
      match = advance(match, boardOf(seats), chair.id, laid ? "laid" : "taken");
      return true;
    },
    view(seats) {
      return match === null ? null : { turn: ownerOf(seats, match.turn), closer: ownerOf(seats, match.closer) };
    },
    play(seats, viewer): Play | null {
      if (match === null) return null;
      const seat = seats.chairs.find((c) => c.owner === viewer);
      const can = seat ? allowed(match, boardOf(seats), seat.id) : { lay: [], take: false };
      // Тень говорит лицами карт, а экран знает их по id — переводим здесь, у самой руки.
      const left = [...can.lay];
      const lay: string[] = [];
      for (const id of seat?.hand ?? []) {
        const face = seats.faceOf(id);
        const at = face === undefined ? -1 : left.findIndex((one) => one.rank === face.rank && one.suit === face.suit);
        if (at !== -1) {
          left.splice(at, 1);
          lay.push(id);
        }
      }
      return { turn: ownerOf(seats, match.turn), closer: ownerOf(seats, match.closer), lay, take: can.take, loser: ownerOf(seats, match.loser) };
    },
    told() {
      return match === null ? { идёт: false } : { идёт: true, ход: match.turn, закрыл: match.closer, порог: match.threshold, вышли: [...match.out] };
    },
    dump() {
      return match;
    },
    load(kept) {
      match = kept && typeof kept === "object" ? (kept as Match) : null;
    },
  };
}
