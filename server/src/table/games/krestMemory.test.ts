// ПАМЯТЬ СТОЛА — то, ради чего за столом смотрят на чужие руки, а не в свои карты.
//
// Каждый вывод здесь — тот, что живой игрок делает вслух: «он не побил крести — значит нет у него
// крестей старше девятки». Ошибись в нём — и бот будет уверенно играть против выдуманного стола.

import { describe, expect, it } from "vitest";
import type { Face } from "../contract.js";
import { krestMemory, lacksAgainst, type Deed } from "./krestMemory.js";

const c = (rank: string, suit: Face["suit"]): Face => ({ rank, suit });

describe("memory.the-table-remembers-what-cards-cannot-show", () => {
  it("кто сколько раз брал — счёт идёт по ходам, а карты в руке по столу", () => {
    const deeds: Deed[] = [
      { who: "a", how: "laid", card: c("6", "d") },
      { who: "b", how: "taken", card: c("6", "d"), over: c("6", "d") },
    ];
    const facts = krestMemory(deeds, { a: 5, b: 7 });
    expect(facts.who["b"]!.took).toBe(1);
    expect(facts.who["b"]!.cards, "число карт — со стола, а не из истории").toBe(7);
    expect(facts.who["a"]!.took).toBe(0);
  });

  it("НЕ ПОБИЛ — ЗНАЧИТ НЕТ: взял при девятке червей — червей старше девятки у него нет", () => {
    const deeds: Deed[] = [
      { who: "a", how: "laid", card: c("9", "h") },
      { who: "b", how: "taken", card: c("9", "h"), over: c("9", "h") },
    ];
    const facts = krestMemory(deeds, { a: 3, b: 4 });
    expect(lacksAgainst(facts, "b", c("9", "h")), "ровно та же карта").toBe(true);
    expect(lacksAgainst(facts, "b", c("7", "h")), "и всё, что младше, он бы тоже не побил").toBe(true);
    expect(lacksAgainst(facts, "b", c("K", "h")), "а про короля червей ничего не известно").toBe(false);
    expect(lacksAgainst(facts, "b", c("9", "s")), "и про другую масть тоже").toBe(false);
  });

  it("козырь считается потраченным, только когда им БИЛИ", () => {
    const открыл: Deed[] = [{ who: "a", how: "laid", card: c("K", "d") }];
    expect(krestMemory(открыл, {}).who["a"]!.spentTrump, "открыть круг козырем — не значит потратить").toBe(false);
    const побил: Deed[] = [{ who: "a", how: "laid", card: c("K", "d"), over: c("9", "s") }];
    expect(krestMemory(побил, {}).who["a"]!.spentTrump).toBe(true);
  });

  it("считает, что вышло: масти, козыри, джокеры и шестёрки", () => {
    const deeds: Deed[] = [
      { who: "a", how: "laid", card: c("6", "d") },
      { who: "b", how: "laid", card: c("7", "d"), over: c("6", "d") },
      { who: "v", how: "laid", card: c("JK", "r"), over: c("7", "d") },
      { who: "a", how: "laid", card: c("6", "c"), over: c("JK", "r") },
    ];
    const facts = krestMemory(deeds, {});
    expect(facts.trumpsSeen, "шестёрка и семёрка буби").toBe(2);
    expect(facts.jokersSeen).toBe(1);
    expect(facts.sixesSeen, "шестёрка буби и шестёрка крестей").toBe(2);
    expect(facts.seen["d"]).toBe(2);
    expect(facts.who["a"]!.laidClubs, "крести клал").toBe(true);
    expect(facts.who["v"]!.laidJoker).toBe(true);
  });

  it("взятие мастей не прибавляет: карта ушла в руку, а не вышла из игры", () => {
    const deeds: Deed[] = [{ who: "b", how: "taken", card: c("6", "d"), over: c("6", "d") }];
    expect(krestMemory(deeds, {}).trumpsSeen, "взятый козырь снова в чьей-то руке").toBe(0);
  });
});
