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
import { deckHome, RING_SPREAD } from "./ring.js";
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

  it("места круга уходят вместе с последней картой", () => {
    const t = ringTable();
    intoRing(t);
    intoRing(t);
    const low = ring(t)!.cards[0]!.id;
    t.act("Аня", { t: "grab", id: low }, 0);
    t.act("Аня", { t: "drop", id: low, to: { in: "hand", chair: chairOf(t), i: 0 } }, 0);
    expect(ring(t)!.slots, "нижнюю сняли — её место осталось дырой").toEqual([1]);
    t.act("Аня", { t: "deckMove", pile: RING, x: 3, y: 3 }, 0);
    expect(ring(t)!.slots, "круг разобрали целиком — мест не осталось").toBeUndefined();
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
