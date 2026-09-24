// ЖУРНАЛ ПОКАЗЫВАЕТ ТОЛЬКО ТО, ЧТО ЗРИТЕЛЬ И ТАК ВИДИТ.
//
// Это не украшение, а граница: журнал, показывающий лицо карты, ушедшей в закрытую стопку, был бы
// дыркой в чужие карты — смотреть в него стало бы выгоднее, чем на стол.
//
// Проверяется он здесь ДВУМЯ концами сразу: настоящий стол режет операцию под зрителя (`seenOp`),
// а журнал печатает то, что получил. Подделать нечего: второго источника карт у экрана нет.

import { describe, expect, it } from "vitest";
import type { Face, Op, Snapshot } from "../src/table/contract.js";
import { MAIN_PILE } from "../src/table/contract.js";
import { Table } from "../src/table/table.js";
import { deedOf, journal } from "./journal.js";

const person = (key: string) => ({ key, name: key, ink: "#fff", door: "guest" as const });
const cards = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, face: { rank: String(i + 6), suit: "s" as const } }));
const ok = (r: ReturnType<Table["act"]>) => {
  if ("refused" in r) throw new Error(`отказ: ${r.refused}`);
  return r;
};

/** Стол с Аней и Борей: у каждого свой стул, колода посередине. */
function стол() {
  const t = new Table(cards, "Аня");
  t.join(person("Аня"));
  t.join(person("Боря"));
  const seat = (key: string) => t.seenBy(key).people.find((p) => p.key === key)!.seat!;
  return { t, аня: seat("Аня"), боря: seat("Боря") };
}

const верх = (t: Table, key: string) => t.seenBy(key).piles.find((p) => p.id === MAIN_PILE)!.cards.at(-1)!.id;

describe("journal.a-journal-shows-only-what-the-viewer-sees", () => {
  it("КАРТА В ЧУЖОЙ СКРЫТОЙ РУКЕ: хозяин видит лицо, сосед — рубашку", () => {
    const { t, аня } = стол();
    const id = верх(t, "Аня");
    ok(t.act("Аня", { t: "grab", id }, 0));
    const done = ok(t.act("Аня", { t: "drop", id, to: { in: "hand", chair: аня, i: 0 } }, 0));

    // Одна и та же операция, прорезанная двумя зрителями, — как её и шлёт комната.
    const мой = t.seenOp(done.ops.find((o) => o.t === "move")!, "Аня");
    const чужой = t.seenOp(done.ops.find((o) => o.t === "move")!, "Боря");

    const мояЗапись = deedOf(мой, t.seenBy("Аня"), 0)!;
    const чужаяЗапись = deedOf(чужой, t.seenBy("Боря"), 0)!;
    expect(мояЗапись.cards?.[0], "своя карта — лицом").toEqual(cards.find((c) => c.id === id)!.face);
    expect(чужаяЗапись.cards?.[0], "чужая в скрытой руке — рубашкой").toBe(null);
    expect(чужаяЗапись.says, "а само действие видно обоим одинаково").toBe(мояЗапись.says);
  });

  it("КАРТА, ЛЁГШАЯ РУБАШКОЙ НА СТОЛ, не показывает лица никому — даже положившему", () => {
    const { t } = стол();
    const id = верх(t, "Аня");
    ok(t.act("Аня", { t: "grab", id }, 0));
    const done = ok(t.act("Аня", { t: "drop", id, to: { in: "felt", x: 0, y: 0, up: false, angle: 0 } }, 0));
    const op = t.seenOp(done.ops.find((o) => o.t === "move")!, "Аня");
    expect(deedOf(op, t.seenBy("Аня"), 0)!.cards?.[0]).toBe(null);
  });

  it("ПЕРЕВЕРНУЛИ ЛИЦОМ НА СТОЛЕ — видно всем, и соседу тоже", () => {
    // Карта из колоды ложится той стороной, какой лежала: рубашкой. Лицо она открывает переворотом,
    // и вот его-то видно всем — как и саму карту на сукне.
    const { t } = стол();
    const id = верх(t, "Аня");
    ok(t.act("Аня", { t: "grab", id }, 0));
    ok(t.act("Аня", { t: "drop", id, to: { in: "felt", x: 1, y: 1, up: false, angle: 0 } }, 0));
    const done = ok(t.act("Аня", { t: "turn", id }, 0));
    const op = t.seenOp(done.ops.find((o) => o.t === "turn")!, "Боря");
    const deed = deedOf(op, t.seenBy("Боря"), 0)!;
    expect(deed.says).toBe("перевернул лицом");
    expect(deed.cards?.[0], "соседу лицо видно").toEqual(cards.find((c) => c.id === id)!.face);
  });

  it("ПЕРЕМЕШАЛИ — только число карт: лиц нет ни у кого, и показывать нечего", () => {
    const снимок = { people: [], chairs: [], piles: [] } as unknown as Snapshot;
    const op: Op = { t: "deck", pile: MAIN_PILE, cards: [{ id: "a" }, { id: "b" }], shuffled: true };
    const deed = deedOf(op, снимок, 0)!;
    expect(deed.says).toBe("перемешал стопку");
    expect(deed.count).toBe(2);
    expect(deed.cards, "карт по одной не показываем").toBeUndefined();
  });
});

describe("journal.a-journal-reads-as-a-story", () => {
  const снимок = (over: Partial<Snapshot> = {}): Snapshot =>
    ({ people: [person("Аня")], chairs: [], piles: [], felt: [], trails: {}, locks: {}, ...over }) as unknown as Snapshot;
  const face: Face = { rank: "K", suit: "h" };

  it("движение называет и откуда, и куда", () => {
    const op: Op = {
      t: "move",
      card: { id: "c1", face },
      from: { in: "deck", pile: MAIN_PILE },
      to: { in: "felt", x: 0, y: 0, up: true, angle: 0 },
      trail: { by: "Аня", byName: "Аня", from: "deck", at: 0 },
    };
    const deed = deedOf(op, снимок(), 0)!;
    expect(deed.who).toBe("Аня");
    expect(deed.says).toBe("из «колода» на стол");
  });

  it("у места игры своё имя — «круг хода», а не «стопка»", () => {
    const op: Op = {
      t: "move",
      card: { id: "c1", face },
      from: { in: "felt", x: 0, y: 0, up: true, angle: 0 },
      to: { in: "deck", pile: "ring" },
      trail: { by: "Аня", byName: "Аня", from: "felt", at: 0 },
    };
    const piles = [{ id: "ring", name: "Круг хода", cards: [] }] as unknown as Snapshot["piles"];
    expect(deedOf(op, снимок({ piles }), 0)!.says).toBe("со стола в круг хода");
  });

  it("ШУМ В ЖУРНАЛ НЕ ПОПАДАЕТ: замки, выделения и права человеку ничего не говорят", () => {
    for (const op of [
      { t: "lock", id: "c1", by: "Аня" },
      { t: "unlock", id: "c1" },
      { t: "pick", ids: ["c1"], by: "Аня" },
      { t: "admin", key: "Аня", rights: [] },
      { t: "play", play: null },
      { t: "order", chair: "c1", ids: [] },
    ] as Op[]) {
      expect(deedOf(op, снимок(), 0), op.t).toBe(null);
    }
  });

  it("журнал держит последние записи и выбрасывает старые", () => {
    const j = journal(3);
    const шаг = (i: number): Op => ({ t: "join", person: person(`кто${i}`) });
    for (let i = 0; i < 5; i += 1) j.take([шаг(i)], снимок(), i);
    expect(j.all().length).toBe(3);
    expect(j.all()[0]!.who, "старое выпало, последние на месте").toBe("кто2");
  });

  it("пачка без единой понятной записи журнал не трогает", () => {
    const j = journal();
    expect(j.take([{ t: "unlock", id: "c1" }], снимок(), 0)).toBe(false);
    expect(j.all().length).toBe(0);
  });
});

describe("journal.a-journal-speaks-like-a-person", () => {
  const снимок = (over: Partial<Snapshot> = {}): Snapshot =>
    ({ people: [person("Аня"), person("Боря")], chairs: [], piles: [], felt: [], trails: {}, locks: {}, ...over }) as unknown as Snapshot;
  const face: Face = { rank: "K", suit: "h" };
  const стулья = [
    { id: "s1", owner: "Аня", hand: [] },
    { id: "s2", owner: "Боря", hand: [] },
  ] as unknown as Snapshot["chairs"];

  const движение = (from: Snapshot["chairs"][number]["id"] | null, to: string | null, by: string): Op => ({
    t: "move",
    card: { id: "c1", face },
    from: from === null ? { in: "felt", x: 0, y: 0, up: true, angle: 0 } : { in: "hand", chair: from, i: 0 },
    to: to === null ? { in: "felt", x: 0, y: 0, up: true, angle: 0 } : { in: "hand", chair: to, i: 0 },
    trail: { by, byName: by, from: "hand", at: 0 },
  });

  it("СВОЯ РУКА ЗОВЁТСЯ СВОЕЙ — иначе журнал заикается именем", () => {
    // «Аня из руки — Аня на стол» читается как ошибка; за столом так не говорят.
    expect(deedOf(движение("s1", null, "Аня"), снимок({ chairs: стулья }), 0)!.says).toBe("из своей руки на стол");
    expect(deedOf(движение(null, "s1", "Аня"), снимок({ chairs: стулья }), 0)!.says).toBe("со стола себе в руку");
  });

  it("чужая рука зовётся по имени того, кто в ней сидит", () => {
    expect(deedOf(движение("s2", null, "Аня"), снимок({ chairs: стулья }), 0)!.says).toBe("из руки — Боря на стол");
    expect(deedOf(движение(null, "s2", "Аня"), снимок({ chairs: стулья }), 0)!.says).toBe("со стола в руку — Боря");
  });
});
