// КРУГ ХОДА КАК МЕСТО НА СУКНЕ: его не сдвинуть, его карты уносятся грипом, а он остаётся.
//
// Ломается это так: за грип утаскивают САМО поле, и очерченный круг уезжает в угол стола вместе с
// картами. Снаружи это выглядит как «стол развалился», и собрать его обратно нечем.

import { describe, expect, it } from "vitest";
import { deal } from "./deal.js";
import { deskOf } from "./desks.js";
import { Table } from "./table.js";
import { RING } from "./games/krest.js";
import { MAIN_PILE, type Person } from "./contract.js";
import { deckHome, RING_ARROW, ringCardHalf, RING_SPREAD } from "./ring.js";
import { SANDBOX } from "./rules.js";

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });
/**
 * Стол с КРУГОМ, но с правами песочницы: здесь проверяется место на сукне, а не старшинство. С
 * правами крестового вторую карту в круг не положить — её отказало бы «не бьёт», и тест мерил бы
 * чужой закон.
 */
const ringTable = () => {
  const t = new Table(deal(), "Аня", { ...SANDBOX, zones: deskOf("krest", () => null).zones });
  t.join(person("Аня"));
  return t;
};
const ring = (t: Table) => t.seenBy("Аня").piles.find((p) => p.id === RING);
const chairOf = (t: Table) => t.layout().chairs.find((c) => c.owner === "Аня")!.id;

/** Взять верхнюю карту колоды в руку и положить её в круг. */
function intoRing(t: Table): string {
  const top = t.seenBy("Аня").piles.find((p) => p.id === MAIN_PILE)!.cards.at(-1)!.id;
  t.act("Аня", { t: "grab", id: top }, 0);
  t.act("Аня", { t: "drop", id: top, to: { in: "hand", chair: chairOf(t), i: 0 } }, 0);
  t.act("Аня", { t: "grab", id: top }, 0);
  const put = t.act("Аня", { t: "drop", id: top, to: { in: "deck", pile: RING } }, 0);
  expect("refused" in put ? put.refused : "ok").toBe("ok");
  return top;
}

describe("круг хода стоит на месте", () => {
  it("пустой круг с места не сдвинуть вовсе", () => {
    const t = ringTable();
    expect(t.act("Аня", { t: "deckMove", pile: RING, x: 4, y: 4 }, 0)).toEqual({ refused: "locked" });
    expect(ring(t)).toMatchObject({ x: 0, y: 0 });
  });

  it("ПОТЯНУЛИ ЗА ГРИП — УЕХАЛИ КАРТЫ, А НЕ КРУГ: они легли новой стопкой там, где отпустили", () => {
    const t = ringTable();
    const card = intoRing(t);
    const out = t.act("Аня", { t: "deckMove", pile: RING, x: 4, y: 2 }, 0);
    expect("refused" in out).toBe(false);
    expect(ring(t), "круг на своём месте и пуст").toMatchObject({ x: 0, y: 0, cards: [] });
    const born = t.seenBy("Аня").piles.find((p) => p.id !== RING && p.id !== MAIN_PILE)!;
    expect([born.x, born.y], "карты там, куда их отпустили").toEqual([4, 2]);
    expect(born.cards.map((c) => c.id)).toEqual([card]);
    expect(born.forever, "высыпанная стопка не вечная").toBe(false);
  });

  it("круг остаётся вечным и со своей позой — он никуда не делся", () => {
    const t = ringTable();
    intoRing(t);
    t.act("Аня", { t: "deckMove", pile: RING, x: 4, y: 2 }, 0);
    expect(ring(t)).toMatchObject({ pose: "ring", forever: true, name: "Круг хода" });
  });

  it("МЕСТО УХОДИТ ВМЕСТЕ С КАРТОЙ: вынесли — и оно ей больше не принадлежит", () => {
    const t = ringTable();
    intoRing(t);
    intoRing(t);
    const cards = ring(t)!.cards;
    const was = cards[1]!.at;
    expect(was, "лежащая в круге карта знает своё место").toBeDefined();
    const low = cards[0]!.id;
    t.act("Аня", { t: "grab", id: low }, 0);
    t.act("Аня", { t: "drop", id: low, to: { in: "hand", chair: chairOf(t), i: 0 } }, 0);
    expect(ring(t)!.cards[0]!.at, "оставшаяся стоит там же, где стояла").toEqual(was);
    const hand = t.seenBy("Аня").chairs.find((c) => c.id === chairOf(t))!.hand;
    expect(hand.every((c) => c.at === undefined), "у карты в руке места зоны нет").toBe(true);
  });

  it("обычная стопка двигается по-прежнему", () => {
    const t = ringTable();
    const out = t.act("Аня", { t: "deckMove", pile: MAIN_PILE, x: 2, y: 2 }, 0);
    expect("refused" in out).toBe(false);
    expect(t.seenBy("Аня").piles.find((p) => p.id === MAIN_PILE)).toMatchObject({ x: 2, y: 2 });
  });
});

describe("колода не спорит с кругом за середину", () => {
  it("колода стоит у крупье, и это дальше круга", () => {
    const t = ringTable();
    const deck = t.seenBy("Аня").piles.find((p) => p.id === MAIN_PILE)!;
    expect([deck.x, deck.y]).toEqual([deckHome().x, deckHome().y]);
    expect(Math.hypot(deck.x, deck.y), "вне круга").toBeGreaterThan(RING_SPREAD + 1);
  });
});

describe("СТРЕЛКА — ЯКОРЬ КРУГА, а не первая карта", () => {
  /** Под каким углом от середины круга лежит эта карта. */
  const turnOf = (at: { x: number; y: number }) => ((Math.atan2(at.x, -at.y) * 180) / Math.PI + 360) % 360;

  it("УНЕСЛИ ГОЛОВУ — стрелка шагнула вперёд, и НИКТО не двинулся", () => {
    const t = ringTable();
    intoRing(t);
    intoRing(t);
    intoRing(t);
    const was = ring(t)!.cards.map((c) => c.at!);
    const head = ring(t)!.cards[0]!.id;
    t.act("Аня", { t: "grab", id: head }, 0);
    t.act("Аня", { t: "drop", id: head, to: { in: "hand", chair: chairOf(t), i: 0 } }, 0);
    const now = ring(t)!;
    expect(now.cards.map((c) => c.at), "оставшиеся стоят там же").toEqual([was[1], was[2]]);
    expect(now.turn, "а стрелка встала на новую голову").toBeCloseTo(turnOf(was[1]!), 4);
  });

  it("ПЕРЕЛОЖИЛИ ГОЛОВУ ВНУТРИ КРУГА — стрелка на месте, остальные подтянулись к ней", () => {
    const t = ringTable();
    intoRing(t);
    intoRing(t);
    intoRing(t);
    const was = ring(t)!;
    const anchor = was.turn!;
    const [head, second, third] = was.cards.map((c) => c.id);
    t.act("Аня", { t: "grab", id: head! }, 0);
    // В КОНЕЦ, а не «мимо всего»: брошенная мимо всего своя карта возвращается домой и ничего не меняет.
    t.act("Аня", { t: "drop", id: head!, to: { in: "deck", pile: RING, i: 2 } }, 0);
    const now = ring(t)!;
    expect(now.turn, "стрелка не шелохнулась").toBeCloseTo(anchor, 4);
    expect(now.cards.map((c) => c.id), "бывшая вторая стала головой").toEqual([second, third, head]);
    expect(turnOf(now.cards[0]!.at!), "и встала на место головы — к стрелке").toBeCloseTo(anchor, 4);
  });

  it("ПУСТОЙ КРУГ ПРИНИМАЕТ ПЕРВУЮ КАРТУ СО СТОРОНЫ ТОГО, КТО ЕЁ ПРИНЁС", () => {
    const t = ringTable();
    // Стул отвёрнут от нуля НАРОЧНО: с нулевого угла подмена якоря на ноль была бы незаметна.
    t.turnChair(chairOf(t), 90);
    const chair = t.layout().chairs.find((c) => c.id === chairOf(t))!;
    expect(chair.angle, "стул и правда не на нуле").toBe(90);
    intoRing(t);
    expect(ring(t)!.turn, "якорь встал по стулу").toBeCloseTo(chair.angle, 4);
    expect(turnOf(ring(t)!.cards[0]!.at!), "и голова легла ровно на него").toBeCloseTo(chair.angle, 4);
  });

  it("ДОЛЯ СТРЕЛКИ НЕ ОТДАЁТСЯ КАРТАМ: разрыв перед головой держится при любом числе карт", () => {
    const t = ringTable();
    for (let i = 0; i < 6; i += 1) {
      intoRing(t);
      const cards = ring(t)!.cards;
      // Пока карт меньше, чем мест (их не меньше трёх), в круге есть пустые места, и разрыв больше доли.
      if (cards.length < 4) continue;
      const gap = ((turnOf(cards[0]!.at!) - turnOf(cards.at(-1)!.at!)) + 360) % 360;
      const away = Math.hypot(cards[0]!.at!.x, cards[0]!.at!.y);
      // Разрыв — доля стрелки и по половине карты с каждой стороны: стрелке нужно СВОЁ место, а не
      // место под краем головы.
      expect(gap - 2 * ringCardHalf(away), `${cards.length} карт: разрыв без краёв карт`).toBeCloseTo(RING_ARROW, 3);
    }
  });
});
