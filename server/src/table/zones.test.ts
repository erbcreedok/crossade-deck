// ЗОНЫ И ПОЗЫ КАК ЗНАЧЕНИЯ — проверка 3б словами владельца: «завести пустую зону конфигом, увидеть
// её на столе, не тронув рантайм».
//
// Поэтому тест НИЧЕГО не импортирует из игр и не зовёт ни одной новой функции стола: он берёт
// правила песочницы, дописывает им зону и смотрит, что стол её завёл. Если однажды для новой зоны
// понадобится правка в `table.ts` — этот тест останется зелёным, а вот `rules.law.test.ts` поймает
// появившуюся ветку. Пара сторожей держит закон с двух сторон.

import { describe, expect, it } from "vitest";
import type { Face } from "./contract.js";
import { RING_CARDS, RING_LAY, RING_SPREAD } from "./ring.js";
import { SANDBOX, type DeskRules } from "./rules.js";
import { seatPoint } from "./ring.js";
import { Table } from "./table.js";

const cards: { id: string; face: Face }[] = [
  { id: "a", face: { suit: "s", rank: "6" } },
  { id: "b", face: { suit: "h", rank: "7" } },
];

describe("зона заводится конфигом, а не кодом", () => {
  it("песочница приносит только колоду", () => {
    const seen = new Table(cards.slice()).seenBy("кто-то");
    expect(seen.piles.map((p) => p.id)).toEqual(["deck"]);
  });

  it("дописанная в правила зона появляется на сукне пустой и на своём месте", () => {
    const rules: DeskRules = { ...SANDBOX, zones: [{ id: "круг", x: 1.5, y: -2, pose: "ring", angle: 30 }] };
    const seen = new Table(cards.slice(), null, rules).seenBy("кто-то");
    const zone = seen.piles.find((p) => p.id === "круг");
    expect(zone, "зона из конфига должна стоять на столе").toBeDefined();
    expect(zone!.cards).toEqual([]);
    expect({ x: zone!.x, y: zone!.y, angle: zone!.angle, pose: zone!.pose }).toEqual({ x: 1.5, y: -2, angle: 30, pose: "ring" });
  });

  it("зона рода стола стоит всегда, даже опустев, — в отличие от собранной руками стопки", () => {
    const rules: DeskRules = { ...SANDBOX, zones: [{ id: "круг", x: 0, y: 0, pose: "ring" }] };
    const seen = new Table(cards.slice(), null, rules).seenBy("кто-то");
    expect(seen.piles.find((p) => p.id === "круг")!.forever).toBe(true);
  });

  it("замки зоны берутся из конфига", () => {
    const rules: DeskRules = { ...SANDBOX, zones: [{ id: "сброс", x: 0, y: 3, pose: "stack", shut: true, pin: true }] };
    const zone = new Table(cards.slice(), null, rules).seenBy("кто-то").piles.find((p) => p.id === "сброс")!;
    expect({ shut: zone.shut, pin: zone.pin, seal: zone.seal, lock: zone.lock }).toEqual({ shut: true, pin: true, seal: false, lock: false });
  });

  it("две зоны — две строки в конфиге и ни одной правки в столе", () => {
    const rules: DeskRules = {
      ...SANDBOX,
      zones: [
        { id: "круг", x: 0, y: 0, pose: "ring" },
        { id: "сброс", x: 4, y: 0, pose: "stack" },
      ],
    };
    const seen = new Table(cards.slice(), null, rules).seenBy("кто-то");
    expect(seen.piles.map((p) => p.id).sort()).toEqual(["deck", "круг", "сброс"]);
  });

});

describe("круг хода: карты лежат внутри очерченного поля", () => {
  it("круг карт уже контура ровно на пол-карты: дальний край карты лежит на контуре, а не за ним", () => {
    expect(RING_CARDS).toBeLessThan(RING_SPREAD);
    expect(RING_CARDS + 1.4 / 2).toBeCloseTo(RING_SPREAD, 6);
    expect(RING_LAY).toBe(RING_CARDS);
  });
});

describe("зона — часть стола, а не вещь на нём", () => {
  // Закон владельца: круг хода виден ВСЕГДА. За его ручку тащится новая стопка из его карт, а не
  // само очерченное место, и высыпанная зона остаётся пустой там, где очерчена.
  const withZone = () => {
    const rules: DeskRules = { ...SANDBOX, zones: [{ id: "круг", x: 0, y: 0, pose: "ring" }] };
    const table = new Table(cards.slice(), "я", rules);
    table.join({ key: "я", name: "Я", ink: "#fff", door: "guest" });
    return table;
  };

  /** Положить обе карты в зону — тем же намерением, каким это делает палец. */
  const fill = (table: Table) => {
    for (const id of ["a", "b"]) {
      table.act("я", { t: "grab", id }, 0);
      table.act("я", { t: "drop", id, to: { in: "deck", pile: "круг" } }, 0);
    }
  };

  it("зона остаётся на столе, когда её карты унесли целиком", () => {
    const table = withZone();
    fill(table);
    expect(table.seenBy("я").piles.find((p) => p.id === "круг")?.cards).toHaveLength(2);

    table.act("я", { t: "pileDrop", pile: "круг", to: { in: "deck", pile: "deck" } }, 0);

    const zone = table.seenBy("я").piles.find((p) => p.id === "круг");
    expect(zone, "высыпанная зона обязана остаться на столе").toBeDefined();
    expect(zone!.cards).toHaveLength(0);
    expect(zone!.zone).toBe(true);
  });

  it("вечность зоны не снимается переносом", () => {
    const table = withZone();
    fill(table);
    table.act("я", { t: "pileDrop", pile: "круг", to: { in: "deck", pile: "deck" } }, 0);
    expect(table.seenBy("я").piles.find((p) => p.id === "круг")?.forever).toBe(true);
  });

  it("карты при этом и правда уехали в колоду", () => {
    const table = withZone();
    fill(table);
    table.act("я", { t: "pileDrop", pile: "круг", to: { in: "deck", pile: "deck" } }, 0);
    expect(table.seenBy("я").piles.find((p) => p.id === "deck")?.cards).toHaveLength(2);
  });

  it("обычная вечная стопка, перенесённая целиком, со стола уходит", () => {
    // Правило про вечность остаётся в силе — оно не про зоны.
    const table = new Table(cards.slice(), "я");
    table.join({ key: "я", name: "Я", ink: "#fff", door: "guest" });
    expect(table.seenBy("я").piles.find((p) => p.id === "deck")).toBeDefined();
  });
});

describe("под стул стопку не прячут", () => {
  // Жалоба владельца: высыпал круг у своего места — стопка легла ПОД стул и пропала с глаз. Стол
  // молчал, будто всё вышло. Отказ честнее пропажи.
  const seated = () => {
    const rules: DeskRules = { ...SANDBOX, zones: [{ id: "круг", x: 0, y: 0, pose: "ring" }] };
    const table = new Table(cards.slice(), "я", rules);
    table.join({ key: "я", name: "Я", ink: "#fff", door: "guest" });
    for (const id of ["a", "b"]) {
      table.act("я", { t: "grab", id }, 0);
      table.act("я", { t: "drop", id, to: { in: "deck", pile: "круг" } }, 0);
    }
    const seat = table.seenBy("я").chairs.find((c) => c.owner === "я")!;
    return { table, at: seatPoint(seat.angle) };
  };

  it("стопку не поставить на занятое место", () => {
    const { table, at } = seated();
    const out = table.act("я", { t: "deckMove", pile: "круг", x: at.x, y: at.y, angle: 0 }, 0);
    expect(out).toEqual({ refused: "full" });
  });

  it("и рядом с ним, под самой аркой, — тоже", () => {
    const { table, at } = seated();
    const near = { x: at.x * 0.9, y: at.y * 0.9 };
    expect(table.act("я", { t: "deckMove", pile: "круг", x: near.x, y: near.y, angle: 0 }, 0)).toEqual({ refused: "full" });
  });

  it("карты при отказе остаются в круге, а не пропадают", () => {
    const { table, at } = seated();
    table.act("я", { t: "deckMove", pile: "круг", x: at.x, y: at.y, angle: 0 }, 0);
    expect(table.seenBy("я").piles.find((p) => p.id === "круг")?.cards).toHaveLength(2);
  });

  it("а на свободное сукно — сколько угодно", () => {
    const { table } = seated();
    const out = table.act("я", { t: "deckMove", pile: "круг", x: 3, y: -3, angle: 0 }, 0);
    expect(out).not.toHaveProperty("refused");
  });
});
