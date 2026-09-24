// СУДЬЯ КРЕСТОВОГО — что он считает ХОДОМ, а что уборкой стола.
//
// Это граница, на которой ломается всё остальное: сдвинь очередь на чужом жесте — и партия разойдётся
// со столом, а вернуть её потом нечем. Поэтому ход здесь ровно один: карта между СВОЕЙ рукой и кругом.

import { describe, expect, it } from "vitest";
import type { Face, Intent } from "../contract.js";
import type { Seats } from "../referee.js";
import { krestReferee } from "./krestReferee.js";
import { RING } from "./krest.js";

const c = (rank: string, suit: Face["suit"]): Face => ({ rank, suit });
const id = (f: Face) => `${f.rank}${f.suit}`;

/** Стол: стулья с руками, круг и лица карт. Двигается руками теста, как настоящий — пальцами. */
function стол(hands: Record<string, Face[]>, circle: Face[] = []) {
  const board = { hands, circle };
  const seats: Seats = {
    get chairs() {
      return Object.keys(board.hands).map((chair) => ({ id: chair, owner: `кто:${chair}`, hand: (board.hands[chair] ?? []).map(id), angle: 0 }));
    },
    faceOf: (one) => [...Object.values(board.hands).flat(), ...board.circle].find((f) => id(f) === one),
    pile: (p) => (p === RING ? board.circle.map(id) : []),
  };
  return { board, seats, who: (chair: string) => `кто:${chair}` };
}

const drop = (one: string, to: Intent extends { t: "drop" } ? never : { in: "deck"; pile: string } | { in: "hand"; chair: string; i: number }): Intent =>
  ({ t: "drop", id: one, to } as Intent);

describe("referee.a-move-is-only-between-my-hand-and-the-ring", () => {
  it("своя карта в круг — ход, очередь уходит дальше", () => {
    const t = стол({ a: [c("6", "d")], b: [c("7", "d")] });
    const ref = krestReferee();
    ref.start(t.seats, "a");
    expect(ref.view(t.seats)?.turn).toBe(t.who("a"));
    t.board.hands["a"] = [];
    t.board.circle.push(c("6", "d"));
    expect(ref.follow(t.seats, t.who("a"), drop(id(c("6", "d")), { in: "deck", pile: RING })), "это ход").toBe(true);
    expect(ref.view(t.seats)?.turn, "очередь у второго").toBe(t.who("b"));
  });

  it("карта из круга в СВОЮ руку — ход", () => {
    const t = стол({ a: [c("K", "s")], b: [c("7", "d")], v: [c("9", "h")] }, [c("6", "d")]);
    const ref = krestReferee();
    ref.start(t.seats, "a");
    t.board.circle = [];
    t.board.hands["a"] = [c("K", "s"), c("6", "d")];
    expect(ref.follow(t.seats, t.who("a"), drop(id(c("6", "d")), { in: "hand", chair: "a", i: 0 })), "взял — тоже ход").toBe(true);
  });

  it("УБОРКА: админ положил в круг карту из ЧУЖОЙ руки — очередь стоит", () => {
    const t = стол({ a: [c("6", "d")], b: [c("7", "d")], v: [c("9", "h")] });
    const ref = krestReferee();
    ref.start(t.seats, "a");
    const был = ref.view(t.seats)?.turn;
    t.board.hands["v"] = [];
    t.board.circle.push(c("9", "h"));
    // Жест сделал тот, чей ход, но карта — не из его руки и не в его руку: это не ход партии.
    expect(ref.follow(t.seats, t.who("a"), drop(id(c("9", "h")), { in: "hand", chair: "v", i: 0 })), "не ход").toBe(false);
    expect(ref.view(t.seats)?.turn, "очередь не сдвинулась").toBe(был);
  });

  it("УБОРКА: карта уехала на сукно, а не в круг — очередь стоит", () => {
    const t = стол({ a: [c("6", "d")], b: [c("7", "d")] });
    const ref = krestReferee();
    ref.start(t.seats, "a");
    const был = ref.view(t.seats)?.turn;
    expect(ref.follow(t.seats, t.who("a"), { t: "drop", id: id(c("6", "d")), to: { in: "felt", x: 0, y: 0, up: true, angle: 0 } } as Intent)).toBe(false);
    expect(ref.view(t.seats)?.turn).toBe(был);
  });

  it("чужой жест в свой же круг очередь не двигает: ходит не он", () => {
    const t = стол({ a: [c("6", "d")], b: [c("7", "d")] });
    const ref = krestReferee();
    ref.start(t.seats, "a");
    t.board.hands["b"] = [];
    t.board.circle.push(c("7", "d"));
    expect(ref.follow(t.seats, t.who("b"), drop(id(c("7", "d")), { in: "deck", pile: RING })), "сейчас ход первого").toBe(false);
  });

  it("СУДЬЯ ЧИТАЕТ СТОЛ: админ переложил руки между ходами — подсказка идёт по новой руке", () => {
    const t = стол({ a: [c("6", "d")], b: [c("7", "d")] });
    const ref = krestReferee();
    ref.start(t.seats, "a");
    t.board.hands["a"] = [c("A", "s"), c("K", "h")];
    expect(ref.play(t.seats, t.who("a"))?.lay.length, "две выданные карты, а не запомненная одна").toBe(2);
  });
});

// ОЧЕРЕДЬ ОБХОДИТ СТОЛ, А НЕ СКАЧЕТ ПО НЕМУ.
//
// Кольцо строилось из имён стульев (`c3, c4, c5, c6`), а имена к рассадке отношения не имеют:
// стулья двигают, пересаживают, добавляют. За живой партией владельца ход шёл «шесть часов →
// двенадцать → три → девять» — через стол, и понять его было нельзя.
describe("referee.the-turn-goes-around-the-table", () => {
  /** Стол с настоящими углами той самой партии: c3 внизу, c6 справа, c4 наверху, c5 слева. */
  function рассадка() {
    const hands: Record<string, Face[]> = { c3: [c("6", "d")], c4: [c("7", "d")], c5: [c("8", "d")], c6: [c("9", "d")] };
    const углы: Record<string, number> = { c3: 0, c6: 90, c4: 180, c5: 270 };
    const circle: Face[] = [];
    const seats: Seats = {
      get chairs() {
        return Object.keys(hands).map((chair) => ({ id: chair, owner: `кто:${chair}`, hand: (hands[chair] ?? []).map(id), angle: углы[chair]! }));
      },
      faceOf: (one) => [...Object.values(hands).flat(), ...circle].find((f) => id(f) === one),
      pile: (p) => (p === RING ? circle.map(id) : []),
    };
    return { hands, circle, seats };
  }

  it("ход идёт ПО ЧАСОВОЙ по углам стульев, а не по их номерам", () => {
    const t = рассадка();
    const ref = krestReferee();
    ref.start(t.seats, "c3");
    const порядок: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const turn = ref.view(t.seats)!.turn!;
      const chair = turn.replace("кто:", "");
      порядок.push(chair);
      const карта = t.hands[chair]![0]!;
      t.hands[chair] = [];
      t.circle.push(карта);
      ref.follow(t.seats, turn, { t: "drop", id: id(карта), to: { in: "deck", pile: RING } });
    }
    // Шесть часов → девять → двенадцать → три: стол обходится кругом.
    expect(порядок).toEqual(["c3", "c5", "c4", "c6"]);
    // А по именам вышло бы «c3 → c4 → c5 → c6» — метание через стол.
    expect(порядок).not.toEqual(["c3", "c4", "c5", "c6"]);
  });
});
