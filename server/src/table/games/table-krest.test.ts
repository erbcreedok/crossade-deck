// СТОЛ КРЕСТОВОГО ЦЕЛИКОМ: раздали все карты — партия пошла, а кольцо принимает карты от любого.
//
// Здесь проверяется связка, а не правила: правила уже разобраны в `krest.test.ts` и `match.test.ts`.
// Связка ломается иначе — тем, что стол и судья начинают расходиться, и за столом это видно как
// «мне не даёт положить, хотя мой ход».

import { describe, expect, it } from "vitest";
import { deal } from "../deal.js";
import { deskOf } from "../desks.js";
import { Table } from "../table.js";
import type { Person } from "../contract.js";
import { RING } from "./krest.js";
import { start, type Match } from "./match.js";
import { SANDBOX } from "../rules.js";
import { allowed } from "../access.js";
import type { Face } from "../contract.js";

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });

/** Стол крестового с судьёй, как его собирает комната: окно отдаёт очередь и закрывшего в ключах людей. */
function krestTable(keys: string[]) {
  let match: Match | null = null;
  // Стол объявлен раньше окна нарочно: окно читает стол, а стол читает окно, и одно из двух должно
  // быть готово первым. Готов стол.
  const t: Table = new Table(deal(), keys[0]!, deskOf("krest", () => (match === null ? null : { turn: owner(match.turn), closer: owner(match.closer) })));
  const owner = (chair: string | null): string | null => (chair === null ? null : (t.layout().chairs.find((c) => c.id === chair)?.owner ?? null));
  for (const k of keys) t.join(person(k));
  const hands = (): Record<string, readonly Face[]> =>
    Object.fromEntries(
      t
        .layout()
        .chairs.filter((c) => !c.croupier && c.hand.length > 0)
        .map((c) => [c.id, c.hand.map((id) => t.faceOf(id)!).filter(Boolean)]),
    );
  return {
    t,
    open: (dealer: string | null) => {
      match = start(hands(), dealer);
      return match;
    },
    get match() {
      return match;
    },
    chairOf: (key: string) => t.layout().chairs.find((c) => c.owner === key)!.id,
  };
}

/** Взять верхнюю карту колоды в руку этого человека — как это делает раздача. */
function toHand(t: Table, key: string): string {
  const chair = t.layout().chairs.find((c) => c.owner === key)!;
  const top = t.seenBy(key).piles.find((p) => p.id === "deck")!.cards.at(-1)!.id;
  const grab = t.act(key, { t: "grab", id: top }, 0);
  expect("refused" in grab ? grab.refused : "ok").toBe("ok");
  const drop = t.act(key, { t: "drop", id: top, to: { in: "hand", chair: chair.id, i: 0 } }, 0);
  expect("refused" in drop ? drop.refused : "ok").toBe("ok");
  return top;
}

describe("стол крестового: кольцо принимает от любого", () => {
  it("партии нет — в кольцо кладёт кто угодно, как в песочнице", () => {
    const k = krestTable(["Аня", "Боря"]);
    const card = toHand(k.t, "Боря");
    k.t.act("Боря", { t: "grab", id: card }, 0);
    const drop = k.t.act("Боря", { t: "drop", id: card, to: { in: "deck", pile: RING } }, 0);
    expect("refused" in drop ? drop.refused : "ok").toBe("ok");
  });

  it("ПАРТИЯ ИДЁТ — а кольцо всё равно принимает от любого", () => {
    const k = krestTable(["Аня", "Боря"]);
    const mine = toHand(k.t, "Аня");
    const his = toHand(k.t, "Боря");
    const m = k.open(k.chairOf("Аня"));
    // Чей ход, решает судья: у кого шестёрка буби, иначе раздающий. Берём его ответ, а не угадываем.
    const turn = k.t.layout().chairs.find((c) => c.id === m.turn)!.owner!;
    const other = turn === "Аня" ? "Боря" : "Аня";
    const otherCard = other === "Аня" ? mine : his;
    const turnCard = turn === "Аня" ? mine : his;

    // Судейство снято: стол крестового — песочница с удобным кругом, и очередь он не сторожит.
    // Вернётся вместе с режимом игры без читерства, и тогда этот прогон снова будет ждать отказа.
    k.t.act(other, { t: "grab", id: otherCard }, 0);
    const notHisTurn = k.t.act(other, { t: "drop", id: otherCard, to: { in: "deck", pile: RING } }, 0);
    expect("refused" in notHisTurn ? notHisTurn.refused : "ok", `${other} кладёт не в свой черёд — и стол не спорит`).toBe("ok");

    k.t.act(turn, { t: "grab", id: turnCard }, 0);
    const allowed = k.t.act(turn, { t: "drop", id: turnCard, to: { in: "deck", pile: RING } }, 0);
    expect("refused" in allowed ? allowed.refused : "ok", `${turn} ходит в свой черёд`).toBe("ok");
  });

  it("ГРИП КОЛЬЦА ЖИВОЙ У ВСЕХ, пока нет игры без читерства", () => {
    const k = krestTable(["Аня", "Боря"]);
    k.open(k.chairOf("Аня"));
    const desk = deskOf("krest", () => ({ turn: null, closer: "Боря" }));
    const ask = { face: () => undefined, pile: () => [], hand: () => [], admin: (who: string) => who === "Аня" , croupier: () => false };
    for (const who of ["Аня", "Боря", "Вика"]) expect(allowed(desk.says(ask, "pile.grip", { by: who, pile: RING })), who).toBe(true);
  });

  it("кольцо стоит на столе с самого начала и пустым", () => {
    const k = krestTable(["Аня"]);
    const ring = k.t.seenBy("Аня").piles.find((p) => p.id === RING)!;
    expect(ring.cards).toEqual([]);
    expect(ring.pose).toBe("ring");
    expect(ring.forever, "кольцо не исчезает, опустев").toBe(true);
  });
});

describe("кольцо рвётся, а не сдвигается", () => {
  // Здесь проверяется МЕХАНИКА кольца, а не старшинство: стол берётся с зоной-кольцом, но с правами
  // песочницы. Иначе вторую карту в кольцо не положить — её отказало бы «не бьёт», и тест мерил бы
  // старшинство, уже разобранное в другом файле.
  const krestTable = (keys: string[]) => {
    const t = new Table(deal(), keys[0]!, { ...SANDBOX, zones: [{ id: RING, x: 0, y: 0, pose: "ring", forever: true }] });
    for (const k of keys) t.join(person(k));
    return { t, chairOf: (key: string) => t.layout().chairs.find((c) => c.owner === key)!.id };
  };

  /** Положить карту из руки в кольцо и вернуть её id. */
  const intoRing = (t: Table, key: string, card: string) => {
    t.act(key, { t: "grab", id: card }, 0);
    const drop = t.act(key, { t: "drop", id: card, to: { in: "deck", pile: RING } }, 0);
    expect("refused" in drop ? drop.refused : "ok").toBe("ok");
  };

  /** Углы карт круга, как их видит зритель: координат в столе нет ни у кого. */
  const places = (k: ReturnType<typeof krestTable>) =>
    k.t.seenBy("Аня").piles.find((p) => p.id === RING)!.cards.map((c) => c.turn);

  it("ВЗЯЛИ ЛЮБУЮ — ОСТАЛЬНЫЕ НЕ ШЕЛОХНУЛИСЬ, даже на пиксель", () => {
    const k = krestTable(["Аня"]);
    const four = [toHand(k.t, "Аня"), toHand(k.t, "Аня"), toHand(k.t, "Аня"), toHand(k.t, "Аня")];
    for (const one of four) intoRing(k.t, "Аня", one);
    const was = places(k);
    // Берём СРЕДНЮЮ — тот случай, который двигал всех, кто лежит после неё.
    k.t.act("Аня", { t: "grab", id: four[1]! }, 0);
    k.t.act("Аня", { t: "drop", id: four[1]!, to: { in: "hand", chair: k.chairOf("Аня"), i: 0 } }, 0);
    expect(places(k), "остальные стоят там же").toEqual([was[0], was[2], was[3]]);
    // И ПОСЛЕДНЮЮ — раньше от неё менялся шаг всего круга.
    k.t.act("Аня", { t: "grab", id: four[3]! }, 0);
    k.t.act("Аня", { t: "drop", id: four[3]!, to: { in: "hand", chair: k.chairOf("Аня"), i: 0 } }, 0);
    expect(places(k), "и снова стоят там же").toEqual([was[0], was[2]]);
  });

  it("ПОЛОЖИЛИ СО СМЕНОЙ ПОРЯДКА — НОМЕРА РАЗДАНЫ ЗАНОВО, а якорь не сдвинулся", () => {
    const k = krestTable(["Аня"]);
    const three = [toHand(k.t, "Аня"), toHand(k.t, "Аня"), toHand(k.t, "Аня")];
    for (const one of three) intoRing(k.t, "Аня", one);
    const зона = () => k.t.seenBy("Аня").piles.find((p) => p.id === RING)!;
    const якорь = зона().turn;
    const more = toHand(k.t, "Аня");
    k.t.act("Аня", { t: "grab", id: more }, 0);
    k.t.act("Аня", { t: "drop", id: more, to: { in: "deck", pile: RING, i: 1 } }, 0);
    const круг = зона();
    // ПОРЯДОК В КРУГЕ — ПОРЯДОК ВХОДА, и место в стопке его не меняет: четвёртая карта зашла
    // четвёртой, куда бы её ни положили на сукне.
    expect(круг.cards.map((c) => c.id), "порядок входа").toEqual([...three, more]);
    expect(круг.cards.every((c) => c.turn !== undefined), "у каждой карты свой угол").toBe(true);
    expect(new Set(круг.cards.map((c) => c.turn)).size, "и углы у всех разные").toBe(4);
  });

  it("ПОЛОЖИЛИ НА СВОБОДНЫЙ УГОЛ — встал туда, и НИЧЕГО не переложилось", () => {
    const k = krestTable(["Аня"]);
    const three = [toHand(k.t, "Аня"), toHand(k.t, "Аня"), toHand(k.t, "Аня")];
    for (const one of three) intoRing(k.t, "Аня", one);
    const место = k.t.seenBy("Аня").piles.find((p) => p.id === RING)!.cards[1]!.turn!;
    // Вынули среднюю и вернули на тот же угол.
    k.t.act("Аня", { t: "grab", id: three[1]! }, 0);
    k.t.act("Аня", { t: "drop", id: three[1]!, to: { in: "hand", chair: k.chairOf("Аня"), i: 0 } }, 0);
    k.t.act("Аня", { t: "grab", id: three[1]! }, 0);
    k.t.act("Аня", { t: "drop", id: three[1]!, to: { in: "deck", pile: RING, turn: место } }, 0);
    const круг = k.t.seenBy("Аня").piles.find((p) => p.id === RING)!;
    expect(круг.cards.find((c) => c.id === three[1])!.turn, "легла ровно туда, куда просили").toBe(место);
    expect(круг.cards.map((c) => c.id).at(-1), "но вошла последней: она уходила и вернулась").toBe(three[1]);
  });

  it("обычной стопки это не касается вовсе", () => {
    const k = krestTable(["Аня"]);
    const card = toHand(k.t, "Аня");
    k.t.act("Аня", { t: "grab", id: card }, 0);
    k.t.act("Аня", { t: "drop", id: card, to: { in: "felt", x: 2, y: 2, up: false, angle: 0 } }, 0);
    expect(k.t.seenBy("Аня").piles.find((p) => p.id === "deck")!.cards.every((c) => c.turn === undefined), "у карт колоды углов нет").toBe(true);
  });
});
