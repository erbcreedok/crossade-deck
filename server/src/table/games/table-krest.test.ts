// СТОЛ КРЕСТОВОГО ЦЕЛИКОМ: раздали все карты — партия пошла, и кольцо стережёт очередь.
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

describe("стол крестового: кольцо стережёт очередь", () => {
  it("партии нет — в кольцо кладёт кто угодно, как в песочнице", () => {
    const k = krestTable(["Аня", "Боря"]);
    const card = toHand(k.t, "Боря");
    k.t.act("Боря", { t: "grab", id: card }, 0);
    const drop = k.t.act("Боря", { t: "drop", id: card, to: { in: "deck", pile: RING } }, 0);
    expect("refused" in drop ? drop.refused : "ok").toBe("ok");
  });

  it("партия идёт — чужой в кольцо не положит, а тот, чей ход, положит", () => {
    const k = krestTable(["Аня", "Боря"]);
    const mine = toHand(k.t, "Аня");
    const his = toHand(k.t, "Боря");
    const m = k.open(k.chairOf("Аня"));
    // Чей ход, решает судья: у кого шестёрка буби, иначе раздающий. Берём его ответ, а не угадываем.
    const turn = k.t.layout().chairs.find((c) => c.id === m.turn)!.owner!;
    const other = turn === "Аня" ? "Боря" : "Аня";
    const otherCard = other === "Аня" ? mine : his;
    const turnCard = turn === "Аня" ? mine : his;

    k.t.act(other, { t: "grab", id: otherCard }, 0);
    const refused = k.t.act(other, { t: "drop", id: otherCard, to: { in: "deck", pile: RING } }, 0);
    expect("refused" in refused, `${other} ходит не в свой черёд`).toBe(true);

    k.t.act(turn, { t: "grab", id: turnCard }, 0);
    const allowed = k.t.act(turn, { t: "drop", id: turnCard, to: { in: "deck", pile: RING } }, 0);
    expect("refused" in allowed ? allowed.refused : "ok", `${turn} ходит в свой черёд`).toBe("ok");
  });

  it("грип кольца: админу можно всегда, прочим — только закрывшему круг", () => {
    const k = krestTable(["Аня", "Боря"]);
    k.open(k.chairOf("Аня"));
    const desk = deskOf("krest", () => ({ turn: null, closer: "Боря" }));
    const ask = { face: () => undefined, pile: () => [], hand: () => [], admin: (who: string) => who === "Аня" , croupier: () => false };
    expect(allowed(desk.says(ask, "pile.grip", { by: "Аня", pile: RING })), "админ").toBe(true);
    expect(allowed(desk.says(ask, "pile.grip", { by: "Боря", pile: RING })), "закрыл круг").toBe(true);
    expect(allowed(desk.says(ask, "pile.grip", { by: "Вика", pile: RING })), "прочие смотрят счётчик").toBe(false);
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

  /** Места карт круга, как их видит зритель. */
  const seats = (k: ReturnType<typeof krestTable>) => k.t.seenBy("Аня").piles.find((p) => p.id === RING)!.slots;

  it("ВЗЯЛИ ЛЮБУЮ — ОСТАЛЬНЫЕ НЕ ШЕЛОХНУЛИСЬ: на её месте остаётся дыра", () => {
    const k = krestTable(["Аня"]);
    const three = [toHand(k.t, "Аня"), toHand(k.t, "Аня"), toHand(k.t, "Аня")];
    for (const one of three) intoRing(k.t, "Аня", one);
    expect(seats(k), "легли по порядку").toEqual([0, 1, 2]);
    // Берём СРЕДНЮЮ: прежде она утаскивала за собой всех, кто лежит после неё.
    k.t.act("Аня", { t: "grab", id: three[1]! }, 0);
    k.t.act("Аня", { t: "drop", id: three[1]!, to: { in: "hand", chair: k.chairOf("Аня"), i: 0 } }, 0);
    expect(seats(k), "первая и третья остались на своих местах").toEqual([0, 2]);
    // И нижняя — так же.
    k.t.act("Аня", { t: "grab", id: three[0]! }, 0);
    k.t.act("Аня", { t: "drop", id: three[0]!, to: { in: "hand", chair: k.chairOf("Аня"), i: 0 } }, 0);
    expect(seats(k), "третья не съехала на место первой").toEqual([2]);
  });

  it("ПОЛОЖИЛИ КАРТУ — КРУГ РАЗЛОЖИЛСЯ ЗАНОВО: только это и меняет позу карт", () => {
    const k = krestTable(["Аня"]);
    const three = [toHand(k.t, "Аня"), toHand(k.t, "Аня"), toHand(k.t, "Аня")];
    for (const one of three) intoRing(k.t, "Аня", one);
    k.t.act("Аня", { t: "grab", id: three[0]! }, 0);
    k.t.act("Аня", { t: "drop", id: three[0]!, to: { in: "hand", chair: k.chairOf("Аня"), i: 0 } }, 0);
    expect(seats(k)).toEqual([1, 2]);
    intoRing(k.t, "Аня", three[0]!);
    expect(seats(k), "дыры закрылись, места раздались по порядку").toEqual([0, 1, 2]);
  });

  it("кольцо опустело — круг кончился, и мест не осталось вовсе", () => {
    const k = krestTable(["Аня"]);
    const one = toHand(k.t, "Аня");
    intoRing(k.t, "Аня", one);
    k.t.act("Аня", { t: "grab", id: one }, 0);
    k.t.act("Аня", { t: "drop", id: one, to: { in: "hand", chair: k.chairOf("Аня"), i: 0 } }, 0);
    expect(seats(k)).toBeUndefined();
  });

  it("обычной стопки это не касается вовсе", () => {
    const k = krestTable(["Аня"]);
    const card = toHand(k.t, "Аня");
    k.t.act("Аня", { t: "grab", id: card }, 0);
    k.t.act("Аня", { t: "drop", id: card, to: { in: "felt", x: 2, y: 2, up: false, angle: 0 } }, 0);
    expect(k.t.seenBy("Аня").piles.find((p) => p.id === "deck")!.slots, "у колоды мест нет").toBe(undefined);
  });
});
