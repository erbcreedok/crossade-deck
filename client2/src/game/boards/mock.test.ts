import { describe, expect, it } from "vitest";
import { at } from "../slotfield/slotField";
import { applyCommand, bootState, dealOrder } from "./mock";
import { handOf, initialState, OFFBOARD_KEY } from "./state";
import { slotKey, type BoardSpec } from "./spec";

// Смарт-мок борды — редьюсер без правил игры: политики зон (merge/swap/capture/reject),
// раздача «поровну, дилеру последним», круг хода. Rng — детерминированный.

const rng = () => 0.5;

/** Мини-борда для тестов: колода-пил, грид 2×2 с capture, цепочка. */
function testSpec(over: Partial<BoardSpec> = {}): BoardSpec {
  return {
    id: "test",
    title: "Тест",
    elements: [
      { kind: "card", id: "c1", face: "6♠" },
      { kind: "card", id: "c2", face: "7♠" },
      { kind: "card", id: "c3", face: "8♠" },
      { kind: "card", id: "c4", face: "9♠" },
      { kind: "card", id: "c5", face: "10♠" },
    ],
    zones: [
      { id: "deck", title: "колода", layout: { kind: "pile" }, policy: { onOccupied: "merge" },
        setup: { 0: ["c1", "c2", "c3", "c4", "c5"] } },
      { id: "grid", title: "поле", layout: { kind: "grid", cols: 2, rows: 2 }, policy: { onOccupied: "capture" } },
      { id: "chain", title: "цепочка", layout: { kind: "chain" }, policy: { onOccupied: "merge" } },
    ],
    seats: { count: { min: 2, max: 4 }, show: "backs", swap: true },
    hand: { reorder: true },
    actions: [],
    ...over,
  };
}

describe("initialState / bootState", () => {
  it("setup селит элементы по слотам; неизвестный id в setup — ошибка данных сразу", () => {
    const s = initialState(testSpec());
    expect(at(s.field, slotKey("deck", 0))?.members).toEqual(["c1", "c2", "c3", "c4", "c5"]);
    expect(() => initialState(testSpec({ zones: [{ id: "z", title: "z", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: ["nope"] } }] }))).toThrow(/nope/);
  });

  it("bootState выполняет мок-раздачу спеки", () => {
    const s = bootState(testSpec({ mock: { deal: { from: "deck", each: 2 } } }), 2);
    expect(handOf(s, "p1").length).toBe(2);
    expect(handOf(s, "p2").length).toBe(2);
    expect(at(s.field, slotKey("deck", 0))?.members.length).toBe(1);
  });
});

describe("deal «all-even-dealer-last»", () => {
  it("круг начинается со следующего за дилером, дилеру достаётся меньше при нехватке", () => {
    expect(dealOrder(["p1", "p2", "p3"], "p1")).toEqual(["p2", "p3", "p1"]);
    // 5 карт на троих: p2 и p3 по 2, дилер p1 — 1.
    const s = applyCommand(testSpec(), initialState(testSpec(), 3), { t: "deal", from: "deck", each: "all-even-dealer-last" }, rng);
    expect(handOf(s, "p2").length).toBe(2);
    expect(handOf(s, "p3").length).toBe(2);
    expect(handOf(s, "p1").length).toBe(1);
    expect(at(s.field, slotKey("deck", 0))?.members ?? []).toEqual([]);
  });
});

describe("move и политики зон", () => {
  const spec = testSpec();

  function withCardsAt(keys: Record<string, string[]>) {
    let s = initialState(spec, 2);
    for (const [key, els] of Object.entries(keys)) {
      for (const el of els) s = applyCommand(spec, s, { t: "move", el, from: slotKey("deck", 0), to: key }, rng);
    }
    return s;
  }

  it("в пустой слот — просто переезд; merge кладёт поверх", () => {
    const s = withCardsAt({ "chain:0": ["c5", "c4"] });
    expect(at(s.field, "chain:0")?.members).toEqual(["c5", "c4"]);
  });

  it("capture: жертва уезжает за борт, новичок занимает клетку", () => {
    const s0 = withCardsAt({ "grid:r0c0": ["c5"] });
    const s = applyCommand(spec, s0, { t: "move", el: "c4", from: slotKey("deck", 0), to: "grid:r0c0" }, rng);
    expect(at(s.field, "grid:r0c0")?.members).toEqual(["c4"]);
    expect(at(s.field, OFFBOARD_KEY)?.members).toEqual(["c5"]);
  });

  it("swap меняет местами; reject и полный maxSize оставляют всё как было", () => {
    const swapSpec = testSpec({ zones: [
      { id: "deck", title: "к", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: ["c1", "c2"] } },
      { id: "g", title: "g", layout: { kind: "grid", cols: 1, rows: 2 }, policy: { onOccupied: "swap" } },
    ] });
    let s = initialState(swapSpec, 2);
    s = applyCommand(swapSpec, s, { t: "move", el: "c2", from: "deck:0", to: "g:r0c0" }, rng);
    s = applyCommand(swapSpec, s, { t: "move", el: "c1", from: "deck:0", to: "g:r0c0" }, rng);
    expect(at(s.field, "g:r0c0")?.members).toEqual(["c1"]);
    expect(at(s.field, "deck:0")?.members).toEqual(["c2"]);

    const cap = testSpec({ zones: [
      { id: "deck", title: "к", layout: { kind: "pile" }, policy: { onOccupied: "merge" }, setup: { 0: ["c1", "c2", "c3"] } },
      { id: "p", title: "p", layout: { kind: "pile" }, policy: { onOccupied: "merge", maxSize: 1 } },
    ] });
    let c = initialState(cap, 2);
    c = applyCommand(cap, c, { t: "move", el: "c3", from: "deck:0", to: "p:0" }, rng);
    const before = c;
    c = applyCommand(cap, c, { t: "move", el: "c2", from: "deck:0", to: "p:0" }, rng);
    expect(c).toEqual(before); // полный слот отказал
  });
});

describe("круг хода, кубики, места", () => {
  const spec = testSpec({ mock: { dice: 2 } });

  it("turn идёт по кругу с учётом направления; reverse разворачивает", () => {
    let s = initialState(spec, 3);
    s = applyCommand(spec, s, { t: "turn" }, rng);
    expect(s.turn.at).toBe(1);
    s = applyCommand(spec, s, { t: "reverse" }, rng);
    s = applyCommand(spec, s, { t: "turn" }, rng);
    expect(s.turn.at).toBe(0);
    s = applyCommand(spec, s, { t: "turn" }, rng);
    expect(s.turn.at).toBe(2); // через ноль назад
  });

  it("roll кладёт mock.dice кубиков 1..6", () => {
    const s = applyCommand(spec, initialState(spec, 2), { t: "roll" }, rng);
    expect(s.dice).toEqual([4, 4]);
  });

  it("sit занимает только свободный стул; stand освобождает", () => {
    let s = initialState(spec, 2);
    s = applyCommand(spec, s, { t: "stand", who: "Игрок 2" }, rng);
    expect(s.seats[1]!.occupant).toBeNull();
    s = applyCommand(spec, s, { t: "sit", who: "красная панда", seat: "p2" }, rng);
    expect(s.seats[1]!.occupant).toBe("красная панда");
    const again = applyCommand(spec, s, { t: "sit", who: "жёлтый верблюд", seat: "p2" }, rng);
    expect(again.seats[1]!.occupant).toBe("красная панда"); // занятый стул не отдаётся
  });

  it("reset возвращает к setup + мок-раздаче, не трогая рассадку", () => {
    const withDeal = testSpec({ mock: { deal: { from: "deck", each: 1 } } });
    let s = bootState(withDeal, 2);
    s = applyCommand(withDeal, s, { t: "stand", who: "Игрок 2" }, rng);
    s = applyCommand(withDeal, s, { t: "move", el: handOf(s, "p1")[0]!, from: "hand:p1", to: "chain:0" }, rng);
    const r = applyCommand(withDeal, s, { t: "reset" }, rng);
    expect(handOf(r, "p1").length).toBe(1);
    expect(at(r.field, "chain:0")?.members ?? []).toEqual([]);
    expect(r.seats[1]!.occupant).toBeNull(); // рассадка пережила reset
  });
});
