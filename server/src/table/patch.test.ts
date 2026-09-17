// РАЗБОР ПАТЧА — ОДИН НА ОБА КОНЦА. Сервер собирает им снимок зрителя, клиент — свою догадку о том,
// что сейчас произойдёт. Поэтому раскладка зоны живёт и здесь: карта, положенная своей рукой, обязана
// сразу знать своё место, иначе она на миг окажется в середине зоны и полетит оттуда.

import { describe, expect, it } from "vitest";
import { applyPatch } from "./patch.js";
import { DEFAULT_RULES, DEFAULT_SPOT, type Snapshot } from "./contract.js";

describe("зона раскладывает и в разборе патча — тем же методом, что и стол", () => {
  const ring = (cards: { id: string; at?: { x: number; y: number; angle: number } }[]): Snapshot => ({
    v: 1, people: [], chairs: [], felt: [], trails: {}, locks: {}, picks: {}, admin: null, dealer: null, rights: [], play: null,
    rules: DEFAULT_RULES,
    piles: [{ ...DEFAULT_SPOT, id: "круг", pose: "ring", x: 0, y: 0, cards, shuffles: 0 }],
  });

  it("КЛАДУТ БЕЗ МЕСТА — зона даёт места ВСЕМ: иначе карта на миг оказывается в середине зоны", () => {
    const was = ring([{ id: "a", at: { x: 0, y: -1.5, angle: 180 } }]);
    const now = applyPatch(was, { v: 2, ops: [{ t: "move", card: { id: "b" }, from: { in: "felt", x: 3, y: 3, up: false, angle: 0 }, to: { in: "deck", pile: "круг" } }] });
    const laid = now.piles[0]!.cards;
    expect(laid.map((c) => c.id)).toEqual(["a", "b"]);
    expect(laid.every((c) => c.at !== undefined), "место есть у каждой").toBe(true);
    expect(laid[1]!.at, "и оно не середина зоны").not.toEqual({ x: 0, y: 0, angle: 0 });
    expect(Math.hypot(laid[1]!.at!.x, laid[1]!.at!.y), "а настоящее место на кольце").toBeGreaterThan(1);
  });

  it("НАЗВАЛИ ТОЧНОЕ МЕСТО — кладут туда, и соседей не трогают", () => {
    const home = { x: 1.299, y: 0.75, angle: -60 };
    const was = ring([{ id: "a", at: { x: 0, y: -1.5, angle: 180 } }, { id: "c", at: { x: -1.299, y: 0.75, angle: 60 } }]);
    const now = applyPatch(was, { v: 2, ops: [{ t: "move", card: { id: "b" }, from: { in: "felt", x: 3, y: 3, up: false, angle: 0 }, to: { in: "deck", pile: "круг", at: home } }] });
    const laid = now.piles[0]!.cards;
    expect(laid.find((c) => c.id === "b")!.at).toEqual(home);
    expect(laid.find((c) => c.id === "a")!.at, "сосед не двинулся").toEqual({ x: 0, y: -1.5, angle: 180 });
    expect(laid.find((c) => c.id === "c")!.at, "и второй тоже").toEqual({ x: -1.299, y: 0.75, angle: 60 });
  });
});
