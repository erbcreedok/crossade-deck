// ТЕНЬ ПАРТИИ — таблицей случаев. Каждый случай здесь однажды придётся объяснять живому человеку
// за столом; если тест его не проверяет, объяснять придётся по памяти.
//
// Тень карт не помнит: стол двигают, она идёт следом. Поэтому здесь есть маленький стол (`деск`) —
// он и есть та физика, которую в бою двигают пальцы игроков и руки админа.

import { describe, expect, it } from "vitest";
import type { Face } from "../contract.js";
import { advance, allowed, may, start, type Board, type Match } from "./match.js";

const c = (rank: string, suit: Face["suit"]): Face => ({ rank, suit });
const RED = c("JK", "r");
const same = (a: Face, b: Face) => a.rank === b.rank && a.suit === b.suit;
const id = (f: Face) => `${f.rank}${f.suit}`;

/**
 * СТОЛ. Карты живут здесь, а не в тени: `lay`/`take` — это ход, `admin` — руки за столом.
 * После каждого хода тень двигается ровно так, как её двинет судья в бою.
 */
function десk(hands: Record<string, Face[]>, dealer: string | null) {
  // Порядок по кругу — тот, в каком стулья перечислены: в тесте рассадка задаётся списком.
  const board = { hands, circle: [] as Face[], order: Object.keys(hands) };
  const доска = () => board as unknown as Board;
  const faceOf = (one: string): Face | undefined => [...Object.values(board.hands).flat(), ...board.circle].find((f) => id(f) === one);
  let m: Match = start(доска(), dealer);
  const drop = (who: string, card: Face) => {
    const hand = board.hands[who] ?? [];
    const at = hand.findIndex((f) => same(f, card));
    if (at === -1) throw new Error(`${who}: нет карты ${id(card)}`);
    hand.splice(at, 1);
  };
  return {
    get m() { return m; },
    get board() { return доска(); },
    faceOf,
    lay(who: string, card: Face) {
      drop(who, card);
      board.circle.push(card);
      m = advance(m, доска(), who, "laid");
      return m;
    },
    take(who: string) {
      const low = board.circle.shift();
      if (low !== undefined) (board.hands[who] ??= []).push(low);
      m = advance(m, доска(), who, "taken");
      return m;
    },
    /** РУКИ АДМИНА: стол переложили, тень об этом не знает и знать не должна. */
    admin(change: (b: { hands: Record<string, Face[]>; circle: Face[] }) => void) {
      change(board);
    },
  };
}

describe("начало партии", () => {
  it("ходит тот, у кого шестёрка буби", () => {
    const t = десk({ Аня: [c("K", "s")], Боря: [c("6", "d")] }, "Аня");
    expect(t.m.turn).toBe("Боря");
    expect(t.m.threshold, "круга нет").toBe(0);
  });

  it("шестёрки буби нет ни у кого — ходит раздающий", () => {
    expect(десk({ Аня: [c("K", "s")], Боря: [c("7", "h")] }, "Аня").m.turn).toBe("Аня");
  });

  it("круг открывают любой картой, даже джокером", () => {
    const t = десk({ Аня: [RED, c("6", "d")], Боря: [c("K", "s")] }, "Боря");
    expect(t.m.turn).toBe("Аня");
    expect(allowed(t.m, t.board, "Аня").lay, "круга нет — бить нечего, класть можно что угодно").toEqual([RED, c("6", "d")]);
  });
});

describe("ход и отказы", () => {
  const two = () => десk({ Аня: [c("6", "d"), c("K", "s")], Боря: [c("7", "d"), c("8", "c")] }, "Аня");

  it("чужой ход — нельзя", () => {
    const t = two();
    expect(may(t.m, t.board, "Боря", { t: "lay", id: id(c("7", "d")) }, t.faceOf)).toEqual({ refused: "не-твой-ход" });
  });

  it("не бьёт — нельзя, и ход остаётся у него", () => {
    const t = two();
    t.lay("Аня", c("6", "d"));
    expect(may(t.m, t.board, "Боря", { t: "lay", id: id(c("8", "c")) }, t.faceOf), "крести не бьют буби").toEqual({ refused: "не-бьёт" });
    expect(t.m.turn).toBe("Боря");
  });

  it("круга нет — брать нечего", () => {
    const t = two();
    expect(may(t.m, t.board, "Аня", { t: "take" }, t.faceOf)).toEqual({ refused: "круг-надо-открыть" });
  });
});

describe("круг закрывается и открывается снова", () => {
  it("двое: положили две карты — круг закрыт, открывает положивший вторую", () => {
    const t = десk({ Аня: [c("6", "d"), c("K", "s")], Боря: [c("7", "d"), c("9", "h")] }, "Аня");
    t.lay("Аня", c("6", "d"));
    expect(t.board.circle.length).toBe(1);
    t.lay("Боря", c("7", "d"));
    expect(t.m.threshold, "круг закрыт — порога больше нет").toBe(0);
    expect(t.m.closer).toBe("Боря");
    expect(t.m.turn, "начинает тот, кто закрыл").toBe("Боря");
  });

  it("стол разобрали — следующий круг открывает СЛЕДУЮЩИЙ за взявшим", () => {
    const t = десk({ Аня: [c("6", "d")], Боря: [c("9", "h")], Вика: [c("K", "s")] }, "Аня");
    t.lay("Аня", c("6", "d"));
    t.take("Боря");
    expect(t.board.circle, "стол опустел — круг закрыт").toEqual([]);
    expect(t.board.hands["Боря"]).toEqual([c("9", "h"), c("6", "d")]);
    expect(t.m.turn, "не Боря, а следующий за ним").toBe("Вика");
  });

  it("порог берётся при старте круга и внутри не меняется", () => {
    const t = десk({ Аня: [c("6", "d"), c("K", "s")], Боря: [c("7", "d")], Вика: [c("8", "d")] }, "Аня");
    t.lay("Аня", c("6", "d"));
    expect(t.m.threshold, "трое с картами").toBe(3);
    t.lay("Боря", c("7", "d"));
    expect(t.board.circle.length, "две карты при пороге три — круг жив").toBe(2);
    expect(t.m.threshold).toBe(3);
    t.lay("Вика", c("8", "d"));
    expect(t.m.threshold, "круг закрыт").toBe(0);
  });
});

describe("САМЫЙ КОВАРНЫЙ СЛУЧАЙ: пустая рука внутри незакрытого круга", () => {
  it("очередь доходит до опустевшего, ему нечем бить — он поднимает нижнюю и снова с картами", () => {
    const t = десk({ Аня: [c("6", "d")], Боря: [c("7", "d")], Вика: [c("K", "s")] }, "Аня");
    t.lay("Аня", c("6", "d"));
    expect(t.board.hands["Аня"], "рука пуста").toEqual([]);
    expect(t.m.out, "но он НЕ вышел: круг не закрыт").toEqual([]);
    t.lay("Боря", c("7", "d"));
    expect(t.board.circle.length).toBe(2);
    expect(t.m.turn, "очередь дошла до Вики").toBe("Вика");
    t.take("Вика");
    expect(t.m.turn, "и снова до Ани — она всё ещё в круге").toBe("Аня");
    expect(allowed(t.m, t.board, "Аня"), "рука пуста: класть нечего, но взять можно").toEqual({ lay: [], take: true });
    t.take("Аня");
    expect(t.board.hands["Аня"], "подняла нижнюю и снова с картами").toEqual([c("7", "d")]);
  });
});

describe("выход, проигравший и раздающий", () => {
  it("вышли только те, у кого пусто НА МОМЕНТ закрытия круга", () => {
    const t = десk({ Аня: [c("6", "d")], Боря: [c("7", "d")], Вика: [c("8", "d"), c("K", "s")] }, "Аня");
    t.lay("Аня", c("6", "d"));
    t.lay("Боря", c("7", "d"));
    t.lay("Вика", c("8", "d"));
    expect(t.m.threshold, "три карты при пороге три").toBe(0);
    expect([...t.m.out].sort(), "Аня и Боря пусты — вышли").toEqual(["Аня", "Боря"]);
    expect(t.m.ring).toEqual(["Вика"]);
    expect(t.m.loser, "осталась одна с картами — проиграла").toBe("Вика");
    expect(t.m.dealer, "проигравший раздаёт следующую").toBe("Вика");
    expect(t.m.turn, "партия кончена").toBe(null);
  });

  it("после конца партии ходов больше нет", () => {
    const t = десk({ Аня: [c("6", "d")], Боря: [c("7", "d"), c("K", "s")] }, "Аня");
    t.lay("Аня", c("6", "d"));
    t.lay("Боря", c("7", "d"));
    expect(t.m.loser).toBe("Боря");
    expect(may(t.m, t.board, "Боря", { t: "take" }, t.faceOf)).toEqual({ refused: "партия-кончена" });
  });
});

describe("что можно прямо сейчас", () => {
  it("не твой ход — ничего", () => {
    const t = десk({ Аня: [c("6", "d")], Боря: [c("7", "d")] }, "Аня");
    expect(allowed(t.m, t.board, "Боря")).toEqual({ lay: [], take: false });
  });

  it("в круге видно ровно те карты, что бьют верхнюю", () => {
    const t = десk({ Аня: [c("6", "c")], Боря: [c("7", "c"), c("A", "d"), RED] }, "Аня");
    t.lay("Аня", c("6", "c"));
    const can = allowed(t.m, t.board, "Боря");
    expect(can.lay, "крести бьются крестями и джокером; туз буби — нет").toEqual([c("7", "c"), RED]);
    expect(can.take).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// ТЕНЬ СЧИТАЕТ ПО СТОЛУ. Стол правят руками — и это законно: админ за настоящим столом делает что
// хочет. Тень обязана принять результат и не развалиться.
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("shadow.the-shadow-reads-the-table", () => {
  it("КЕЙС ВЛАДЕЛЬЦА: взял не ту карту, админ вернул её и дал нужную — ход идёт дальше, круг = [7]", () => {
    // Раймондо должен был взять шестёрку, а поднял семёрку. Админ кладёт семёрку назад в круг и
    // выдаёт ему шестёрку рукой. Ход при этом уже состоялся — очередь ушла к следующему.
    const t = десk({ Аня: [c("6", "d")], Раймондо: [c("K", "s")], Вика: [c("9", "h")] }, "Аня");
    t.lay("Аня", c("6", "d"));
    t.admin((b) => b.circle.push(c("7", "d")));
    t.take("Раймондо");
    expect(t.board.hands["Раймондо"], "поднял нижнюю — шестёрку").toEqual([c("K", "s"), c("6", "d")]);
    const ход = t.m.turn;

    // Админ правит: шестёрка из руки Раймондо обратно в круг, семёрка… уже там; меняем местами.
    t.admin((b) => {
      b.hands["Раймондо"] = [c("K", "s"), c("7", "d")];
      b.circle = [c("6", "d")];
    });
    expect(t.m.turn, "уборка стола очередь не сдвинула").toBe(ход);
    expect(allowed(t.m, t.board, ход!).take, "круг не пуст — взять можно").toBe(true);
  });

  it("ход из ЧУЖОЙ руки очередь не двигает — это уборка, а не ход", () => {
    const t = десk({ Аня: [c("6", "d"), c("K", "s")], Боря: [c("7", "d")], Вика: [c("9", "h")] }, "Аня");
    t.lay("Аня", c("6", "d"));
    const ход = t.m.turn;
    t.admin((b) => {
      b.hands["Вика"] = [];
      b.circle.push(c("9", "h"));
    });
    expect(t.m.turn, "тень не шевельнулась: судья такой жест ходом не считает").toBe(ход);
  });

  it("карта пришла в руку ниоткуда — партия не ломается, тень читает новую руку", () => {
    const t = десk({ Аня: [c("6", "d")], Боря: [c("7", "d")], Вика: [c("K", "s")] }, "Аня");
    t.lay("Аня", c("6", "d"));
    t.admin((b) => (b.hands["Аня"] = [c("A", "d"), c("8", "d")]));
    t.lay("Боря", c("7", "d"));
    t.take("Вика");
    expect(t.m.turn, "очередь дошла до Ани — и она снова с картами").toBe("Аня");
    expect(allowed(t.m, t.board, "Аня").lay.length, "тень видит обе выданные карты").toBe(2);
  });

  it("админ опустошил круг посреди хода — тень видит пустой стол, а не свою память", () => {
    const t = десk({ Аня: [c("6", "d"), c("K", "s")], Боря: [c("7", "d"), c("9", "h")] }, "Аня");
    t.lay("Аня", c("6", "d"));
    t.admin((b) => (b.circle = []));
    expect(allowed(t.m, t.board, "Боря"), "брать нечего, а класть можно что угодно: бить некого").toEqual({ lay: [c("7", "d"), c("9", "h")], take: false });
  });
});

// НЕСГРЕБЁННЫЙ КРУГ НЕ ЛОМАЕТ ПАРТИЮ.
//
// Закрывший сгребает кольцо руками — а пока не сгрёб, карты прошлых кругов лежат там же. Тень
// обязана считать кругом только СВЕЖИЕ карты: иначе несгребённых быстро становится больше, чем
// игроков, круг оказывается закрытым всегда, и очередь залипает на одном человеке.
describe("shadow.an-unswept-ring-does-not-break-the-game", () => {
  it("КЕЙС ВЛАДЕЛЬЦА: куча в кольце — а очередь всё равно идёт по столу", () => {
    const t = десk({ a: [c("6", "d"), c("K", "s")], b: [c("7", "d"), c("9", "h")], v: [c("8", "d"), c("10", "h")] }, "a");
    // Прошлый круг закрылся и остался лежать: три карты никто не сгрёб.
    t.admin((b) => b.circle.push(c("A", "c"), c("K", "c"), c("Q", "c")));

    t.lay("a", c("6", "d"));
    expect(t.m.threshold, "порог берётся по игрокам, а не по куче").toBe(3);
    expect(t.m.turn, "очередь ушла дальше, а не залипла").toBe("b");
    t.lay("b", c("7", "d"));
    expect(t.m.turn, "и дальше").toBe("v");
    expect(t.m.threshold, "круг всё ещё жив: две свежие карты из трёх").toBe(3);
    t.lay("v", c("8", "d"));
    expect(t.m.threshold, "третья свежая закрыла круг").toBe(0);
    expect(t.m.closer).toBe("v");
  });

  it("ОДИН ИГРОК НЕ ВЫКЛАДЫВАЕТ ВСЮ РУКУ ПОДРЯД", () => {
    // Ровно то, что было видно в живой партии: бот клал восемь карт, остальные не ходили.
    const t = десk({ a: [c("6", "d"), c("7", "s"), c("8", "s")], b: [c("9", "h")], v: [c("10", "h")] }, "a");
    t.admin((b) => b.circle.push(c("A", "c"), c("K", "c"), c("Q", "c"), c("J", "c")));
    const ходил: string[] = [];
    for (let i = 0; i < 3 && t.m.turn !== null; i += 1) {
      const кто = t.m.turn!;
      ходил.push(кто);
      const рука = t.board.hands[кто] ?? [];
      const можно = allowed(t.m, t.board, кто).lay;
      if (можно.length === 0 || рука.length === 0) break;
      t.lay(кто, можно[0]!);
    }
    expect(new Set(ходил).size, "ходили разные игроки, а не один").toBeGreaterThan(1);
  });

  it("брать можно только из СВЕЖЕГО круга: чужая старая куча — не добыча", () => {
    const t = десk({ a: [c("K", "s")], b: [c("9", "h")] }, "a");
    t.admin((b) => b.circle.push(c("A", "c"), c("K", "c")));
    // Круг ещё не открыт: свежих карт нет, значит брать нечего, сколько бы ни лежало старого.
    expect(allowed(t.m, t.board, "a").take).toBe(false);
  });
});
