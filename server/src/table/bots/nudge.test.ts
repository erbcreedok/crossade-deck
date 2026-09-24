// КОГДА БОТУ ХОДИТЬ. Часы здесь фальшивые, и это единственный способ проверить «две секунды тишины»
// быстрее, чем за две секунды.
//
// Каждый случай тут однажды выглядел как поломка стола: бот сходил, пока человек вёл карту; четыре
// бота сходили одновременно; бот не сходил вовсе, потому что ждал события, которого не будет.

import { describe, expect, it } from "vitest";
import { nextLook, ready, stirs, type Quiet } from "./nudge.js";
import { PROFILES } from "./profiles.js";

const тишина = (было: number, прошло: number): Quiet => ({ busy: false, handsOn: false, stirredAt: было, now: было + прошло });

describe("bots.a-bot-moves-only-into-silence", () => {
  it("пауза не вышла — не ходит", () => {
    expect(ready(тишина(1000, 1999), 2000)).toBe(false);
    expect(ready(тишина(1000, 2000), 2000), "ровно пауза — уже можно").toBe(true);
  });

  it("идёт команда стола — не ходит, сколько бы ни ждал", () => {
    expect(ready({ ...тишина(0, 100000), busy: true }, 2000)).toBe(false);
  });

  it("кто-то держит карту — не ходит: это палец человека на столе", () => {
    expect(ready({ ...тишина(0, 100000), handsOn: true }, 2000)).toBe(false);
  });

  it("у каждого характера своя пауза: в один и тот же миг готов не всякий", () => {
    const q = тишина(0, 1500);
    const готовы = Object.values(PROFILES).filter((p) => ready(q, p.waitMs)).map((p) => p.key);
    expect(готовы, "через 1.5 с готов только самый быстрый").toEqual(["агрессор"]);
  });

  it("ЧЕТВЕРО НЕ ХОДЯТ СТРОЕМ: у всех характеров паузы разные", () => {
    const паузы = Object.values(PROFILES).map((p) => p.waitMs);
    expect(new Set(паузы).size).toBe(паузы.length);
  });
});

describe("bots.the-room-looks-again-by-the-clock", () => {
  it("ждёт ровно столько, сколько осталось самому близкому", () => {
    expect(nextLook(тишина(0, 500), [2000, 2600]), "ближайшему осталось 1.5 с").toBe(1500);
  });

  it("пауза уже вышла — заглянуть прямо сейчас", () => {
    expect(nextLook(тишина(0, 5000), [2000, 2600])).toBe(0);
  });

  it("СТОЛ ЗАНЯТ — всё равно заглядываем по часам, а не ждём события", () => {
    // Иначе бот замирает навсегда: `busy` снимается без всякого намерения, и разбудить его нечем.
    expect(nextLook({ ...тишина(0, 100000), busy: true }, [2000, 2600])).toBe(2000);
    expect(nextLook({ ...тишина(0, 100000), handsOn: true }, [2600])).toBe(2600);
  });

  it("ботов за столом нет — заглядывать не за кем", () => {
    expect(nextLook(тишина(0, 100), [])).toBe(0);
  });
});

// ЧТО СБИВАЕТ ТИШИНУ. Пауза защищает от одного: бот не кладёт карту человеку под руку. Значит и
// считать надо только то, что двигает ВЕЩИ. Щёлкать замком на чужой руке можно хоть минуту — стол
// от этого не шевелится, и бот, замирающий от каждого нажатия, выглядит сломанным.
describe("bots.only-touching-things-breaks-the-silence", () => {
  it("руки на вещах — тишина сбивается", () => {
    for (const t of ["grab", "hold", "drop", "release", "grip", "turn", "flip", "arrange", "gather", "massDrop", "pileDrop", "deckMove", "deckDo"]) {
      expect(stirs({ t }), t).toBe(true);
    }
  });

  it("ФЛАГИ, ПОЗЫ И ВЗГЛЯДЫ — НЕ СБИВАЮТ: они к игре отношения не имеют", () => {
    for (const t of ["flag", "pose", "pick", "unpick", "sit", "stand", "sync", "look", "dealer", "crew", "deckPin", "deckGuard", "deckForever"]) {
      expect(stirs({ t }), t).toBe(false);
    }
  });
});
