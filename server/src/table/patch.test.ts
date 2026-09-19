// РАЗБОР ПАТЧА — ОДИН НА ОБА КОНЦА. Сервер собирает им снимок зрителя, клиент — свою догадку о том,
// что сейчас произойдёт. Поэтому закон круга живёт и здесь: место карты — это НОМЕР, и правило, по
// которому номера раздаются, обязано совпадать со столом до последнего случая.

import { describe, expect, it } from "vitest";
import { applyPatch } from "./patch.js";
import { DEFAULT_RULES, DEFAULT_SPOT, type Snapshot } from "./contract.js";
import { ringSlotTurn } from "./ring.js";

describe("зона раздаёт номера мест — и в разборе патча тем же правилом, что и стол", () => {
  const ring = (cards: { id: string; slot?: number }[], slots = cards.length, turn = 0): Snapshot => ({
    v: 1, people: [], chairs: [], felt: [], trails: {}, locks: {}, picks: {}, admin: null, dealer: null, rights: [], play: null,
    rules: DEFAULT_RULES,
    piles: [{ ...DEFAULT_SPOT, id: "круг", pose: "ring", x: 0, y: 0, turn, slots, cards, shuffles: 0 }],
  });
  const из = { in: "hand" as const, chair: "c1", i: 0 };
  const круг = (s: Snapshot) => s.piles[0]!;

  it("КЛАДУТ БЕЗ НОМЕРА — номера раздаются ВСЕМ заново, подряд от нуля", () => {
    const now = applyPatch(ring([{ id: "a", slot: 0 }]), { v: 2, ops: [{ t: "move", card: { id: "b" }, from: из, to: { in: "deck", pile: "круг" } }] });
    expect(круг(now).cards.map((c) => c.id)).toEqual(["a", "b"]);
    expect(круг(now).cards.map((c) => c.slot)).toEqual([0, 1]);
    expect(круг(now).slots, "мест теперь столько, сколько карт").toBe(2);
  });

  it("НАЗВАЛИ СВОБОДНЫЙ НОМЕР — садится на него, и соседей не трогают", () => {
    // Круг на три места, занято два: между ними дыра под номером 1.
    const was = ring([{ id: "a", slot: 0 }, { id: "c", slot: 2 }], 3);
    const now = applyPatch(was, { v: 2, ops: [{ t: "move", card: { id: "b" }, from: из, to: { in: "deck", pile: "круг", slot: 1 } }] });
    expect(круг(now).cards.map((c) => c.id), "встала между ними").toEqual(["a", "b", "c"]);
    expect(круг(now).cards.map((c) => c.slot), "а соседи при своих номерах").toEqual([0, 1, 2]);
    expect(круг(now).slots, "мест не прибавилось: место уже было").toBe(3);
  });

  it("КАРТА ИЗ КРУГА ВЕРНУЛАСЬ МИМО ВСЕГО — на свой же номер, и НИКТО не двигается", () => {
    // Так это и приходит от догадки: в `move` номера у карты нет, он остался лежать в зоне.
    const was = ring([{ id: "в", slot: 0 }, { id: "д", slot: 1 }, { id: "к", slot: 2 }]);
    const now = applyPatch(was, { v: 2, ops: [{ t: "move", card: { id: "д" }, from: { in: "deck", pile: "круг" }, to: { in: "deck", pile: "круг" } }] });
    expect(круг(now).cards.map((c) => c.id)).toEqual(["в", "д", "к"]);
    expect(круг(now).cards.map((c) => c.slot), "номера прежние у всех").toEqual([0, 1, 2]);
  });

  it("НАЗВАН ПОРЯДОК — КРУГ ПЕРЕКЛАДЫВАЕТСЯ, даже если номер у карты уже есть", () => {
    // Оставить карту с её прежним номером здесь нельзя: круг оказался бы наполовину в старой позе,
    // наполовину в новой, пока не придёт ответ стола. Так выглядел баг с двойным движением.
    const was = ring([{ id: "к0", slot: 0 }, { id: "к1", slot: 1 }, { id: "к2", slot: 2 }, { id: "к3", slot: 3 }]);
    const now = applyPatch(was, { v: 2, ops: [{ t: "move", card: { id: "новая", slot: 9 }, from: из, to: { in: "deck", pile: "круг", i: 2 } }] });
    expect(круг(now).cards.map((c) => c.id)).toEqual(["к0", "к1", "новая", "к2", "к3"]);
    expect(круг(now).cards.map((c) => c.slot), "номера розданы заново").toEqual([0, 1, 2, 3, 4]);
    expect(круг(now).slots).toBe(5);
  });

  it("УШЛА ИЗ ЗОНЫ — НОМЕР ЗАБЫТ: вернётся, получит новый", () => {
    const was = ring([{ id: "a", slot: 0 }]);
    const now = applyPatch(was, { v: 2, ops: [{ t: "move", card: { id: "a" }, from: { in: "deck", pile: "круг" }, to: { in: "felt", x: 4, y: 4, up: true, angle: 0 } }] });
    expect(now.felt[0]!.slot, "на сукне номера зоны нет").toBeUndefined();
  });

  it("УНЕСЛИ ГОЛОВУ — якорь шагает на новую, номера не трогаются", () => {
    const was = ring([{ id: "a", slot: 0 }, { id: "b", slot: 1 }, { id: "c", slot: 2 }], 3, 0);
    const now = applyPatch(was, { v: 2, ops: [{ t: "move", card: { id: "a" }, from: { in: "deck", pile: "круг" }, to: { in: "felt", x: 4, y: 4, up: true, angle: 0 } }] });
    expect(круг(now).cards.map((c) => c.slot), "оставшиеся при своих номерах").toEqual([1, 2]);
    expect(круг(now).turn, "а якорь встал на место новой головы").toBeCloseTo(ringSlotTurn(3, 0, 1), 4);
  });
});
