// ПРАВИЛА КАРТЫ: не поднять / не переместить (поднять можно, при броске возвращается) / не перевернуть — каждое для выбранных людей; отказ показывать или тихо.

import { describe, expect, it } from "vitest";
import { deal } from "./deal.js";
import { Table } from "./table.js";
import type { Person } from "./contract.js";

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });
const seated = () => { const t = new Table(deal(), "a"); t.join(person("a")); t.join(person("b")); return t; };
/** Карта на сукне в известном месте. */
const onFelt = (t: Table) => {
  const id = t.seenBy("a").piles[0]!.cards.at(-1)!.id;
  t.act("a", { t: "grab", id }, 0);
  t.act("a", { t: "drop", id, to: { in: "felt", x: 1, y: 2, up: true, angle: 0 } }, 1);
  return id;
};
const felt = (t: Table, id: string) => t.seenBy("a").felt.find((c) => c.id === id)!;

describe("правила карты", () => {
  it("не поднять — отказ тому, кому нельзя, остальным можно", () => {
    const t = seated(), id = onFelt(t);
    expect(t.act("a", { t: "cardRule", id, rule: "lift", who: "b", on: true }, 2)).toMatchObject({ ops: expect.any(Array) });
    expect(t.act("b", { t: "grab", id }, 3)).toEqual({ refused: "pinned" });
    expect(t.act("a", { t: "grab", id }, 4)).toMatchObject({ ops: expect.any(Array) });
  });
  it("не переместить — поднять можно, а брошенная возвращается на своё место", () => {
    const t = seated(), id = onFelt(t);
    t.act("a", { t: "cardRule", id, rule: "move", who: "b", on: true }, 2);
    expect(t.act("b", { t: "grab", id }, 3)).toMatchObject({ ops: expect.any(Array) });
    t.act("b", { t: "drop", id, to: { in: "felt", x: -3, y: -3, up: true, angle: 40 } }, 4);
    expect(felt(t, id)).toMatchObject({ x: 1, y: 2, angle: 40 });
  });
  it("не переместить — тем, кому не запрещено, можно", () => {
    const t = seated(), id = onFelt(t);
    t.act("a", { t: "cardRule", id, rule: "move", who: "b", on: true }, 2);
    t.act("a", { t: "grab", id }, 3);
    t.act("a", { t: "drop", id, to: { in: "felt", x: -3, y: -3, up: true, angle: 0 } }, 4);
    expect(felt(t, id)).toMatchObject({ x: -3, y: -3 });
  });
  it("не перевернуть — turn отказывает, при этом поднять можно", () => {
    const t = seated(), id = onFelt(t);
    t.act("a", { t: "cardRule", id, rule: "turn", who: "b", on: true }, 2);
    expect(t.act("b", { t: "turn", id }, 3)).toEqual({ refused: "pinned" });
    expect(t.act("a", { t: "turn", id }, 4)).toMatchObject({ ops: expect.any(Array) });
  });
  it("правило видно в снимке, снимается, а когда пусто — карта без правил", () => {
    const t = seated(), id = onFelt(t);
    t.act("a", { t: "cardRule", id, rule: "lift", who: "b", on: true }, 2);
    t.act("a", { t: "cardRule", id, rule: "notice", who: "move", on: true }, 3);
    expect(t.seenBy("b").cardRules?.[id]).toEqual({ lift: ["b"], move: [], turn: [], rotate: [], notice: { lift: false, move: true, turn: false, rotate: false } });
    t.act("a", { t: "cardRule", id, rule: "lift", who: "b", on: false }, 4);
    t.act("a", { t: "cardRule", id, rule: "notice", who: "move", on: false }, 5);
    expect(t.seenBy("b").cardRules?.[id]).toBeUndefined();
    expect(t.act("b", { t: "grab", id }, 6)).toMatchObject({ ops: expect.any(Array) });
  });
  it("правила ставит только админ", () => {
    const t = seated(), id = onFelt(t);
    expect(t.act("b", { t: "cardRule", id, rule: "lift", who: "a", on: true }, 2)).toEqual({ refused: "not-yours" });
  });
  it("повернуть на месте: угол меняется, место и сторона те же", () => {
    const t = seated(), id = onFelt(t);
    expect(t.act("b", { t: "spin", id, angle: 90 }, 2)).toMatchObject({ ops: expect.any(Array) });
    expect(felt(t, id)).toMatchObject({ x: 1, y: 2, angle: 90 });
  });
  it("не вращать — поворот отказывает, остальным можно", () => {
    const t = seated(), id = onFelt(t);
    t.act("a", { t: "cardRule", id, rule: "rotate", who: "b", on: true }, 2);
    expect(t.act("b", { t: "spin", id, angle: 90 }, 3)).toEqual({ refused: "pinned" });
    expect(felt(t, id).angle).toBe(0);
    expect(t.act("a", { t: "spin", id, angle: 30 }, 4)).toMatchObject({ ops: expect.any(Array) });
    expect(felt(t, id).angle).toBe(30);
  });
  it("не вращать — перенесённая карта сохраняет прежний угол", () => {
    const t = seated(), id = onFelt(t);
    t.act("a", { t: "cardRule", id, rule: "rotate", who: "b", on: true }, 2);
    t.act("b", { t: "grab", id }, 3);
    t.act("b", { t: "drop", id, to: { in: "felt", x: -3, y: -3, up: true, angle: 77 } }, 4);
    expect(felt(t, id)).toMatchObject({ x: -3, y: -3, angle: 0 });
  });
  it("нельзя поднять и нельзя переместить поворот не блокируют", () => {
    const t = seated(), id = onFelt(t);
    t.act("a", { t: "cardRule", id, rule: "lift", who: "b", on: true }, 2);
    t.act("a", { t: "cardRule", id, rule: "move", who: "b", on: true }, 3);
    expect(t.act("b", { t: "spin", id, angle: 45 }, 4)).toMatchObject({ ops: expect.any(Array) });
    expect(felt(t, id)).toMatchObject({ x: 1, y: 2, angle: 45 });
  });
  it("нельзя перемещать, но вращать можно — перенесённая карта возвращается, угол новый", () => {
    const t = seated(), id = onFelt(t);
    t.act("a", { t: "cardRule", id, rule: "move", who: "b", on: true }, 2);
    t.act("b", { t: "grab", id }, 3);
    t.act("b", { t: "drop", id, to: { in: "felt", x: -3, y: -3, up: true, angle: 77 } }, 4);
    expect(felt(t, id)).toMatchObject({ x: 1, y: 2, angle: 77 });
  });
});
