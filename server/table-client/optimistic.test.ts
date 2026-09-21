import { describe, expect, it } from "vitest";
import { predict, type BatchIntent } from "./optimistic.js";
import { MAIN_PILE, type Person, type Snapshot } from "../src/table/contract.js";
import { Table } from "../src/table/table.js";

// ДОГАДКА ЭКРАНА = ХОД СЕРВЕРА. Экран показывает пачку сразу, не дожидаясь ответа, и для этого повторяет
// правила стола у себя. Разойдись они — карта на долю секунды встанет не туда и прыгнет, когда придёт
// правда. Здесь одно намерение идёт двумя путями с одного снимка, и итог сверяется по каждой карте.

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });
const cards = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, face: { rank: String(i + 6), suit: "s" as const } }));
const ok = (r: ReturnType<Table["act"]>) => {
  if ("refused" in r) throw new Error(`refused: ${r.refused}`);
};

/** Где каждая карта и какой стороной — без имён новых стопок (экран зовёт свою «guess») и без версии. */
function lay(s: Snapshot): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of s.felt) out[c.id] = `felt ${c.x},${c.y} ${c.up ? "лицом" : "рубашкой"}`;
  for (const p of s.piles) p.cards.forEach((c, i) => (out[c.id] = `стопка[${p.cards.map((one) => one.id).join()}] #${i} ${c.up === true ? "лицом" : "рубашкой"}`));
  for (const ch of s.chairs) ch.hand.forEach((c, i) => (out[c.id] = `рука ${ch.id} #${i}`));
  return out;
}

/** Стол: Аня и Боря, по две карты в руке у Ани, три карты на сукне (одна лицом). */
function table() {
  const t = new Table(cards, "Аня");
  t.join(person("Аня"));
  t.join(person("Боря"));
  const seat = t.seenBy("Аня").people.find((p) => p.key === "Аня")!.seat!;
  const top = () => t.seenBy("Аня").piles.find((p) => p.id === MAIN_PILE)!.cards.at(-1)!.id;
  const put = (to: Parameters<Table["act"]>[1] extends infer I ? (I extends { t: "drop"; to: infer W } ? W : never) : never) => {
    const id = top();
    ok(t.act("Аня", { t: "grab", id }, 0));
    ok(t.act("Аня", { t: "drop", id, to }, 0));
    return id;
  };
  const hand = [put({ in: "hand", chair: seat, i: 0 }), put({ in: "hand", chair: seat, i: 1 })];
  const felt = [put({ in: "felt", x: -2, y: 1, up: false, angle: 0 }), put({ in: "felt", x: 0, y: 2, up: false, angle: 0 }), put({ in: "felt", x: 2, y: 1, up: false, angle: 0 })];
  ok(t.act("Аня", { t: "turn", id: felt[2]! }, 0));
  return { t, seat, hand, felt };
}

function bothWays(t: Table, intent: BatchIntent) {
  const before = t.seenBy("Аня");
  const guessed = lay(predict(before, intent, "Аня"));
  ok(t.act("Аня", intent, 1));
  return { guessed, real: lay(t.seenBy("Аня")) };
}

describe("догадка экрана совпадает с ходом сервера", () => {
  it("собрать карты с сукна в новую стопку — всеми тремя сторонами", () => {
    for (const side of ["keep", "down", "up"] as const) {
      const { t, felt } = table();
      const { guessed, real } = bothWays(t, { t: "gather", ids: felt, side, to: { x: 1, y: 1, angle: 0 } });
      expect(guessed, side).toEqual(real);
    }
  });

  it("собрать поверх стоящей колоды", () => {
    const { t, felt } = table();
    const { guessed, real } = bothWays(t, { t: "gather", ids: felt, side: "keep", to: { pile: MAIN_PILE } });
    expect(guessed).toEqual(real);
  });

  it("собрать ОДНУ карту: стопка из одной карты рушится обратно на сукно", () => {
    const { t, felt } = table();
    const { guessed, real } = bothWays(t, { t: "gather", ids: [felt[0]!], side: "keep", to: { x: 3, y: 3, angle: 0 } });
    expect(guessed).toEqual(real);
  });

  it("перевернуть выделенное разом", () => {
    const { t, felt } = table();
    const { guessed, real } = bothWays(t, { t: "turnMany", ids: felt });
    expect(guessed).toEqual(real);
  });

  it("перенести разом по сукну и в свою руку", () => {
    const { t, seat, felt } = table();
    const { guessed, real } = bothWays(t, {
      t: "moveMany",
      moves: [
        { id: felt[0]!, to: { in: "felt", x: -3, y: -3, up: false, angle: 0 } },
        { id: felt[1]!, to: { in: "hand", chair: seat, i: 0 } },
      ],
    });
    expect(guessed).toEqual(real);
  });

  it("переложить стопку целиком в руку", () => {
    const { t, seat, felt } = table();
    ok(t.act("Аня", { t: "gather", ids: [felt[0]!, felt[1]!], side: "down", to: { x: 3, y: -3, angle: 0 } }, 0));
    const pile = t.seenBy("Аня").piles.find((p) => p.id !== MAIN_PILE && p.cards.length === 2)!.id;
    const { guessed, real } = bothWays(t, { t: "pileDrop", pile, to: { in: "hand", chair: seat, i: 0 } });
    expect(guessed).toEqual(real);
  });
});
