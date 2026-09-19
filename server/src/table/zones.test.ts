// ЗОНЫ И ПОЗЫ КАК ЗНАЧЕНИЯ — проверка 3б словами владельца: «завести пустую зону конфигом, увидеть
// её на столе, не тронув рантайм».
//
// Поэтому тест НИЧЕГО не импортирует из игр и не зовёт ни одной новой функции стола: он берёт
// правила песочницы, дописывает им зону и смотрит, что стол её завёл. Если однажды для новой зоны
// понадобится правка в `table.ts` — этот тест останется зелёным, а вот `rules.law.test.ts` поймает
// появившуюся ветку. Пара сторожей держит закон с двух сторон.

import { describe, expect, it } from "vitest";
import type { Face } from "./contract.js";
import { RING_ARROW, ringCardHalf, RING_CARDS, ringFree, ringGap, RING_HOME, ringSlot, RING_SPREAD, ringArrow, ringLay, ringStep } from "./ring.js";
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

describe("раскладка круга — метод, а не формула", () => {
  const mid = { x: 0, y: 0 };

  it("КАРТЫ ЛЕЖАТ ВНУТРИ ОЧЕРЧЕННОГО КРУГА, а не верхом на его линии", () => {
    expect(RING_CARDS, "круг карт уже контура на пол-карты").toBeLessThan(RING_SPREAD);
    expect(RING_CARDS + 1.4 / 2, "и дальний край карты ровно на контуре").toBeCloseTo(RING_SPREAD, 6);
    expect(RING_HOME, "а лежат они ближе контура, не в самой середине").toBeGreaterThan(RING_CARDS / 2);
    expect(RING_HOME).toBeLessThan(RING_CARDS);
  });

  it("МЕСТ НЕ МЕНЬШЕ ТРЁХ: одна карта стоит в круге на три, а не сама по себе", () => {
    const one = ringLay(mid, 1);
    expect(one).toHaveLength(1);
    expect(one[0]!.x).toBeCloseTo(0, 6);
    expect(one[0]!.y).toBeCloseTo(-RING_HOME, 6);
    // Вторая встанет через шаг круга на три места, а не вплотную: круг читается как круг с первой же карты.
    const two = ringLay(mid, 2);
    expect(Math.atan2(two[1]!.x, -two[1]!.y) * 180 / Math.PI).toBeCloseTo(ringStep(3), 4);
  });

  it("КАРТЫ ДЕЛЯТ ВСЁ, КРОМЕ ДОЛИ СТРЕЛКИ, а карта смотрит верхом в середину", () => {
    const four = ringLay(mid, 4);
    const turn = (p: { x: number; y: number }) => ((Math.atan2(p.x, -p.y) * 180 / Math.PI) + 360) % 360;
    const step = ringStep(4);
    expect(four.map(turn)).toEqual([0, step, step * 2, step * 3].map((a) => expect.closeTo(a, 4)));
    expect(360 - turn(four[3]!), "а разрыв — это доля стрелки плюс целый шаг").toBeCloseTo(ringGap(4), 4);
    // Поворот держится в тех же пределах, что и у всех карт стола: (−180, 180].
    const same = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180) < 0.001;
    for (const [i, one] of four.entries()) expect(same(one.angle, turn(one) + 180), `${i}`).toBe(true);
  });

  it("ОСТАТОК ДЕЛИТСЯ НА КАРТЫ, а не на промежутки между ними", () => {
    // Деление на промежутки растягивает карты на весь круг: при трёх картах шаг вышел бы (360−доля)/2,
    // разрыв съёжился бы до одной доли, и ХВОСТ прилип бы к стрелке.
    for (const n of [3, 4, 10]) expect(ringStep(n), `${n}`).toBeCloseTo((360 - RING_ARROW) / n, 6);
  });

  it("СТРЕЛКА СТОИТ ЗА ХВОСТОМ: она показывает КОНЕЦ круга, а не начало", () => {
    const turn = (p: { x: number; y: number }) => ((Math.atan2(p.x, -p.y) * 180 / Math.PI) + 360) % 360;
    for (const n of [1, 3, 4, 10]) {
      const cards = ringLay(mid, n);
      const tail = turn(cards.at(-1)!);
      const arrow = ringArrow(mid, n, tail);
      const half = ringCardHalf(Math.hypot(arrow.x, arrow.y));
      // Сразу за краем последней карты — полкарты от её середины плюс полдоли стрелки.
      expect(((turn(arrow) - tail) + 360) % 360, `${n}: стрелка за хвостом`).toBeCloseTo(half + RING_ARROW / 2, 3);
      expect(Math.hypot(arrow.x, arrow.y), `${n}: тот же радиус, что у карт`).toBeCloseTo(Math.hypot(cards[0]!.x, cards[0]!.y), 6);
      // И до ГОЛОВЫ ей ещё далеко: разрыв шире доли на целый шаг, стрелка занимает лишь его начало.
      const toHead = ((turn(cards[0]!) - turn(arrow)) + 360) % 360;
      expect(toHead, `${n}: между стрелкой и головой есть место`).toBeGreaterThan(RING_ARROW / 2);
    }
  });

  it("ДОЛЯ СТРЕЛКИ ПОСТОЯННА: сколько бы карт ни легло, её градусы не делятся", () => {
    const turn = (p: { x: number; y: number }) => ((Math.atan2(p.x, -p.y) * 180 / Math.PI) + 360) % 360;
    for (const n of [4, 10, 24]) {
      const cards = ringLay(mid, n);
      expect(360 - turn(cards.at(-1)!) - ringStep(n), `${n} карт`).toBeCloseTo(RING_ARROW, 3);
    }
  });

  it("СТАЛО ТЕСНО — КРУГ РАЗДВИГАЕТСЯ НАРУЖУ, но не дальше контура", () => {
    const away = (n: number) => Math.hypot(ringLay(mid, n)[0]!.x, ringLay(mid, n)[0]!.y);
    for (const n of [1, 3, 4, 6]) expect(away(n), `${n}`).toBeCloseTo(RING_HOME, 6);
    expect(away(8), "восьмерым уже тесно").toBeGreaterThan(RING_HOME);
    expect(away(9)).toBeGreaterThan(away(8));
    expect(away(40), "но дальше контура — никогда").toBeCloseTo(RING_CARDS, 6);
  });

  it("ДЫРЫ — ЭТО СВОБОДНЫЕ НОМЕРА, и считаются вычитанием, а не по промежуткам", () => {
    // Забрали КАЖДУЮ ВТОРУЮ карту: по промежуткам такой круг выглядит просто разрежённым, и старое
    // «выведем шаг из углов» не нашло бы ни одной дыры. По номерам их ровно три.
    expect(ringFree(6, [0, 2, 4])).toEqual([1, 3, 5]);
    expect(ringFree(6, [0, 1, 2, 3, 4, 5]), "полный круг дыр не имеет").toEqual([]);
    expect(ringFree(6, []), "пустой круг — все места свободны").toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("МЕСТО С НОМЕРОМ — ОДНА ФУНКЦИЯ НА ВСЕХ: раскладка подряд это просто её вызовы", () => {
    const подряд = ringLay(mid, 5, 30);
    for (const [i, one] of подряд.entries()) expect(ringSlot(mid, 5, 30, i)).toEqual(one);
  });

  it("ЯКОРЬ — УГОЛ СТРЕЛКИ: круг не проворачивается целиком от каждого перекладывания", () => {
    const turned = ringLay(mid, 4, 90);
    expect(turned[0]!.x).toBeCloseTo(RING_HOME, 6);
    expect(turned[0]!.y).toBeCloseTo(0, 6);
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
