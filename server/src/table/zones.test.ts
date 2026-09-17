// ЗОНЫ И ПОЗЫ КАК ЗНАЧЕНИЯ — проверка 3б словами владельца: «завести пустую зону конфигом, увидеть
// её на столе, не тронув рантайм».
//
// Поэтому тест НИЧЕГО не импортирует из игр и не зовёт ни одной новой функции стола: он берёт
// правила песочницы, дописывает им зону и смотрит, что стол её завёл. Если однажды для новой зоны
// понадобится правка в `table.ts` — этот тест останется зелёным, а вот `rules.law.test.ts` поймает
// появившуюся ветку. Пара сторожей держит закон с двух сторон.

import { describe, expect, it } from "vitest";
import type { Face } from "./contract.js";
import { RING_CARDS, RING_HOME, RING_SPREAD, ringFace, ringPlace, ringSlots, ringSpot, ringSpread, ringStep, ringTurn } from "./ring.js";
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

  it("ПОТОЛОК МЕСТ: в полную зону карту не положить, а без потолка кладут сколько угодно", () => {
    const zoned = (most?: number): DeskRules => ({ ...SANDBOX, zones: [{ id: "круг", x: 0, y: 0, pose: "ring", ...(most === undefined ? {} : { most }) }] });
    const put = (rules: DeskRules) => {
      const t = new Table(cards.slice(), null, rules);
      t.join({ key: "я", name: "я", ink: "#fff", door: "guest" });
      const out: string[] = [];
      for (const id of ["a", "b"]) {
        t.act("я", { t: "grab", id }, 0);
        const drop = t.act("я", { t: "drop", id, to: { in: "deck", pile: "круг" } }, 0);
        out.push("refused" in drop ? drop.refused : "ok");
      }
      return out;
    };
    expect(put(zoned(1)), "одно место — вторая карта не лезет").toEqual(["ok", "full"]);
    expect(put(zoned()), "потолка нет — кладут обе").toEqual(["ok", "ok"]);
  });

  it("СЛЕД ПОМНИТ ИМЯ ЗОНЫ: карта из круга — «из круга хода», а не «из колоды»", () => {
    const rules: DeskRules = { ...SANDBOX, zones: [{ id: "круг", name: "Круг хода", x: 0, y: 0, pose: "ring" }] };
    const t = new Table(cards.slice(), null, rules);
    t.join({ key: "я", name: "я", ink: "#fff", door: "guest" });
    t.act("я", { t: "grab", id: "a" }, 0);
    t.act("я", { t: "drop", id: "a", to: { in: "deck", pile: "круг" } }, 0);
    t.act("я", { t: "grab", id: "a" }, 0);
    t.act("я", { t: "drop", id: "a", to: { in: "felt", x: 2, y: 2, up: true, angle: 0 } }, 0);
    expect(t.seenBy("я").trails.a).toMatchObject({ from: "deck", pile: "Круг хода" });
    // У колоды имени нет — и в следе его нет: она одна и зовётся колодой.
    t.act("я", { t: "grab", id: "b" }, 0);
    t.act("я", { t: "drop", id: "b", to: { in: "felt", x: 1, y: 1, up: true, angle: 0 } }, 0);
    expect(t.seenBy("я").trails.b!.pile).toBeUndefined();
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

  it("КАРТЫ ЛЕЖАТ ВНУТРИ ОЧЕРЧЕННОГО КРУГА, а не верхом на его линии", () => {
    expect(RING_CARDS, "круг карт уже контура на пол-карты").toBeLessThan(RING_SPREAD);
    expect(RING_CARDS + 1.4 / 2, "и дальний край карты ровно на контуре").toBeCloseTo(RING_SPREAD, 6);
  });

  it("одна карта стоит в начале круга — на полпути к контуру, а не у самой линии", () => {
    const one = ringSpot(at, 0, 1);
    expect(one.x).toBeCloseTo(0, 6);
    expect(one.y).toBeCloseTo(-RING_HOME, 6);
    expect(RING_HOME, "ближе контура, но не в самой середине").toBeGreaterThan(RING_CARDS / 2);
    expect(RING_HOME, "и внутри круга карт").toBeLessThan(RING_CARDS);
  });

  it("МЕСТА ДЕЛЯТ КРУГ ПОРОВНУ: три места — 120°, четыре — 90°", () => {
    expect(ringStep(3)).toBeCloseTo(120, 6);
    expect(ringStep(4)).toBeCloseTo(90, 6);
    expect(ringStep(6)).toBeCloseTo(60, 6);
  });

  it("МЕСТ НЕ МЕНЬШЕ ТРЁХ: одна и две карты стоят в том же круге, что и три", () => {
    for (const n of [0, 1, 2, 3]) expect(ringSlots({}, n), `${n} карт`).toBe(3);
    expect(ringSlots({}, 4), "четвёртая ужимает всех").toBe(4);
    // Партия скажет своё число мест — и оно перебьёт умолчание в обе стороны.
    expect(ringSlots({ least: 6 }, 2), "в партии шестерых круг держит шесть мест").toBe(6);
    expect(ringSlots({ least: 6, most: 6 }, 9), "и больше шести мест не бывает").toBe(6);
  });

  it("ПОКА МЕСТА НЕ ТЕСНЯТ — КРУГ ОДИН И ТОТ ЖЕ; стало тесно — карты отходят от середины", () => {
    for (const slots of [3, 4, 5, 6]) expect(ringSpread(slots), `${slots}`).toBeCloseTo(RING_HOME, 6);
    expect(ringSpread(8), "восьмерым уже тесно — отходят").toBeGreaterThan(RING_HOME);
    expect(ringSpread(9)).toBeGreaterThan(ringSpread(8));
    expect(ringSpread(40), "но дальше контура не уходят никогда").toBeCloseTo(RING_CARDS, 6);
  });

  it("карт больше, чем мест по окружности — шаг сжимается, периметр не растёт", () => {
    const many = 40;
    expect(ringStep(many)).toBeCloseTo(360 / many, 6);
    for (let i = 0; i < many; i += 1) {
      expect(Math.hypot(ringSpot(at, i, many).x, ringSpot(at, i, many).y), "все на том же круге").toBeCloseTo(RING_CARDS, 6);
    }
  });

  it("порядок хода — по часовой: первая наверху, следующая правее", () => {
    const [first, next] = [ringSpot(at, 0, 4), ringSpot(at, 1, 4)];
    expect(first!.y).toBeCloseTo(-RING_HOME, 6);
    expect(next!.x, "вторая правее первой").toBeGreaterThan(first!.x);
    expect(next!.y, "и чуть ниже").toBeGreaterThan(first!.y);
  });

  it("КАРТА СМОТРИТ ВЕРХОМ В СЕРЕДИНУ: поворот — это угол её места плюс полкруга", () => {
    expect(ringFace(0, 0, 4), "карта наверху круга стоит вверх ногами: её верх смотрит вниз, к центру").toBeCloseTo(180, 6);
    for (const i of [1, 2, 3]) expect(ringFace(0, i, 4)).toBeCloseTo(ringTurn(0, i, 4) + 180, 6);
  });

  it("каждая карта стоит на одном круге: расстояние до середины одно у всех", () => {
    for (const n of [1, 2, 3, 5, 8]) {
      for (let i = 0; i < n; i += 1) {
        const p = ringSpot({ x: 2, y: -1 }, i, n);
        expect(Math.hypot(p.x - 2, p.y + 1), `${i} из ${n}`).toBeCloseTo(ringSpread(n), 6);
      }
    }
  });

  it("угол зоны поворачивает всё кольцо целиком", () => {
    const turned = ringSpot({ x: 0, y: 0, angle: 90 }, 0, 4);
    expect(turned.x).toBeCloseTo(RING_HOME, 6);
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
    const было = ringPlace({ ...zone, least: 4 }, 1, 4);
    const стало = ringPlace({ ...zone, least: 4, taken: 1 }, 0, 3);
    expect(стало).toEqual(было);
  });

  it("положили ещё одну — прежние не поехали", () => {
    const было = ringPlace({ ...zone, least: 4 }, 0, 2);
    const стало = ringPlace({ ...zone, least: 4 }, 0, 3);
    expect(стало).toEqual(было);
  });

  it("мест не меньше, чем карт легло за круг", () => {
    // Мест объявлено два, а легло пять — кольцо расширяется, иначе карты сели бы друг на друга.
    const пять = [0, 1, 2, 3, 4].map((i) => ringPlace({ ...zone, least: 2 }, i, 5));
    expect(new Set(пять.map((p) => `${p.x.toFixed(4)},${p.y.toFixed(4)}`)).size).toBe(5);
  });
});
