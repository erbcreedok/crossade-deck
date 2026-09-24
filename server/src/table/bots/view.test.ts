// ЧТО БОТ ВИДИТ — и, главное, чего он НЕ видит.
//
// Здесь два закона. Первый: чужих карт в `BotView` нет — это проверяется и типом, и строкой,
// потому что тип защищает от опечатки, а не от того, что кто-то однажды решит «ну одному боту можно».
// Второй: ход бота берётся из списка, а список собран по правилам игры.

import { describe, expect, it } from "vitest";
import type { Face } from "../contract.js";
import type { Seats } from "../referee.js";
import { RING } from "../games/krest.js";
import { start, type Board, type Match } from "../games/match.js";
import { botView, legalMoves } from "./view.js";

const c = (rank: string, suit: Face["suit"]): Face => ({ rank, suit });
const id = (f: Face) => `${f.rank}${f.suit}`;

function стол(hands: Record<string, Face[]>, circle: Face[] = []) {
  const board = { hands, circle };
  const seats: Seats = {
    get chairs() {
      return Object.keys(board.hands).map((chair) => ({ id: chair, owner: `кто:${chair}`, hand: (board.hands[chair] ?? []).map(id) }));
    },
    faceOf: (one) => [...Object.values(board.hands).flat(), ...board.circle].find((f) => id(f) === one),
    pile: (p) => (p === RING ? board.circle.map(id) : []),
  };
  const m: Match = start({ hands, circle } as Board, "a");
  return { board, seats, m };
}

describe("bots.a-bot-sees-no-one-elses-cards", () => {
  it("в поле зрения — только своя рука, у чужих лишь число карт", () => {
    const t = стол({ a: [c("6", "d"), c("K", "s")], b: [c("7", "d"), c("A", "c"), c("JK", "r")] });
    const view = botView(t.seats, t.m, "a", []);
    expect(view.hand.map((one) => one.face), "своя рука — лицами").toEqual([c("6", "d"), c("K", "s")]);
    expect(view.others).toEqual([{ chair: "b", name: "кто:b", cards: 3 }]);
    // Ни одной чужой карты нигде в структуре: проверяем по всему дереву, а не по известным полям.
    const везде = JSON.stringify(view);
    expect(везде.includes("\"A\""), "туз соперника не должен светиться нигде").toBe(false);
    expect(везде.includes("JK"), "и джокер соперника тоже").toBe(false);
  });

  it("остальные перечислены по рассадке ОТ СЕБЯ: следующий ходит первым", () => {
    const t = стол({ a: [c("6", "d")], b: [c("7", "d")], v: [c("8", "d")] });
    expect(botView(t.seats, t.m, "b", []).others.map((one) => one.chair)).toEqual(["v", "a"]);
  });
});

describe("bots.a-bot-picks-from-a-legal-list", () => {
  it("круга нет — можно положить любую свою карту и нельзя взять", () => {
    const t = стол({ a: [c("6", "d"), c("K", "s")], b: [c("7", "d")] });
    const legal = legalMoves(t.seats, t.m, "a");
    expect(legal.map((one) => (one.t === "lay" ? one.id : "take"))).toEqual([id(c("6", "d")), id(c("K", "s"))]);
  });

  it("в круге — только то, что бьёт верхнюю, плюс «взять»", () => {
    const t = стол({ a: [c("7", "c"), c("A", "d"), c("JK", "r")], b: [] }, [c("6", "c")]);
    // `opened: 0` — карта в кольце принадлежит ЭТОМУ кругу, а не прошлому несгребённому.
    const m: Match = { ...t.m, turn: "a", threshold: 2, opened: 0 };
    const legal = legalMoves(t.seats, m, "a");
    expect(legal.map((one) => (one.t === "lay" ? one.id : "take")), "крести бьются крестями и джокером; туз буби — нет")
      .toEqual([id(c("7", "c")), id(c("JK", "r")), "take"]);
  });

  it("не его очередь — ходить нечем", () => {
    const t = стол({ a: [c("6", "d")], b: [c("7", "d")] });
    expect(legalMoves(t.seats, t.m, "b")).toEqual([]);
  });

  it("рука пуста, круг есть — остаётся только взять", () => {
    const t = стол({ a: [], b: [c("7", "d")] }, [c("6", "d")]);
    // `opened: 0` — карта в кольце принадлежит ЭТОМУ кругу, а не прошлому несгребённому.
    const m: Match = { ...t.m, turn: "a", threshold: 2, opened: 0 };
    expect(legalMoves(t.seats, m, "a")).toEqual([{ t: "take", id: id(c("6", "d")), card: c("6", "d"), to: { in: "hand", chair: "a", i: 0 } }]);
  });
});
