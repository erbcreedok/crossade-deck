// @vitest-environment jsdom
// СТОРОЖ `hub.the-way-back-comes-before-the-choice`.
//
// Человек чаще ВОЗВРАЩАЕТСЯ, чем выбирает. Полка отвечает на «во что играть», ряд — на «куда
// зайти», и у вернувшегося он первый. Пустая полоса «пока ничего» занимает место и не говорит
// ничего — поэтому ряда, которому нечего предложить, нет вовсе.

import { describe, expect, it } from "vitest";
import { comebackCards, comebackRow } from "./comeback.js";
import type { RoomCard } from "@crossade/wire";

const card = (one: Partial<RoomCard> & { code: string }): RoomCard => ({
  room: `rec-${one.code}`,
  game: "cards",
  title: null,
  chairs: 4,
  capacity: 32,
  newcomer: "player" as const,
  visibility: "public",
  admission: "code",
  mode: "free",
  forever: false,
  createdAt: 1,
  owner: null,
  people: [],
  taken: 1,
  online: 1,
  ...one,
});

describe("hub.the-way-back-comes-before-the-choice", () => {
  it("предлагают только свои столы", () => {
    const cards = comebackCards([card({ code: "A", mySeat: true }), card({ code: "B" })]);
    expect(cards.map((one) => one.code)).toEqual(["A"]);
  });

  it("где ждут хода — первым, и эта карточка горячая", () => {
    const cards = comebackCards([
      card({ code: "A", mySeat: true }),
      card({ code: "B", mySeat: true, myTurn: true }),
    ]);
    expect(cards[0]!.code).toBe("B");
    expect(cards[0]!.hot).toBe(true);
    expect(cards[0]!.said).toBe("твой ход");
  });

  it("за своим столом важно, есть ли там кто-то", () => {
    const cards = comebackCards([card({ code: "A", mySeat: true, taken: 2, online: 0 })]);
    expect(cards[0]!.said).toBe("все вышли · ждёт");
  });

  it("предлагать нечего — ряда нет вовсе, а не полоса «пока ничего»", () => {
    const container = document.createElement("div");
    const row = comebackRow(container, () => undefined);
    row.set([]);
    expect(row.element.innerHTML).toBe("");
    expect(row.element.textContent).toBe("");
  });

  it("нажатие уводит в тот самый стол", () => {
    const went: string[] = [];
    const container = document.createElement("div");
    document.body.appendChild(container);
    const row = comebackRow(container, (game, code) => went.push(`${game}:${code}`));
    row.set(comebackCards([card({ code: "0244", mySeat: true })]));

    row.element.querySelector<HTMLElement>('[data-do="go:cards:0244"]')?.click();
    expect(went).toEqual(["cards:0244"]);
  });
});
