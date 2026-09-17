// ЗОНЫ И ПОЗЫ КАК ЗНАЧЕНИЯ — проверка 3б словами владельца: «завести пустую зону конфигом, увидеть
// её на столе, не тронув рантайм».
//
// Поэтому тест НИЧЕГО не импортирует из игр и не зовёт ни одной новой функции стола: он берёт
// правила песочницы, дописывает им зону и смотрит, что стол её завёл. Если однажды для новой зоны
// понадобится правка в `table.ts` — этот тест останется зелёным, а вот `rules.law.test.ts` поймает
// появившуюся ветку. Пара сторожей держит закон с двух сторон.

import { describe, expect, it } from "vitest";
import type { Face } from "./contract.js";
import { RING_SPREAD, ringPlace, ringSpot } from "./ring.js";
import { SANDBOX, type DeskRules } from "./rules.js";
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

describe("поза «по кругу» — общая правда, а не картинка", () => {
  const at = { x: 0, y: 0 };

  it("одна карта стоит в начале круга, а не в середине зоны", () => {
    const one = ringSpot(at, 0, 1);
    expect(one.x).toBeCloseTo(0, 6);
    expect(one.y).toBeCloseTo(-RING_SPREAD, 6);
  });

  it("четыре карты стоят крестом, по порядку хода — по часовой", () => {
    const four = [0, 1, 2, 3].map((i) => ringSpot(at, i, 4));
    expect(four.map((p) => [Math.round(p.x * 100) / 100 || 0, Math.round(p.y * 100) / 100 || 0])).toEqual([
      [0, -RING_SPREAD],
      [RING_SPREAD, 0],
      [0, RING_SPREAD],
      [-RING_SPREAD, 0],
    ]);
  });

  it("каждая карта стоит НА кольце: расстояние до середины одно у всех", () => {
    for (const n of [1, 2, 3, 5, 8]) {
      for (let i = 0; i < n; i += 1) {
        const p = ringSpot({ x: 2, y: -1 }, i, n);
        expect(Math.hypot(p.x - 2, p.y + 1), `${i} из ${n}`).toBeCloseTo(RING_SPREAD, 6);
      }
    }
  });

  it("угол зоны поворачивает всё кольцо целиком", () => {
    const turned = ringSpot({ x: 0, y: 0, angle: 90 }, 0, 4);
    expect(turned.x).toBeCloseTo(RING_SPREAD, 6);
    expect(turned.y).toBeCloseTo(0, 6);
  });
});

describe("место карты в кольце помнит снятых снизу", () => {
  const zone = { x: 0, y: 0 };

  it("никого не снимали — место совпадает с номером в стопке", () => {
    expect(ringPlace(zone, 0, 4)).toEqual(ringSpot(zone, 0, 4));
    expect(ringPlace(zone, 2, 4)).toEqual(ringSpot(zone, 2, 4));
  });

  it("сняли нижнюю — ОСТАВШИЕСЯ СТОЯТ НА МЕСТЕ, а не съезжают на одно", () => {
    // Лежало четверо, сняли нижнюю: бывшая вторая обязана остаться там, где была.
    const было = ringPlace({ ...zone, seats: 4 }, 1, 4);
    const стало = ringPlace({ ...zone, seats: 4, taken: 1 }, 0, 3);
    expect(стало).toEqual(было);
  });

  it("положили ещё одну — прежние не поехали", () => {
    const было = ringPlace({ ...zone, seats: 4 }, 0, 2);
    const стало = ringPlace({ ...zone, seats: 4 }, 0, 3);
    expect(стало).toEqual(было);
  });

  it("мест не меньше, чем карт легло за круг", () => {
    // Мест объявлено два, а легло пять — кольцо расширяется, иначе карты сели бы друг на друга.
    const пять = [0, 1, 2, 3, 4].map((i) => ringPlace({ ...zone, seats: 2 }, i, 5));
    expect(new Set(пять.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`)).size).toBe(5);
  });
});
