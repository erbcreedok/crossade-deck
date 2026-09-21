// СУДЬЯ КРЕСТОВОГО — обёртка над чистой партией (`match.ts`): переводит жесты стола в ходы партии.
//
// Положил в круг хода — `lay`, забрал из круга в свою руку — `take`. Если партия вдруг откажет, судья
// её не слушает: стол уже сходил, и расходиться им нельзя.

import type { Face, Intent, Play } from "../contract.js";
import type { Referee, Seats } from "../referee.js";
import { RING } from "./krest.js";
import { allowed, move, start, type Match } from "./match.js";

const ownerOf = (seats: Seats, chair: string | null): string | null => (chair === null ? null : (seats.chairs.find((c) => c.id === chair)?.owner ?? null));

export function krestReferee(): Referee {
  let match: Match | null = null;
  return {
    start(seats, dealer) {
      const hands: Record<string, readonly Face[]> = {};
      for (const chair of seats.chairs) {
        if (chair.croupier || chair.hand.length === 0) continue;
        hands[chair.id] = chair.hand.map((id) => seats.faceOf(id)).filter((f): f is Face => f !== undefined);
      }
      match = Object.keys(hands).length > 1 ? start(hands, dealer) : null;
    },
    stop() {
      match = null;
    },
    follow(seats, by, intent: Intent) {
      if (match === null || intent.t !== "drop") return false;
      const chair = seats.chairs.find((c) => c.owner === by);
      if (!chair || chair.id !== match.turn) return false;
      const face = seats.faceOf(intent.id);
      const laid = intent.to.in === "deck" && intent.to.pile === RING && face !== undefined;
      const took = intent.to.in === "hand" && intent.to.chair === chair.id;
      if (!laid && !took) return false;
      const next = move(match, chair.id, laid ? { t: "lay", card: face! } : { t: "take" });
      if ("refused" in next) return false;
      match = next;
      return true;
    },
    view(seats) {
      return match === null ? null : { turn: ownerOf(seats, match.turn), closer: ownerOf(seats, match.closer) };
    },
    play(seats, viewer): Play | null {
      if (match === null) return null;
      const seat = seats.chairs.find((c) => c.owner === viewer);
      const can = seat ? allowed(match, seat.id) : { lay: [], take: false };
      // Партия говорит лицами карт, а экран знает их по id — переводим здесь, у самой руки.
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
      return match === null ? { идёт: false } : { идёт: true, ход: match.turn, закрыл: match.closer, вышли: [...match.out] };
    },
    dump() {
      return match;
    },
    load(kept) {
      match = kept && typeof kept === "object" ? (kept as Match) : null;
    },
  };
}
