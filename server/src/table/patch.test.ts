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
  it("КАРТА ИЗ ЗОНЫ ВЕРНУЛАСЬ МИМО ВСЕГО — садится на своё место, и НИКТО не двигается", () => {
    // Так это и приходит от оптимистичной догадки: в `move` у карты своего места нет, оно осталось
    // лежать в зоне. Забыть его — значит счесть карту новой и переложить всю зону на шаг.
    const places = [
      { id: "в", at: { x: 0, y: -1.5, angle: 180 } },
      { id: "д", at: { x: 1.299, y: 0.75, angle: -60 } },
      { id: "к", at: { x: -1.299, y: 0.75, angle: 60 } },
    ];
    const was = ring(places.map((one) => ({ ...one, at: { ...one.at } })));
    const now = applyPatch(was, { v: 2, ops: [{ t: "move", card: { id: "д" }, from: { in: "deck", pile: "круг" }, to: { in: "deck", pile: "круг" } }] });
    const laid = now.piles[0]!.cards;
    for (const one of places) expect(laid.find((c) => c.id === one.id)!.at, `${one.id} на своём месте`).toEqual(one.at);
  });

  it("А ПОБЫВАВШАЯ В РУКЕ СВОЁ МЕСТО ЗАБЫВАЕТ: вернётся — получит новое", () => {
    const was = ring([{ id: "a", at: { x: 0, y: -1.5, angle: 180 } }]);
    const mid = applyPatch(was, { v: 2, ops: [{ t: "move", card: { id: "a" }, from: { in: "deck", pile: "круг" }, to: { in: "felt", x: 4, y: 4, up: true, angle: 0 } }] });
    expect(mid.felt[0]!.at, "на сукне места зоны нет").toBeUndefined();
  });
  it("ЯКОРЬ — СТРЕЛКА ЗОНЫ, а не первая карта: догадка раскладывает круг тем же углом, что и стол", () => {
    // Круг повёрнут: якорь на 90°, карты стоят от него. Возьми догадка углом первой карты — совпало бы
    // случайно; возьми нулём — круг провернулся бы весь. Проверяем, что взят именно якорь зоны.
    const was: Snapshot = { ...ring([{ id: "a", at: { x: 1.5, y: 0, angle: -90 } }]), piles: [] };
    was.piles = [{ ...DEFAULT_SPOT, id: "круг", pose: "ring", x: 0, y: 0, turn: 90, cards: [{ id: "a", at: { x: 1.5, y: 0, angle: -90 } }], shuffles: 0 }];
    const now = applyPatch(was, { v: 2, ops: [{ t: "move", card: { id: "b" }, from: { in: "felt", x: 3, y: 3, up: false, angle: 0 }, to: { in: "deck", pile: "круг" } }] });
    const laid = now.piles[0]!.cards;
    expect(laid[0]!.at!.x, "голова осталась на якоре").toBeCloseTo(1.5, 4);
    expect(laid[0]!.at!.y).toBeCloseTo(0, 4);
    const turn = (p: { x: number; y: number }) => ((Math.atan2(p.x, -p.y) * 180) / Math.PI + 360) % 360;
    expect(turn(laid[1]!.at!), "вторая — на шаг от якоря").toBeCloseTo(90 + (360 - 36) / 3, 3);
  });

  it("УНЕСЛИ ГОЛОВУ — догадка двигает стрелку, а не карты", () => {
    const places = [
      { id: "a", at: { x: 0, y: -1.5, angle: 180 } },
      { id: "b", at: { x: 1.299, y: 0.75, angle: -60 } },
      { id: "c", at: { x: -1.299, y: 0.75, angle: 60 } },
    ];
    const was = ring(places.map((one) => ({ ...one, at: { ...one.at } })));
    was.piles[0]!.turn = 0;
    const now = applyPatch(was, { v: 2, ops: [{ t: "move", card: { id: "a" }, from: { in: "deck", pile: "круг" }, to: { in: "felt", x: 4, y: 4, up: true, angle: 0 } }] });
    const pile = now.piles[0]!;
    expect(pile.cards.map((c) => c.at), "оставшиеся не шелохнулись").toEqual([places[1]!.at, places[2]!.at]);
    expect(pile.turn, "стрелка встала на новую голову").toBeCloseTo(120, 2);
  });
});
