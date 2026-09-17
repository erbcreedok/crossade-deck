// СУДЬЯ ПАРТИИ — таблицей случаев. Каждый случай здесь однажды придётся объяснять живому человеку
// за столом; если тест его не проверяет, объяснять придётся по памяти.

import { describe, expect, it } from "vitest";
import type { Face } from "../contract.js";
import { allowed, move, start, type Match } from "./match.js";

const c = (rank: string, suit: Face["suit"]): Face => ({ rank, suit });
const RED = c("JK", "r");

/** Ход, который обязан пройти: отказ здесь — ошибка теста, а не игры. */
const ok = (m: Match, who: string, mv: Parameters<typeof move>[2]): Match => {
  const next = move(m, who, mv);
  if ("refused" in next) throw new Error(`${who}: отказ «${next.refused}»`);
  return next;
};

describe("начало партии", () => {
  it("ходит тот, у кого шестёрка буби", () => {
    const m = start({ Аня: [c("K", "s")], Боря: [c("6", "d")] }, "Аня");
    expect(m.turn).toBe("Боря");
    expect(m.circle).toBe(null);
  });

  it("шестёрки буби нет ни у кого — ходит раздающий", () => {
    expect(start({ Аня: [c("K", "s")], Боря: [c("7", "h")] }, "Аня").turn).toBe("Аня");
  });

  it("круг открывают любой картой, даже джокером", () => {
    // Шестёрка буби у Ани, значит ходит она; джокер в её же руке — и он разрешён.
    const m = start({ Аня: [RED, c("6", "d")], Боря: [c("K", "s")] }, "Боря");
    expect(m.turn).toBe("Аня");
    expect(allowed(m, "Аня").lay, "круга нет — бить нечего, класть можно что угодно").toEqual([RED, c("6", "d")]);
  });
});

describe("ход и отказы", () => {
  const two = () => start({ Аня: [c("6", "d"), c("K", "s")], Боря: [c("7", "d"), c("8", "c")] }, "Аня");

  it("чужой ход — отказ", () => {
    expect(move(two(), "Боря", { t: "lay", card: c("7", "d") })).toEqual({ refused: "не-твой-ход" });
  });

  it("карты нет в руке — отказ", () => {
    expect(move(two(), "Аня", { t: "lay", card: c("A", "s") })).toEqual({ refused: "нет-такой-карты" });
  });

  it("не бьёт — отказ, и ход остаётся у него", () => {
    const m = ok(two(), "Аня", { t: "lay", card: c("6", "d") });
    expect(move(m, "Боря", { t: "lay", card: c("8", "c") }), "крести не бьют буби").toEqual({ refused: "не-бьёт" });
    expect(m.turn).toBe("Боря");
  });

  it("круга нет — брать нечего", () => {
    expect(move(two(), "Аня", { t: "take" })).toEqual({ refused: "круг-надо-открыть" });
  });
});

describe("круг закрывается и открывается снова", () => {
  it("двое: положили две карты — круг закрыт, открывает положивший вторую", () => {
    let m = start({ Аня: [c("6", "d"), c("K", "s")], Боря: [c("7", "d"), c("9", "h")] }, "Аня");
    m = ok(m, "Аня", { t: "lay", card: c("6", "d") });
    expect(m.circle?.table.length).toBe(1);
    m = ok(m, "Боря", { t: "lay", card: c("7", "d") });
    expect(m.circle, "круг закрыт — кольцо пустеет").toBe(null);
    expect(m.closer).toBe("Боря");
    expect(m.turn, "начинает тот, кто закрыл").toBe("Боря");
  });

  it("стол разобрали — следующий круг открывает СЛЕДУЮЩИЙ за взявшим", () => {
    let m = start({ Аня: [c("6", "d")], Боря: [c("9", "h")], Вика: [c("K", "s")] }, "Аня");
    m = ok(m, "Аня", { t: "lay", card: c("6", "d") });
    m = ok(m, "Боря", { t: "take" });
    expect(m.circle, "стол опустел — круг закрыт").toBe(null);
    expect(m.hands["Боря"]).toEqual([c("9", "h"), c("6", "d")]);
    expect(m.turn, "не Боря, а следующий за ним").toBe("Вика");
  });

  it("порог берётся при старте круга и внутри не меняется", () => {
    // Трое с картами: круг закроется на третьей карте, а не на второй.
    let m = start({ Аня: [c("6", "d"), c("K", "s")], Боря: [c("7", "d")], Вика: [c("8", "d")] }, "Аня");
    m = ok(m, "Аня", { t: "lay", card: c("6", "d") });
    m = ok(m, "Боря", { t: "lay", card: c("7", "d") });
    expect(m.circle?.table.length, "две карты при пороге три — круг жив").toBe(2);
    m = ok(m, "Вика", { t: "lay", card: c("8", "d") });
    expect(m.circle).toBe(null);
  });
});

describe("САМЫЙ КОВАРНЫЙ СЛУЧАЙ: пустая рука внутри незакрытого круга", () => {
  it("очередь доходит до опустевшего, ему нечем бить — он поднимает нижнюю и снова с картами", () => {
    // Трое. Аня кладёт последнюю карту, круг не закрыт (порог три, карт одна).
    let m = start({ Аня: [c("6", "d")], Боря: [c("7", "d")], Вика: [c("K", "s")] }, "Аня");
    m = ok(m, "Аня", { t: "lay", card: c("6", "d") });
    expect(m.hands["Аня"], "рука пуста").toEqual([]);
    expect(m.out, "но он НЕ вышел: круг не закрыт").toEqual([]);
    m = ok(m, "Боря", { t: "lay", card: c("7", "d") });
    expect(m.circle?.table.length).toBe(2);
    expect(m.turn, "очередь дошла до Вики").toBe("Вика");
    m = ok(m, "Вика", { t: "take" });
    expect(m.turn, "и снова до Ани — она всё ещё в круге").toBe("Аня");
    expect(allowed(m, "Аня"), "рука пуста: класть нечего, но взять можно").toEqual({ lay: [], take: true });
    m = ok(m, "Аня", { t: "take" });
    expect(m.hands["Аня"], "подняла нижнюю и снова с картами").toEqual([c("7", "d")]);
  });
});

describe("выход, проигравший и раздающий", () => {
  it("вышли только те, у кого пусто НА МОМЕНТ закрытия круга", () => {
    let m = start({ Аня: [c("6", "d")], Боря: [c("7", "d")], Вика: [c("8", "d"), c("K", "s")] }, "Аня");
    m = ok(m, "Аня", { t: "lay", card: c("6", "d") });
    m = ok(m, "Боря", { t: "lay", card: c("7", "d") });
    m = ok(m, "Вика", { t: "lay", card: c("8", "d") });
    expect(m.circle, "три карты при пороге три").toBe(null);
    expect([...m.out].sort(), "Аня и Боря пусты — вышли").toEqual(["Аня", "Боря"]);
    expect(m.ring).toEqual(["Вика"]);
    expect(m.loser, "осталась одна с картами — проиграла").toBe("Вика");
    expect(m.dealer, "проигравший раздаёт следующую").toBe("Вика");
    expect(m.turn, "партия кончена").toBe(null);
  });

  it("после конца партии ходов больше нет", () => {
    let m = start({ Аня: [c("6", "d")], Боря: [c("7", "d"), c("K", "s")] }, "Аня");
    m = ok(m, "Аня", { t: "lay", card: c("6", "d") });
    m = ok(m, "Боря", { t: "lay", card: c("7", "d") });
    expect(m.loser).toBe("Боря");
    expect(move(m, "Боря", { t: "take" })).toEqual({ refused: "партия-кончена" });
  });
});

describe("что можно прямо сейчас", () => {
  it("не твой ход — ничего", () => {
    const m = start({ Аня: [c("6", "d")], Боря: [c("7", "d")] }, "Аня");
    expect(allowed(m, "Боря")).toEqual({ lay: [], take: false });
  });

  it("в круге видно ровно те карты, что бьют верхнюю", () => {
    let m = start({ Аня: [c("6", "c")], Боря: [c("7", "c"), c("A", "d"), RED] }, "Аня");
    m = ok(m, "Аня", { t: "lay", card: c("6", "c") });
    const may = allowed(m, "Боря");
    expect(may.lay, "крести бьются крестями и джокером; туз буби — нет").toEqual([c("7", "c"), RED]);
    expect(may.take).toBe(true);
  });
});
