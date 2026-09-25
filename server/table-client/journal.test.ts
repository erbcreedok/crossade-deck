// ЖУРНАЛ ПОКАЗЫВАЕТ ТОЛЬКО ТО, ЧТО ЗРИТЕЛЬ И ТАК ВИДИТ.
//
// Это не украшение, а граница: журнал, показывающий лицо карты, ушедшей в закрытую стопку, был бы
// дыркой в чужие карты — смотреть в него стало бы выгоднее, чем на стол.
//
// Проверяется он здесь ДВУМЯ концами сразу: настоящий стол режет операцию под зрителя (`seenOp`),
// а журнал печатает то, что получил. Подделать нечего: второго источника карт у экрана нет.

import { describe, expect, it } from "vitest";
import type { Face, Op, Snapshot } from "../src/table/contract.js";
import { MAIN_PILE, TOLD_OPS } from "../src/table/contract.js";
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
    expect(deed.says).toBe("перемешал «колода»");
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

  /**
   * РЕОРДЕР В СВОЕЙ РУКЕ — НЕ СОБЫТИЕ ПАРТИИ. Человек поправляет карты у себя в руке десятки раз за
   * круг, и стол честно шлёт на каждую поправку `move`. В журнале это выходило строкой «Ye из своей
   * руки себе в руку 6 крести» — шум, за которым не видно самой игры.
   */
  it("ШУМ: карта переложена внутри одной и той же руки — записи нет", () => {
    const внутри = (chair: string, куда: string): Op => ({
      t: "move",
      card: { id: "c1", face },
      from: { in: "hand", chair, i: 0 },
      to: { in: "hand", chair: куда, i: 3 },
      trail: { by: "Аня", byName: "Аня", from: "hand", at: 0, hand: "Аня" },
    });
    expect(deedOf(внутри("s1", "s1"), снимок(), 0), "своя рука").toBe(null);
    expect(deedOf(внутри("s1", "s2"), снимок(), 0), "а в ЧУЖУЮ руку — событие").not.toBe(null);
  });

  /**
   * ОДНО ДВИЖЕНИЕ — ОДНА ЗАПИСЬ. Крупье уносит круг одним движением (`pileDrop`), но стол честно
   * сообщает о каждой карте: пять карт — пять `move`. В журнале это выходило пятью одинаковыми
   * строками подряд, за которыми уже не видно самой партии.
   */
  it("пачка одинаковых движений слипается в одну запись с числом карт", () => {
    const одна = (id: string, rank: string): Op => ({
      t: "move",
      card: { id, face: { rank, suit: "h" } },
      from: { in: "deck", pile: "ring" },
      to: { in: "hand", chair: "kr", i: 0 },
      trail: { by: "Аня", byName: "Аня", from: "deck", at: 0 },
    });
    const j = journal();
    j.take([одна("c1", "7"), одна("c2", "8"), одна("c3", "9")], снимок(), 0);
    const all = j.all();
    expect(all.length, "одна строка вместо трёх").toBe(1);
    expect(all[0]!.count, "и в ней сказано, сколько карт").toBe(3);
    expect(all[0]!.cards?.length, "карты все на месте — их видно, как видно на столе").toBe(3);
  });

  it("разные движения в одной пачке не слипаются", () => {
    const в = (chair: string): Op => ({
      t: "move",
      card: { id: "c1", face },
      from: { in: "deck", pile: "ring" },
      to: { in: "hand", chair, i: 0 },
      trail: { by: "Аня", byName: "Аня", from: "deck", at: 0 },
    });
    // Руки разных людей: их и называют по-разному, значит и записи разные.
    const люди = [person("Аня"), person("Боря")];
    const chairs = [{ id: "k1", owner: "Аня" }, { id: "k2", owner: "Боря" }] as unknown as Snapshot["chairs"];
    const j = journal();
    j.take([в("k1"), в("k2")], снимок({ chairs, people: люди }), 0);
    expect(j.all().length).toBe(2);
  });

  /**
   * «СОБРАЛ СТОПКУ N ШТ.» — НЕ СОБЫТИЕ. Стол шлёт `deck` всякий раз, когда состав стопки переписан, —
   * в том числе после каждой положенной в круг карты. Человеку это ничего не говорит: карту, что
   * легла в круг, он уже увидел строкой выше. Остаётся только перемешивание: оно и вправду событие.
   */
  it("пересборка стопки в журнал не идёт, а перемешивание — идёт и называет стопку", () => {
    const piles = [{ id: "ring", name: "Круг хода", cards: [] }] as unknown as Snapshot["piles"];
    const op = (shuffled: boolean): Op => ({ t: "deck", pile: "ring", cards: [{ id: "c1" }, { id: "c2" }], shuffled });
    expect(deedOf(op(false), снимок({ piles }), 0), "пересборка — шум").toBe(null);
    expect(deedOf(op(true), снимок({ piles }), 0)!.says).toBe("перемешал «круг хода»");
  });

  /**
   * РАЗДАЧА — ОДНО СОБЫТИЕ, а не тридцать восемь. Карты летят по одной, каждая своим патчем, и в
   * журнале это было тридцать восемь одинаковых строк «CrossaderBot из «колода» в руку — …», за
   * которыми не видно ничего. Человеку важно одно: раздали, и вот кому сколько.
   */
  it("раздача по карте за раз слипается в одну запись с разбивкой по рукам", () => {
    const chairs = [{ id: "s1", owner: "Аня" }, { id: "s2", owner: "Боря" }] as unknown as Snapshot["chairs"];
    const люди = [person("Аня"), person("Боря")];
    const карта = (chair: string): Op => ({
      t: "move",
      card: { id: `c${Math.random()}`, face },
      from: { in: "deck", pile: MAIN_PILE },
      to: { in: "hand", chair, i: 0 },
      trail: { by: "bot", byName: "CrossaderBot", from: "deck", at: 0, deal: true },
    });
    const j = journal();
    const снимок_ = снимок({ chairs, people: люди });
    // Каждая карта приходит СВОИМ патчем — как на настоящем столе.
    for (const chair of ["s1", "s2", "s1", "s2", "s1"]) j.take([карта(chair)], снимок_, 0);
    const all = j.all();
    expect(all.length, "одна строка на всю раздачу").toBe(1);
    expect(all[0]!.says).toBe("раздал");
    expect(all[0]!.deal).toEqual([{ hand: "Аня", n: 3 }, { hand: "Боря", n: 2 }]);
    expect(all[0]!.count, "и всего карт").toBe(5);
    expect(all[0]!.cards, "лиц карт в раздаче нет: свои видно в руке, чужие не положено").toBeUndefined();
  });

  /**
   * КРУПЬЕ ПРОСТО ВЫДАЛ ВСЕМ ПО КАРТЕ — ЭТО НЕ РАЗДАЧА, сколько бы карт подряд он ни выдал. Раздача
   * — команда стола, и признак её несёт след карты, а не форма движения.
   */
  it("карты из колоды по рукам БЕЗ признака раздачи остаются отдельными записями", () => {
    const chairs = [{ id: "s1", owner: "Аня" }, { id: "s2", owner: "Боря" }] as unknown as Snapshot["chairs"];
    const карта = (chair: string): Op => ({
      t: "move",
      card: { id: `c${Math.random()}`, face },
      from: { in: "deck", pile: MAIN_PILE },
      to: { in: "hand", chair, i: 0 },
      trail: { by: "bot", byName: "CrossaderBot", from: "deck", at: 0 },
    });
    const j = journal();
    const снимок_ = снимок({ chairs, people: [person("Аня"), person("Боря")] });
    for (const chair of ["s1", "s2", "s1"]) j.take([карта(chair)], снимок_, 0);
    expect(j.all().length, "три выдачи — три записи").toBe(3);
    expect(j.all().every((one) => one.deal === undefined)).toBe(true);
  });

  it("а карта из колоды через минуту — отдельное событие, а не хвост раздачи", () => {
    const chairs = [{ id: "s1", owner: "Аня" }] as unknown as Snapshot["chairs"];
    const карта = (): Op => ({
      t: "move",
      card: { id: `c${Math.random()}`, face },
      from: { in: "deck", pile: MAIN_PILE },
      to: { in: "hand", chair: "s1", i: 0 },
      trail: { by: "bot", byName: "CrossaderBot", from: "deck", at: 0, deal: true },
    });
    const j = journal();
    const снимок_ = снимок({ chairs, people: [person("Аня")] });
    j.take([карта()], снимок_, 0);
    j.take([карта()], снимок_, 60_000);
    expect(j.all().length).toBe(2);
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

  /**
   * ОДИН СПИСОК НА ОБА КОНЦА. Журнал печатает одни виды операций, а комната хранит для вошедшего
   * другие — и человек, обновивший страницу, увидит не то, что видели остальные. Живая партия
   * показала это наглядно: на сорок движений карт пришлось под сотню замков и прав, хвост забился
   * ими, и журнал открывался пустым при полном столе.
   */
  it("что журнал печатает, то комната и хранит — список общий", () => {
    const показан = (kind: string): boolean => TOLD_OPS.includes(kind);
    for (const kind of ["move", "turn", "join", "leave", "deck"]) {
      expect(показан(kind), `${kind} — часть рассказа`).toBe(true);
    }
    for (const kind of ["lock", "unlock", "pick", "admin", "play", "spot"]) {
      expect(показан(kind), `${kind} — служебное`).toBe(false);
      expect(deedOf({ t: kind } as unknown as Op, снимок(), 0), `${kind} в журнал не идёт`).toBe(null);
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
