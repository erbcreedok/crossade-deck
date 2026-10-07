// ПРАВИЛА СТОПКИ: не снять верхнюю / не положить / не сдвинуть / не перевернуть / не перемешать / не отсортировать — каждое для выбранных людей; предел карт и сторона укладки.

import { describe, expect, it } from "vitest";
import { deal } from "./deal.js";
import { Table } from "./table.js";
import { MAIN_PILE, mergeCheck, mergeKnobs, shakeKnobs, type Person } from "./contract.js";

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });
const seated = () => { const t = new Table(deal().slice(0, 10), "a"); t.join(person("a")); t.join(person("b")); return t; };
const rule = (t: Table, by: string, intent: Record<string, unknown>) => t.act(by, { t: "pileRule", pile: MAIN_PILE, ...intent } as never, 1);
const pile = (t: Table) => t.seenBy("a").piles.find((p) => p.id === MAIN_PILE)!;
const top = (t: Table) => pile(t).cards.at(-1)!.id;
const felt = { in: "felt", x: 1, y: 2, up: true, angle: 0 } as const;

describe("правила стопки", () => {
  it("не снять верхнюю — отказ тому, кому нельзя, остальным можно", () => {
    const t = seated();
    expect(rule(t, "a", { rule: "take", who: "b", on: true })).toMatchObject({ ops: expect.any(Array) });
    expect(t.act("b", { t: "grab", id: top(t) }, 2)).toEqual({ refused: "pinned" });
    expect(t.act("a", { t: "grab", id: top(t) }, 3)).toMatchObject({ ops: expect.any(Array) });
  });
  it("не положить — отказ; карту, взятую из этой же стопки, вернуть можно", () => {
    const t = seated();
    const mine = top(t);
    t.act("b", { t: "grab", id: mine }, 1);
    rule(t, "a", { rule: "put", who: "b", on: true });
    expect(t.act("b", { t: "drop", id: mine, to: { in: "deck", pile: MAIN_PILE } }, 2)).toMatchObject({ ops: expect.any(Array) });
    const other = top(t);
    t.act("a", { t: "grab", id: other }, 3);
    t.act("a", { t: "drop", id: other, to: felt }, 4);
    t.act("b", { t: "grab", id: other }, 5);
    expect(t.act("b", { t: "drop", id: other, to: { in: "deck", pile: MAIN_PILE } }, 6)).toMatchObject({ refused: "pinned" });
  });
  it("не сдвинуть — deckMove отказывает тому, кому нельзя", () => {
    const t = seated();
    rule(t, "a", { rule: "move", who: "b", on: true });
    expect(t.act("b", { t: "deckMove", pile: MAIN_PILE, x: 2, y: 2 }, 2)).toEqual({ refused: "pinned" });
    expect(t.act("a", { t: "deckMove", pile: MAIN_PILE, x: 2, y: 2 }, 3)).toMatchObject({ ops: expect.any(Array) });
  });
  it("не брать за язычок: grip отказывает тому, кому нельзя; язычок скрыт (tab) — правило хранится и видно в снимке", () => {
    const t = seated();
    rule(t, "a", { rule: "grip", who: "b", on: true });
    rule(t, "a", { rule: "tab", who: "b", on: true });
    expect(t.act("b", { t: "grip", pile: MAIN_PILE }, 2)).toEqual({ refused: "pinned" });
    expect(t.act("a", { t: "grip", pile: MAIN_PILE }, 3)).toMatchObject({ ops: expect.any(Array) });
    expect(t.seenBy("b").pileRules?.[MAIN_PILE]?.tab).toEqual(["b"]);
  });
  it("долгое удержание: правило hold для людей и время holdMs хранятся в снимке", () => {
    const t = seated();
    rule(t, "a", { rule: "hold", who: "b", on: true });
    rule(t, "a", { rule: "holdMs", value: 800 });
    expect(t.seenBy("b").pileRules?.[MAIN_PILE]).toMatchObject({ hold: ["b"], holdMs: 800 });
  });
  it("не перевернуть, не перемешать, не отсортировать — по одному", () => {
    const t = seated();
    for (const how of ["flip", "shuffle", "sort"] as const) {
      rule(t, "a", { rule: how, who: "b", on: true });
      expect(t.act("b", { t: "deckDo", pile: MAIN_PILE, how }, 2)).toEqual({ refused: "pinned" });
      expect(t.act("a", { t: "deckDo", pile: MAIN_PILE, how }, 3)).toMatchObject({ ops: expect.any(Array) });
    }
  });
  it("предел карт: в полную стопку класть нельзя («full»), под пределом можно", () => {
    const t = seated();
    const id = top(t);
    t.act("a", { t: "grab", id }, 1);
    t.act("a", { t: "drop", id, to: felt }, 2);
    expect(pile(t).cards.length).toBe(9);
    rule(t, "a", { rule: "limit", value: 9 });
    t.act("b", { t: "grab", id }, 3);
    expect(t.act("b", { t: "drop", id, to: { in: "deck", pile: MAIN_PILE } }, 4)).toMatchObject({ refused: "full" });
    rule(t, "a", { rule: "limit", value: 10 });
    t.act("b", { t: "grab", id }, 4.5);
    expect(t.act("b", { t: "drop", id, to: { in: "deck", pile: MAIN_PILE } }, 5)).toMatchObject({ ops: expect.any(Array) });
    expect(pile(t).cards.length).toBe(10);
  });
  it("сторона укладки: всегда лицом вверх / рубашкой вверх / как несли", () => {
    const t = seated();
    const id = top(t);
    t.act("a", { t: "grab", id }, 1);
    t.act("a", { t: "drop", id, to: felt }, 2);
    rule(t, "a", { rule: "side", value: "up" });
    t.act("a", { t: "grab", id }, 3);
    t.act("a", { t: "drop", id, to: { in: "deck", pile: MAIN_PILE } }, 4);
    expect(pile(t).cards.at(-1)).toMatchObject({ id, up: true });
    rule(t, "a", { rule: "side", value: "down" });
    t.act("a", { t: "grab", id }, 5);
    t.act("a", { t: "drop", id, to: { in: "deck", pile: MAIN_PILE } }, 6);
    expect(pile(t).cards.at(-1)?.up).not.toBe(true);
  });
  it("целую стопку в другую стопку: «put» и предел цели", () => {
    const t = seated();
    const a = top(t);
    t.act("a", { t: "grab", id: a }, 1);
    t.act("a", { t: "drop", id: a, to: felt }, 2);
    const b = top(t);
    t.act("a", { t: "grab", id: b }, 3);
    t.act("a", { t: "drop", id: b, to: { in: "felt", x: -2, y: 1, up: true, angle: 0 } }, 4);
    t.act("a", { t: "gather", ids: [a, b], side: "keep", to: { x: 3, y: 3, angle: 0 } }, 5);
    const other = t.seenBy("a").piles.find((p) => p.id !== MAIN_PILE);
    expect(other, "вторая стопка собралась").toBeTruthy();
    rule(t, "a", { rule: "put", who: "b", on: true });
    expect(t.act("b", { t: "pileDrop", pile: other!.id, to: { in: "deck", pile: MAIN_PILE } } as never, 4)).toMatchObject({ refused: "pinned" });
    rule(t, "a", { rule: "put", who: "b", on: false });
    rule(t, "a", { rule: "limit", value: 8 });
    expect(t.act("b", { t: "pileDrop", pile: other!.id, to: { in: "deck", pile: MAIN_PILE } } as never, 5)).toMatchObject({ refused: "full" });
  });
  it("правила видны в снимке и снимаются; пустые — стопка без правил", () => {
    const t = seated();
    rule(t, "a", { rule: "take", who: "b", on: true });
    rule(t, "a", { rule: "notice", who: "put", on: true });
    rule(t, "a", { rule: "limit", value: 5 });
    rule(t, "a", { rule: "side", value: "down" });
    rule(t, "a", { rule: "holdMs", value: 2200 });
    expect(t.seenBy("b").pileRules?.[MAIN_PILE]).toEqual({ take: ["b"], put: [], move: [], grip: [], tab: [], hold: [], flip: [], shuffle: [], sort: [], notice: { take: false, put: true, move: false, grip: false, tab: false, hold: false, flip: false, shuffle: false, sort: false }, limit: 5, side: "down", holdMs: 2200 });
    rule(t, "a", { rule: "take", who: "b", on: false });
    rule(t, "a", { rule: "notice", who: "put", on: false });
    rule(t, "a", { rule: "limit", value: 0 });
    rule(t, "a", { rule: "side", value: "keep" });
    rule(t, "a", { rule: "holdMs", value: 400 });
    expect(t.seenBy("b").pileRules?.[MAIN_PILE]).toBeUndefined();
  });
  it("ставит только админ, лишнее и неверное — отказ", () => {
    const t = seated();
    expect(rule(t, "b", { rule: "take", who: "a", on: true })).toEqual({ refused: "not-yours" });
    expect(rule(t, "a", { rule: "limit", value: 1000 })).toEqual({ refused: "bad" });
    expect(rule(t, "a", { rule: "side", value: "sideways" })).toEqual({ refused: "bad" });
    expect(rule(t, "a", { rule: "holdMs", value: 50 })).toEqual({ refused: "bad" });
    expect(rule(t, "a", { rule: "holdMs", value: 9000 })).toEqual({ refused: "bad" });
  });
});

describe("слияние: совместимость, ручки времени и режимы сторон", () => {
  it("mergeCheck: вид совпадает всегда; сторона — по режиму", () => {
    const up = { kind: "card", up: true } as const, down = { kind: "card", up: false } as const;
    expect(mergeCheck(up, up, "refuse")).toBe("ok");
    expect(mergeCheck(up, down, "refuse")).toBe("no");
    expect(mergeCheck(up, down, "flip")).toBe("flip");
    expect(mergeCheck({ kind: "chip", up: true }, up, "flip")).toBe("no");
  });
  it("ручки: значения по умолчанию, свои у стопки, стол под ними, null — вернуть наследование", () => {
    const t = seated();
    expect(mergeKnobs(t.seenBy("a").pileRules, MAIN_PILE)).toEqual({ drop: "refuse", hold: "refuse", delay: 400, glow: 300, blink: 400, lift: 100 });
    for (const [r, v] of [["delayMs", 400], ["glowMs", 100], ["liftMs", 600], ["holdMs", 900], ["holdSides", "flip"]] as const) expect(rule(t, "a", { rule: r, value: v })).toMatchObject({ ops: expect.any(Array) });
    expect(t.act("a", { t: "pileRule", pile: "*", rule: "dropSides", value: "flip" }, 2)).toMatchObject({ ops: expect.any(Array) });
    expect(mergeKnobs(t.seenBy("a").pileRules, MAIN_PILE)).toEqual({ drop: "flip", hold: "flip", delay: 400, glow: 100, blink: 900, lift: 600 });
    rule(t, "a", { rule: "dropSides", value: "refuse" });
    expect(mergeKnobs(t.seenBy("a").pileRules, MAIN_PILE).drop).toBe("refuse");
    rule(t, "a", { rule: "dropSides", value: null });
    expect(mergeKnobs(t.seenBy("a").pileRules, MAIN_PILE).drop).toBe("flip");
    for (const r of ["delayMs", "glowMs", "liftMs", "holdSides"] as const) rule(t, "a", { rule: r, value: null });
    rule(t, "a", { rule: "holdMs", value: 400 });
    expect(mergeKnobs(t.seenBy("a").pileRules, MAIN_PILE)).toEqual({ drop: "flip", hold: "refuse", delay: 400, glow: 300, blink: 400, lift: 100 });
  });
  it("за пределами — отказ; правила стола ставит только тот, кто может стопкам", () => {
    const t = seated();
    expect(rule(t, "a", { rule: "delayMs", value: 99999 })).toEqual({ refused: "bad" });
    expect(rule(t, "a", { rule: "liftMs", value: -1 })).toEqual({ refused: "bad" });
    expect(rule(t, "a", { rule: "dropSides", value: "sideways" })).toEqual({ refused: "bad" });
    expect(t.act("b", { t: "pileRule", pile: "*", rule: "dropSides", value: "flip" }, 3)).toEqual({ refused: "not-yours" });
  });
  it("сбор строгий: вся стопка одной стороны — цели, а без цели — первой собираемой", () => {
    const t = seated();
    const lay = (x: number, up: boolean) => {
      const id = t.seenBy("a").piles[0]!.cards.at(-1)!.id;
      expect(t.act("a", { t: "grab", id }, 3)).toMatchObject({ ops: expect.any(Array) });
      expect(t.act("a", { t: "drop", id, to: { in: "felt", x, y: 0, up, angle: 0 } }, 4)).toMatchObject({ ops: expect.any(Array) });
      if (t.seenBy("a").felt.find((f) => f.id === id)!.up !== up) t.act("a", { t: "turn", id }, 4);
      return id;
    };
    const one = lay(1, true), two = lay(2, false);
    expect(t.act("a", { t: "gather", ids: [one, two], side: "keep", to: { x: 3, y: 3, angle: 0 } }, 5)).toMatchObject({ ops: expect.any(Array) });
    const p1 = t.seenBy("a").piles.find((p) => p.id === "p1")!;
    expect(p1.cards.map((c) => c.up === true)).toEqual([true, true]);
    const three = t.seenBy("a").piles[0]!.cards.at(-1)!.id;
    expect(t.act("a", { t: "gather", ids: [three], side: "keep", to: { pile: "p1" } }, 6)).toMatchObject({ ops: expect.any(Array) });
    expect(t.seenBy("a").piles.find((p) => p.id === "p1")!.cards.map((c) => c.up === true)).toEqual([true, true, true]);
  });
});

describe("тряска: ручки и отпадание присоединённого из пальца", () => {
  it("ручки тряски — на столе, значения по умолчанию, свои, null возвращает умолчание, за пределами отказ", () => {
    const t = seated();
    expect(shakeKnobs(t.seenBy("a").pileRules)).toEqual({ amp: 60, turns: 6, ms: 700, nextTurns: 4, nextMs: 900, g: 15 });
    for (const [r, v] of [["shakeAmp", 60], ["shakeTurns", 6], ["shakeMs", 1000], ["nextTurns", 3], ["nextMs", 1500], ["shakeG", 20]] as const) expect(t.act("a", { t: "pileRule", pile: "*", rule: r, value: v }, 2)).toMatchObject({ ops: expect.any(Array) });
    expect(shakeKnobs(t.seenBy("a").pileRules)).toEqual({ amp: 60, turns: 6, ms: 1000, nextTurns: 3, nextMs: 1500, g: 20 });
    for (const r of ["shakeAmp", "shakeTurns", "shakeMs", "nextTurns", "nextMs", "shakeG"] as const) t.act("a", { t: "pileRule", pile: "*", rule: r, value: null }, 3);
    expect(t.seenBy("a").pileRules?.["*"]).toBeUndefined();
    expect(t.act("a", { t: "pileRule", pile: "*", rule: "shakeAmp", value: 5 }, 4)).toEqual({ refused: "bad" });
    expect(t.act("a", { t: "pileRule", pile: "*", rule: "shakeTurns", value: 99 }, 4)).toEqual({ refused: "bad" });
  });
  it("присоединённые карты можно вынуть из стопки в пальце: они ложатся новой стопкой или картой, в пальце остаётся остальное", () => {
    const t = seated();
    const deck = t.seenBy("a").piles[0]!.cards;
    const ids = [deck[0]!.id, deck[1]!.id, deck[2]!.id];
    expect(t.act("a", { t: "gather", ids, side: "keep", to: { x: 3, y: 3, angle: 0 } }, 5)).toMatchObject({ ops: expect.any(Array) });
    const p1 = t.seenBy("a").piles.find((p) => p.id === "p1")!;
    expect(t.act("a", { t: "grip", pile: "p1" }, 6)).toMatchObject({ ops: expect.any(Array) });
    expect(t.act("a", { t: "gather", ids: [p1.cards[0]!.id, p1.cards[1]!.id], side: "keep", to: { x: -3, y: 2, angle: 0 } }, 7)).toMatchObject({ ops: expect.any(Array) });
    const piles = t.seenBy("a").piles;
    // В пальце осталась одна карта — это уже не стопка: она лежит на сукне, а отпавшие две — новой стопкой.
    expect(piles.find((p) => p.id === "p1")).toBeUndefined();
    expect(t.seenBy("a").felt.map((c) => c.id)).toContain(p1.cards[2]!.id);
    expect(piles.find((p) => p.id === "p2")!.cards.map((c) => c.id)).toEqual([p1.cards[0]!.id, p1.cards[1]!.id]);
  });
});
