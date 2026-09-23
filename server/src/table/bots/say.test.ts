// РАЗГОВОР С МОДЕЛЬЮ. Два закона: в вопросе нет чужих карт, а ответ разбирается терпимо.
//
// Терпимость тут не послабление, а требование: модель почти всегда добавляет слово от себя, и ронять
// из-за этого ход нельзя. Зато число сверяется со списком — мимо списка не пройдёт ничего.

import { describe, expect, it } from "vitest";
import type { Face } from "../contract.js";
import { krestMemory } from "../games/krestMemory.js";
import type { BotView, Move } from "./brain.js";
import { ask, moveSays, pick } from "./say.js";
import { PROFILES } from "./profiles.js";

const c = (rank: string, suit: Face["suit"]): Face => ({ rank, suit });
const id = (f: Face) => `${f.rank}${f.suit}`;
const RING_TO = { in: "deck", pile: "ring" } as const;
const lay = (f: Face): Move => ({ t: "lay", id: id(f), card: f, to: RING_TO });
const take = (f: Face): Move => ({ t: "take", id: id(f), card: f, to: { in: "hand", chair: "a", i: 0 } });

const view = (): BotView => ({
  ring: [c("6", "c")],
  hand: [{ id: id(c("7", "c")), face: c("7", "c") }],
  others: [{ chair: "b", name: "Боря", cards: 5 }],
  closesIfLay: true,
  openerIfTake: null,
  facts: krestMemory([{ who: "b", how: "taken", card: c("9", "h"), over: c("9", "h") }], { a: 1, b: 5 }),
});

const legal: Move[] = [lay(c("7", "c")), take(c("6", "c"))];

describe("bots.the-question-carries-no-hidden-cards", () => {
  it("в вопросе есть свой стол, характер и список ходов", () => {
    const текст = ask(legal, view(), PROFILES["агрессор"]!);
    expect(текст).toContain("7 крест");
    expect(текст).toContain("Боря: 5 карт");
    expect(текст).toContain(PROFILES["агрессор"]!.says);
    expect(текст).toContain("1. положить 7 крест");
    expect(текст).toContain("2. взять из круга 6 крест");
    expect(текст, "просим ровно число").toContain("ОДНИМ числом от 1 до 2");
  });

  it("память стола пересказана словами, а не числами наугад", () => {
    expect(ask(legal, view(), PROFILES["копитель"]!)).toContain("брал из круга 1 раз");
  });

  it("чужих карт в вопросе нет: их неоткуда взять — во взгляде только числа", () => {
    const текст = ask(legal, view(), PROFILES["копитель"]!);
    // У Бори пять карт; ни одна из них не названа, потому что сервер их мозгу и не давал.
    expect(/Боря[^\n]*(туз|король|дама|валет|джокер)/i.test(текст)).toBe(false);
  });
});

describe("bots.an-answer-is-read-forgivingly", () => {
  it("голое число", () => {
    expect(pick(legal, "1")).toEqual(legal[0]);
    expect(pick(legal, "2")).toEqual(legal[1]);
  });

  it("число со словами вокруг — всё равно выбор", () => {
    expect(pick(legal, "Я выберу 2, потому что беру дешёвое.")).toEqual(legal[1]);
    expect(pick(legal, "1.\n")).toEqual(legal[0]);
    expect(pick(legal, "  2  ")).toEqual(legal[1]);
  });

  it("мимо списка — не выбор, и комната возьмёт запасной", () => {
    expect(pick(legal, "3")).toBe(null);
    expect(pick(legal, "0")).toBe(null);
    expect(pick(legal, "-1")).toBe(null);
    expect(pick(legal, "не знаю")).toBe(null);
    expect(pick(legal, "")).toBe(null);
  });

  it("ход называется так, как его называют за столом", () => {
    expect(moveSays(lay(c("A", "d")))).toBe("положить A буби");
    expect(moveSays(lay(c("JK", "r")))).toBe("положить джокер красный");
    expect(moveSays(take(c("6", "s")))).toBe("взять из круга 6 пик");
  });
});
