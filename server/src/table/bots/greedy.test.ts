// ХАРАКТЕР ВИДЕН ПО ХОДУ. Если четыре профиля ходят одинаково, профилей нет — есть четыре имени.
//
// Проверяется не «умно ли сыграл» (это вкусовщина), а то, что вес характера меняет выбор в ту
// сторону, которая этому характеру обещана.

import { describe, expect, it } from "vitest";
import type { Face } from "../contract.js";
import { krestMemory } from "../games/krestMemory.js";
import type { BotView, Move } from "./brain.js";
import { fromList, sameMove } from "./brain.js";
import { best, price, worth, randomBrain, greedyBrain } from "./greedy.js";
import { ask } from "./say.js";
import { PROFILES, profileOf } from "./profiles.js";

const c = (rank: string, suit: Face["suit"]): Face => ({ rank, suit });
const id = (f: Face) => `${f.rank}${f.suit}`;
const RING_TO = { in: "deck", pile: "ring" } as const;
const MY_HAND = { in: "hand", chair: "a", i: 0 } as const;
const lay = (f: Face): Move => ({ t: "lay", id: id(f), card: f, to: RING_TO });
const take = (f: Face): Move => ({ t: "take", id: id(f), card: f, to: MY_HAND });

const view = (hand: Face[], ring: Face[] = [], closesIfLay = false): BotView => ({
  ring,
  hand: hand.map((f) => ({ id: id(f), face: f })),
  others: [{ chair: "b", name: "Боря", cards: 5 }],
  closesIfLay,
  openerIfTake: null,
  facts: krestMemory([], { a: hand.length, b: 5 }),
});

describe("bots.a-profile-changes-the-move", () => {
  it("джокер дороже всего, мусор дешевле всего", () => {
    expect(worth(c("JK", "r"))).toBeGreaterThan(worth(c("A", "d")));
    expect(worth(c("A", "d")), "козырный туз дороже простой семёрки").toBeGreaterThan(worth(c("7", "h")));
    expect(worth(c("7", "c")), "крести дороже той же семёрки другой масти").toBeGreaterThan(worth(c("7", "h")));
  });

  it("КОПИТЕЛЬ отдаёт мусор, АГРЕССОР давит старшей — из одной и той же руки", () => {
    const hand = [c("7", "h"), c("A", "s")];
    const легальные = hand.map(lay);
    const скупой = best(легальные, view(hand), PROFILES["копитель"]!);
    const злой = best(легальные, view(hand), PROFILES["агрессор"]!);
    expect(скупой.t === "lay" && скупой.card.rank, "бережёт туза").toBe("7");
    expect(злой.t === "lay" && злой.card.rank, "давит тузом").toBe("A");
  });

  it("ЗАКРЫВАЛА закрывает круг даже дорогой картой, копитель — нет", () => {
    // Рука не на исходе: иначе верх берёт другой закон — «скидывай, пока можешь выйти».
    const hand = [c("A", "d"), c("K", "h"), c("9", "s")];
    const legal: Move[] = [lay(c("A", "d")), take(c("K", "s"))];
    expect(best(legal, view(hand, [c("K", "s")], true), PROFILES["закрывала"]!).t, "закрыть важнее, чем сберечь").toBe("lay");
    expect(best(legal, view(hand, [c("K", "s")], false), PROFILES["копитель"]!).t, "круг не закроется — козырь жалко").toBe("take");
  });

  it("рука почти пуста — скидывать важнее, чем беречь: выигрывает тот, кто вышел", () => {
    const hand = [c("JK", "r")];
    const legal: Move[] = [lay(c("JK", "r")), take(c("K", "s"))];
    expect(best(legal, view(hand, [c("K", "s")]), PROFILES["копитель"]!).t, "последняя карта уходит, даже джокер").toBe("lay");
  });

  it("у каждого характера своя пауза — иначе четыре бота ходят строем", () => {
    const паузы = Object.values(PROFILES).map((p) => p.waitMs);
    expect(new Set(паузы).size, "все разные").toBe(паузы.length);
    expect(Math.min(...паузы)).toBeGreaterThanOrEqual(1000);
  });

  it("незнакомый характер — новичок, а не падение", () => {
    expect(profileOf("такого-нет").key).toBe("новичок");
    expect(profileOf(undefined).key).toBe("новичок");
  });
});

describe("bots.a-brain-answer-must-come-from-the-list", () => {
  const legal: Move[] = [lay(c("6", "d")), take(c("K", "s"))];

  it("ход из списка узнаётся по карте, а не по ссылке", () => {
    expect(fromList(legal, { t: "lay", id: id(c("6", "d")), card: c("6", "d"), to: RING_TO })).toEqual(legal[0]);
    expect(sameMove(take(c("K", "s")), take(c("K", "s")))).toBe(true);
  });

  it("ход не из списка — null, и комната возьмёт запасной", () => {
    expect(fromList(legal, lay(c("A", "s"))), "такой карты в списке нет").toBe(null);
    expect(fromList(legal, null)).toBe(null);
    expect(fromList([], take(c("K", "s"))), "списка нет — и хода нет").toBe(null);
  });

  it("скриптовый мозг всегда отвечает ходом из списка", async () => {
    const pick = await greedyBrain().choose(legal, view([c("6", "d")]), PROFILES["новичок"]!, 100);
    expect(fromList(legal, pick)).not.toBe(null);
  });

  it("случайный мозг не выходит за список даже на краю", async () => {
    for (const rnd of [() => 0, () => 0.999999, () => 1]) {
      const pick = await randomBrain(rnd).choose(legal, view([c("6", "d")]), PROFILES["новичок"]!, 100);
      expect(fromList(legal, pick)).not.toBe(null);
    }
  });
});

// ЦЕЛЬ ИГРЫ — ИЗБАВИТЬСЯ ОТ КАРТ. Не оттенок характера, а главный закон: без него боты играют в
// «красиво побить», а не в «выиграть», и это видно за столом — они вечно берут из круга.
describe("bots.the-goal-is-to-run-out-of-cards", () => {
  it("чем меньше карт в руке, тем дороже взять", () => {
    const много = view(Array.from({ length: 8 }, (_, i) => c(String(i + 6), "s")), [c("K", "h")]);
    const мало = view([c("7", "h"), c("8", "h")], [c("K", "h")]);
    const брать = take(c("K", "h"));
    expect(price(брать, мало, PROFILES["новичок"]!), "у края взять дороже, чем с полной рукой")
      .toBeGreaterThan(price(брать, много, PROFILES["новичок"]!));
  });

  it("ДАЖЕ НОВИЧОК на последней карте кладёт, а не берёт", () => {
    // Иначе партия не кончается: игрок у победы сам отодвигает её, забирая карту из круга.
    const hand = [c("6", "h")];
    const legal: Move[] = [lay(c("6", "h")), take(c("K", "s"))];
    expect(best(legal, view(hand, [c("K", "s")]), PROFILES["новичок"]!).t).toBe("lay");
  });

  it("цель названа в вопросе модели — первой строкой", () => {
    const текст = ask([lay(c("6", "h"))], view([c("6", "h")]), PROFILES["новичок"]!);
    expect(текст).toContain("ЦЕЛЬ: первым избавиться от всех своих карт");
    expect(текст, "и чем кончается для проигравшего").toContain("остался с картами последним — проиграл");
  });
});
