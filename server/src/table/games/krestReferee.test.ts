// СУДЬЯ КРЕСТОВОГО — что он считает ХОДОМ, а что уборкой стола.
//
// Это граница, на которой ломается всё остальное: сдвинь очередь на чужом жесте — и партия разойдётся
// со столом, а вернуть её потом нечем. Поэтому ход здесь ровно один: ИЗМЕНЕНИЕ КРУГА — карта из своей
// руки в круг или из круга в свою руку. И оба конца жеста считаются: по одному «куда» поправка карт в
// собственной руке неотличима от взятия из круга.

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
    expect(ref.follow(t.seats, t.who("a"), drop(id(c("6", "d")), { in: "deck", pile: RING }), { in: "hand", chair: "a", i: 0 }), "это ход").toBe(true);
    expect(ref.view(t.seats)?.turn, "очередь у второго").toBe(t.who("b"));
  });

  it("карта из круга в СВОЮ руку — ход", () => {
    const t = стол({ a: [c("K", "s")], b: [c("7", "d")], v: [c("9", "h")] }, [c("6", "d")]);
    const ref = krestReferee();
    ref.start(t.seats, "a");
    t.board.circle = [];
    t.board.hands["a"] = [c("K", "s"), c("6", "d")];
    expect(ref.follow(t.seats, t.who("a"), drop(id(c("6", "d")), { in: "hand", chair: "a", i: 0 }), { in: "deck", pile: RING }), "взял — тоже ход").toBe(true);
  });

  /**
   * ПЕРЕКЛАДЫВАНИЕ В СВОЕЙ РУКЕ — НЕ ХОД, и это не мелочь.
   *
   * Живая партия: человек трижды поправил карты в своей руке, пока ждал очереди. Каждое движение
   * судья засчитал как «взял из круга» — закрыл круг, сбросил порог, увёл очередь. Его настоящий ход
   * после этого отвергли («не твой ход»), карта всё равно легла (стол крестового не судит) — и тень
   * разошлась со столом навсегда: в круге четыре карты, тень видит три, а бот с порогом `0` получил
   * право класть ЛЮБУЮ карту и накрыл семёрку червей восьмёркой пик.
   */
  it("УБОРКА: перекладывание карты внутри СВОЕЙ руки — очередь стоит", () => {
    const t = стол({ a: [c("K", "s"), c("9", "h")], b: [c("7", "d")], v: [c("8", "c")] }, [c("6", "d")]);
    const ref = krestReferee();
    ref.start(t.seats, "a");
    const был = ref.view(t.seats)?.turn;
    t.board.hands["a"] = [c("9", "h"), c("K", "s")];
    expect(ref.follow(t.seats, t.who("a"), drop(id(c("9", "h")), { in: "hand", chair: "a", i: 0 }), { in: "hand", chair: "a", i: 1 }), "не ход").toBe(false);
    expect(ref.view(t.seats)?.turn, "очередь не сдвинулась").toBe(был);
    expect(t.board.circle.length, "круг не тронут").toBe(1);
  });

  it("УБОРКА: карта пришла в руку с сукна, а не из круга — очередь стоит", () => {
    const t = стол({ a: [c("K", "s")], b: [c("7", "d")], v: [c("8", "c")] }, [c("6", "d")]);
    const ref = krestReferee();
    ref.start(t.seats, "a");
    const был = ref.view(t.seats)?.turn;
    t.board.hands["a"] = [c("K", "s"), c("9", "h")];
    expect(ref.follow(t.seats, t.who("a"), drop(id(c("9", "h")), { in: "hand", chair: "a", i: 1 }), { in: "felt", x: 0, y: 0, up: true, angle: 0 }), "не ход").toBe(false);
    expect(ref.view(t.seats)?.turn, "очередь не сдвинулась").toBe(был);
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

  /**
   * СУДЬЯ НЕ СПОРИТ СО СТОЛОМ. Сходил не тот, кого ждали, — карта уже в круге, её видят все, и
   * отменить её судье нечем. Очередь переезжает к тому, кто сходил на самом деле.
   *
   * Спор здесь стоил ровно того, чем однажды и кончился: стол принял карту (крестовый не судит),
   * судья её выбросил — и круг на столе разошёлся с кругом в памяти судьи до конца партии.
   */
  it("сходил не тот, кого ждали, — очередь идёт от него, а ход не теряется", () => {
    const t = стол({ a: [c("6", "d")], b: [c("7", "d")], v: [c("8", "d")] });
    const ref = krestReferee();
    ref.start(t.seats, "a");
    expect(ref.view(t.seats)?.turn, "ждали первого").toBe(t.who("a"));
    t.board.hands["b"] = [];
    t.board.circle.push(c("7", "d"));
    expect(ref.follow(t.seats, t.who("b"), drop(id(c("7", "d")), { in: "deck", pile: RING }), { in: "hand", chair: "b", i: 0 }), "ход засчитан").toBe(true);
    expect(ref.view(t.seats)?.turn, "очередь пошла от сходившего").not.toBe(t.who("b"));
    expect(ref.play(t.seats, t.who("b"))?.turn, "и партия цела").not.toBe(undefined);
  });

  /**
   * КРУПЬЕ НЕ ХОДИТ. Он уносит закрытый круг к себе в руки и возвращает его обратно — и то и другое
   * меняет круг сильнее любого хода. Считать это ходом значило бы гонять очередь по столу каждый
   * раз, когда стол просто убирают.
   */
  it("УБОРКА: крупье унёс круг себе в руку — очередь стоит", () => {
    const hands: Record<string, Face[]> = { a: [c("K", "s")], b: [c("7", "d")], v: [c("8", "c")] };
    const круг: Face[] = [c("6", "d")];
    const seats: Seats = {
      get chairs() {
        const игроки = Object.keys(hands).map((chair) => ({ id: chair, owner: `кто:${chair}`, hand: (hands[chair] ?? []).map(id), angle: 0 }));
        return [...игроки, { id: "kr", owner: "кто:kr", hand: [] as string[], angle: 0, croupier: true as const }];
      },
      faceOf: (one) => [...Object.values(hands).flat(), ...круг].find((f) => id(f) === one),
      pile: (p) => (p === RING ? круг.map(id) : []),
    };
    const ref = krestReferee();
    ref.start(seats, "a");
    const был = ref.view(seats)?.turn;
    круг.length = 0;
    expect(ref.follow(seats, "кто:kr", drop(id(c("6", "d")), { in: "hand", chair: "kr", i: 0 }), { in: "deck", pile: RING }), "не ход").toBe(false);
    expect(ref.view(seats)?.turn, "очередь не сдвинулась").toBe(был);
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
      ref.follow(t.seats, turn, { t: "drop", id: id(карта), to: { in: "deck", pile: RING } }, { in: "hand", chair, i: 0 });
    }
    // Шесть часов → девять → двенадцать → три: стол обходится кругом.
    expect(порядок).toEqual(["c3", "c5", "c4", "c6"]);
    // А по именам вышло бы «c3 → c4 → c5 → c6» — метание через стол.
    expect(порядок).not.toEqual(["c3", "c4", "c5", "c6"]);
  });
});

// ОЧЕРЕДЬ ИДЁТ ТУДА ЖЕ, КУДА РАЗДАВАЛИ.
//
// Раздали против часовой, а ход пошёл по часовой — и стол читается наоборот, хотя каждый отдельный
// ход законный. За столом это тот же вопрос, что и «почему ход скачет»: человек ждёт своей очереди
// не с той стороны.
describe("referee.the-turn-follows-the-deal", () => {
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

  const обход = (dir: "cw" | "ccw"): string[] => {
    const t = рассадка();
    const ref = krestReferee();
    ref.start(t.seats, "c3", dir);
    const порядок: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const turn = ref.view(t.seats)!.turn!;
      const chair = turn.replace("кто:", "");
      порядок.push(chair);
      const карта = t.hands[chair]![0]!;
      t.hands[chair] = [];
      t.circle.push(карта);
      ref.follow(t.seats, turn, { t: "drop", id: id(карта), to: { in: "deck", pile: RING } }, { in: "hand", chair, i: 0 });
    }
    return порядок;
  };

  it("против часовой очередь идёт в обратную сторону", () => {
    // Шесть → три → двенадцать → девять: ровно наоборот к обходу по часовой.
    expect(обход("ccw")).toEqual(["c3", "c6", "c4", "c5"]);
  });

  it("две стороны дают разный порядок — иначе направление существует только на словах", () => {
    expect(обход("ccw")).not.toEqual(обход("cw"));
  });

  // Сторона нужна один раз — при постройке кольца; дальше порядок живёт в самой тени. Проверяется
  // именно это: после рестора очередь идёт тем же кругом, хотя сторону слепок не нёс.
  it("ПОРЯДОК ПЕРЕЖИВАЕТ ПЕРЕЗАПУСК: вторая половина партии не разворачивается", () => {
    const t = рассадка();
    const ref = krestReferee();
    ref.start(t.seats, "c3", "ccw");
    const снова = krestReferee();
    снова.load(ref.dump());
    const первый = снова.view(t.seats)!.turn!;
    const карта = t.hands[первый.replace("кто:", "")]![0]!;
    t.hands[первый.replace("кто:", "")] = [];
    t.circle.push(карта);
    снова.follow(t.seats, первый, { t: "drop", id: id(карта), to: { in: "deck", pile: RING } }, { in: "hand", chair: первый.replace("кто:", ""), i: 0 });
    expect(снова.view(t.seats)?.turn, "после рестора очередь всё ещё против часовой").toBe("кто:c6");
  });
});

// КТО ВЫШЕЛ — СУДЬЯ ГОВОРИТ ЭТО НАРУЖУ.
//
// Выход — самое значимое, что бывает за партией: кто-то выиграл. До сих пор он проходил молча, и
// три события подряд — «вышел», «взял», «походил» — сливались для человека в одно движение.
describe("referee.who-is-out-is-said-aloud", () => {
  it("вышедшие называются в порядке выхода — первый вышедший первый победитель", () => {
    const hands: Record<string, Face[]> = { a: [c("6", "d")], b: [c("7", "d")], v: [c("8", "d"), c("K", "s")] };
    const circle: Face[] = [];
    const seats: Seats = {
      get chairs() {
        return Object.keys(hands).map((chair) => ({ id: chair, owner: `кто:${chair}`, hand: (hands[chair] ?? []).map(id), angle: 0 }));
      },
      faceOf: (one) => [...Object.values(hands).flat(), ...circle].find((f) => id(f) === one),
      pile: (p) => (p === RING ? circle.map(id) : []),
    };
    const ref = krestReferee();
    ref.start(seats, "a");
    expect(ref.view(seats)?.out, "пока не вышел никто").toEqual([]);

    // Все трое кладут по карте — круг закрывается, и двое с пустыми руками выходят.
    for (const кто of ["a", "b", "v"]) {
      const turn = ref.view(seats)!.turn!;
      const карта = hands[кто]![0]!;
      hands[кто] = hands[кто]!.slice(1);
      circle.push(карта);
      ref.follow(seats, turn, { t: "drop", id: id(карта), to: { in: "deck", pile: RING } }, { in: "hand", chair: кто, i: 0 });
    }
    expect(ref.view(seats)?.out, "вышли оба, у кого рука опустела").toEqual(["кто:a", "кто:b"]);
  });
});
