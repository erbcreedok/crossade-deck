import { describe, expect, it } from "vitest";
import { deal } from "../src/table/deal.js";
import { Table } from "../src/table/table.js";
import { MAIN_PILE, type Op, type Person } from "../src/table/contract.js";
import { Tape, anchor, locate } from "./tape.js";

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });
const table = () => {
  const t = new Table(deal(), "a");
  t.join(person("a"));
  t.join(person("b"));
  return t;
};
const opsOf = (out: ReturnType<Table["act"]>): Op[] => {
  if ("refused" in out) throw new Error(out.refused);
  return out.ops as Op[];
};
const felt = { in: "felt", x: 1, y: 2, up: true, angle: 0 } as const;

describe("лента партии", () => {
  it("собирает стол на любой момент: до хода — как было, после — карта на сукне", () => {
    const t = table(), tape = new Tape();
    const top = t.seenBy("a").piles.find((p) => p.id === MAIN_PILE)!.cards.at(-1)!.id;
    tape.begin(t.seenBy("a"), 0);
    tape.push(1000, opsOf(t.act("a", { t: "grab", id: top }, 1000)), t.seenBy("a"));
    tape.push(3000, opsOf(t.act("a", { t: "drop", id: top, to: felt }, 3000)), t.seenBy("a"));
    expect(tape.stateAt(500).felt).toEqual([]);
    expect(tape.stateAt(2000).locks[top]).toBe("a");
    expect(tape.stateAt(3500).felt.map((c) => c.id)).toEqual([top]);
    expect(tape.stateAt(3500).locks[top]).toBeUndefined();
    // Назад после вперёда — снова тот же прошлый стол.
    expect(tape.stateAt(500).felt).toEqual([]);
  });

  it("событие ленты: кто, откуда и куда, когда взял и сколько думал до этого", () => {
    const t = table(), tape = new Tape();
    const c = t.seenBy("a").piles.find((p) => p.id === MAIN_PILE)!.cards.map((x) => x.id);
    tape.begin(t.seenBy("a"), 0);
    tape.push(1000, opsOf(t.act("a", { t: "grab", id: c.at(-1)! }, 1000)), t.seenBy("a"));
    tape.push(3000, opsOf(t.act("a", { t: "drop", id: c.at(-1)!, to: felt }, 3000)), t.seenBy("a"));
    tape.push(9000, opsOf(t.act("a", { t: "grab", id: c.at(-2)! }, 9000)), t.seenBy("a"));
    tape.push(9500, opsOf(t.act("a", { t: "drop", id: c.at(-2)!, to: { ...felt, x: 3 } }, 9500)), t.seenBy("a"));
    const [m1, m2] = tape.moments;
    expect(m1).toMatchObject({ kind: "move", by: "a", t0: 1000, t: 3000, think: null });
    expect(m2).toMatchObject({ t0: 9000, t: 9500, think: 6000 });
    expect(m1!.to).toMatchObject({ in: "felt" });
  });

  it("прыжок по событиям: назад и вперёд от любого времени", () => {
    const t = table(), tape = new Tape();
    const c = t.seenBy("a").piles.find((p) => p.id === MAIN_PILE)!.cards.map((x) => x.id);
    tape.begin(t.seenBy("a"), 0);
    for (const [i, at] of [2000, 4000].entries()) {
      tape.push(at - 100, opsOf(t.act("a", { t: "grab", id: c.at(-1 - i)! }, at - 100)), t.seenBy("a"));
      tape.push(at, opsOf(t.act("a", { t: "drop", id: c.at(-1 - i)!, to: { ...felt, x: i } }, at)), t.seenBy("a"));
    }
    expect(tape.jump(5000, -1)?.t).toBe(4000);
    expect(tape.jump(anchor(tape.moments[1]!, 0), -1)?.t).toBe(2000);
    expect(tape.jump(anchor(tape.moments[0]!, 0), -1)).toBeNull();
    expect(tape.jump(0, 1)?.t).toBe(2000);
    expect(tape.jump(anchor(tape.moments[1]!, 0), 1)).toBeNull();
  });

  it("лента держит только заданное время: старое срезается, а нынешний момент собирается верно", () => {
    const t = table(), tape = new Tape(10_000, 2_000);
    const c = t.seenBy("a").piles.find((p) => p.id === MAIN_PILE)!.cards.map((x) => x.id);
    tape.begin(t.seenBy("a"), 0);
    for (let i = 0; i < 8; i++) {
      const at = 1000 + i * 3000, id = c.at(-1 - i)!;
      tape.push(at, opsOf(t.act("a", { t: "grab", id }, at)), t.seenBy("a"));
      tape.push(at + 100, opsOf(t.act("a", { t: "drop", id, to: { ...felt, x: i } }, at + 100)), t.seenBy("a"));
    }
    expect(tape.from).toBeGreaterThan(5000);
    expect(tape.moments.every((m) => m.t >= tape.from)).toBe(true);
    expect(tape.stateAt(tape.last).felt.length).toBe(8);
    expect(tape.stateAt(tape.from).felt.length).toBeLessThan(8);
  });

  it("поток пальцев: пишется только при изменении, берётся последний не позже времени", () => {
    const t = table(), tape = new Tape();
    tape.begin(t.seenBy("a"), 0);
    const carry = { id: "x", by: "b", over: felt, from: felt, card: { id: "x" } };
    const a = [carry], b = [{ ...carry, over: { ...felt, x: 5 } }];
    tape.flow(100, a, [], []);
    tape.flow(120, a, [], []);
    tape.flow(300, b, [], []);
    expect(tape.flowAt(50)).toBeNull();
    expect(tape.flowAt(200)!.carries).toEqual(a);
    expect(tape.flowAt(400)!.carries).toEqual(b);
  });

  it("стопку взяли за грип и отпустили — событие «несёт», с началом и концом", () => {
    const t = table(), tape = new Tape();
    tape.begin(t.seenBy("a"), 0);
    tape.push(1000, opsOf(t.act("a", { t: "grip", pile: MAIN_PILE }, 1000)), t.seenBy("a"));
    tape.push(3500, opsOf(t.act("a", { t: "release", id: MAIN_PILE }, 3500)), t.seenBy("a"));
    expect(tape.moments).toMatchObject([{ kind: "carry", by: "a", t0: 1000, t: 3500, ids: [MAIN_PILE] }]);
  });

  it("locate: где карта и какой она видна", () => {
    const t = table();
    const top = t.seenBy("a").piles.find((p) => p.id === MAIN_PILE)!.cards.at(-1)!.id;
    expect(locate(t.seenBy("a"), top)!.where).toMatchObject({ in: "deck", pile: MAIN_PILE });
    expect(locate(t.seenBy("a"), "нет")).toBeNull();
  });
});
