import { describe, expect, it } from "vitest";
import { DEFAULT_SPOT, type Person } from "./contract.js";
import { execute } from "./script.js";
import { FELT_REACH, Table } from "./table.js";

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });
const suits = ["s", "h", "d", "c"] as const;
const cards = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, face: { rank: String(6 + (i % 4)), suit: suits[(i * 3) % 4]! } }));

function seated(...keys: string[]) {
  const t = new Table(cards, keys[0] ?? null);
  for (const key of keys) t.join(person(key));
  return t;
}
const ok = (r: ReturnType<Table["act"]>) => {
  if ("refused" in r) throw new Error(`refused: ${r.refused}`);
  return r.ops;
};
const seatOf = (t: Table, key: string) => t.seenBy(key).people.find((p) => p.key === key)!.seat!;
/** Снять всю колоду на сукно. */
function empty(t: Table, by: string) {
  for (const { id } of [...t.seenBy(by).piles[0]!.cards].reverse()) {
    ok(t.act(by, { t: "grab", id }, 0));
    ok(t.act(by, { t: "drop", id, to: { in: "felt", x: 2, y: 2, up: false, angle: 0 } }, 0));
  }
}

describe("колода: место, вечность и действия из тултипа", () => {
  it("со старта колода посередине и вечная; переставить по сукну может любой, за кромку — на кромку", () => {
    const t = seated("a", "b");
    expect(t.seenBy("b").piles[0]).toMatchObject(DEFAULT_SPOT);
    expect(ok(t.act("b", { t: "deckMove", pile: "deck", x: 1.5, y: -2 }, 0))).toEqual([{ t: "spot", pile: "deck", top: true, spot: { x: 1.5, y: -2, forever: true, pin: false, lock: false, shut: false, angle: 0, below: [] } }]);
    ok(t.act("b", { t: "deckMove", pile: "deck", x: 100, y: 0 }, 0));
    expect(t.seenBy("a").piles[0]!.x).toBeCloseTo(FELT_REACH);
    expect(t.act("b", { t: "deckMove", pile: "deck", x: Number.NaN, y: 0 }, 0)).toEqual({ refused: "bad" });
  });

  it("поставленная колода — поверх лежавших карт и повёрнута, как у поставившего; снятая с-под неё карта ляжет сверху", () => {
    const t = seated("a");
    const lay = (x: number) => {
      const id = t.seenBy("a").piles[0]!.cards.at(-1)!.id;
      ok(t.act("a", { t: "grab", id }, 0));
      ok(t.act("a", { t: "drop", id, to: { in: "felt", x, y: 0, up: false, angle: 0 } }, 0));
      return id;
    };
    const one = lay(2);
    const two = lay(2.2);
    ok(t.act("a", { t: "deckMove", pile: "deck", x: 2, y: 0, angle: -270 }, 0));
    expect(t.seenBy("a").piles[0]!).toMatchObject({ x: 2, y: 0, angle: 90, below: [one, two] });
    ok(t.act("a", { t: "grab", id: two }, 0));
    ok(t.act("a", { t: "drop", id: two, to: { in: "felt", x: 2.1, y: 0, up: false, angle: 0 } }, 0));
    const three = lay(2.3);
    expect(t.seenBy("a").piles[0]!.below).toEqual([one]);
    expect(t.seenBy("a").felt.map((c) => c.id)).toEqual([one, two, three]);
    expect(t.act("a", { t: "deckMove", pile: "deck", x: 0, y: 0, angle: Number.NaN }, 0)).toEqual({ refused: "bad" });
  });

  it("без лока: из середины тянут, переворачивают и вставляют на место", () => {
    const t = seated("a", "b");
    const ids = () => t.seenBy("b").piles[0]!.cards.map((c) => c.id);
    ok(t.act("b", { t: "turn", id: "c2" }, 0));
    expect(t.seenBy("a").piles[0]!.cards.find((c) => c.id === "c2")).toMatchObject({ up: true, face: cards[2]!.face });
    ok(t.act("b", { t: "grab", id: "c2" }, 0));
    ok(t.act("b", { t: "drop", id: "c2", to: { in: "deck", pile: "deck", i: 6 } }, 0));
    expect(ids()).toEqual(["c0", "c1", "c3", "c4", "c5", "c6", "c2", "c7"]);
    // Из середины на сукно — как лежала: лицом, раз перевёрнута.
    ok(t.act("b", { t: "grab", id: "c4" }, 0));
    ok(t.act("b", { t: "drop", id: "c4", to: { in: "felt", x: 1, y: 1, up: true, angle: 0 } }, 0));
    expect(t.seenBy("a").felt[0]).toMatchObject({ id: "c4", up: false });
  });

  it("лок: только админ; держит и админа — верхняя доступна, сверху класть можно, остальное нельзя", () => {
    const t = seated("a", "b");
    const a = seatOf(t, "a");
    expect(t.act("b", { t: "deckGuard", pile: "deck", guard: "lock", on: true }, 0)).toEqual({ refused: "not-yours" });
    ok(t.act("a", { t: "deckGuard", pile: "deck", guard: "lock", on: true }, 0));
    for (const by of ["a", "b"]) {
      expect(t.act(by, { t: "grab", id: "c3" }, 0)).toEqual({ refused: "not-top" });
      expect(t.act(by, { t: "turn", id: "c3" }, 0)).toEqual({ refused: "not-top" });
      for (const how of ["shuffle", "sort", "flip"] as const) expect(t.act(by, { t: "deckDo", pile: "deck", how }, 0)).toEqual({ refused: "locked" });
    }
    ok(t.act("b", { t: "turn", id: "c7" }, 0));
    // Верхнюю взяли — вернуть в колоду нельзя (перестановка), в руку — можно.
    ok(t.act("b", { t: "grab", id: "c7" }, 0));
    expect(t.act("b", { t: "drop", id: "c7", to: { in: "deck", pile: "deck", i: 0 } }, 0)).toEqual({ refused: "locked" });
    ok(t.act("b", { t: "drop", id: "c7", to: { in: "hand", chair: a, i: 0 } }, 0));
    // Сверху класть можно — и место в колоде под локом не выбрать: наверх.
    ok(t.act("a", { t: "grab", id: "c7" }, 0));
    ok(t.act("a", { t: "drop", id: "c7", to: { in: "deck", pile: "deck", i: 0 } }, 0));
    expect(t.seenBy("a").piles[0]!.cards.at(-1)!.id).toBe("c7");
    ok(t.act("a", { t: "deckMove", pile: "deck", x: 1, y: 0 }, 0));
  });

  it("приёмка закрыта: только админ; ни положить, ни взять никому", () => {
    const t = seated("a", "b");
    const b = seatOf(t, "b");
    expect(t.act("b", { t: "deckGuard", pile: "deck", guard: "shut", on: true }, 0)).toEqual({ refused: "not-yours" });
    ok(t.act("a", { t: "deckGuard", pile: "deck", guard: "shut", on: true }, 0));
    // Взять нельзя — даже верхнюю, даже админу.
    for (const by of ["a", "b"]) expect(t.act(by, { t: "grab", id: "c7" }, 0)).toEqual({ refused: "locked" });
    ok(t.act("a", { t: "deckGuard", pile: "deck", guard: "shut", on: false }, 0));
    ok(t.act("b", { t: "grab", id: "c7" }, 0));
    ok(t.act("b", { t: "drop", id: "c7", to: { in: "hand", chair: b, i: 0 } }, 0));
    ok(t.act("a", { t: "deckGuard", pile: "deck", guard: "shut", on: true }, 0));
    // Положить нельзя никому.
    ok(t.act("b", { t: "grab", id: "c7" }, 0));
    expect(t.act("b", { t: "drop", id: "c7", to: { in: "deck", pile: "deck" } }, 0)).toEqual({ refused: "locked" });
    ok(t.act("b", { t: "release", id: "c7" }, 0));
    ok(t.act("a", { t: "grab", id: "c7" }, 0));
    expect(t.act("a", { t: "drop", id: "c7", to: { in: "deck", pile: "deck", i: 3 } }, 0)).toEqual({ refused: "locked" });
  });

  it("пин: приколоть может любой, приколотую не двигает никто, открепляет только админ", () => {
    const t = seated("a", "b");
    ok(t.act("b", { t: "deckPin", pile: "deck", on: true }, 0));
    expect(t.seenBy("a").piles[0]!.pin).toBe(true);
    expect(t.act("a", { t: "deckMove", pile: "deck", x: 1, y: 1 }, 0)).toEqual({ refused: "locked" });
    expect(t.act("b", { t: "deckPin", pile: "deck", on: false }, 0)).toEqual({ refused: "not-yours" });
    // Действия из тултипа пин не запрещает.
    ok(t.act("b", { t: "deckDo", pile: "deck", how: "flip" }, 0));
    ok(t.act("a", { t: "deckPin", pile: "deck", on: false }, 0));
    ok(t.act("b", { t: "deckMove", pile: "deck", x: 1, y: 1 }, 0));
    expect(t.seenBy("b").piles[0]!).toMatchObject({ x: 1, y: 1, pin: false });
  });

  it("вечность снимает любой; невечная опустевшая колода исчезает, и класть в неё больше некуда", () => {
    const t = seated("a", "b");
    ok(t.act("b", { t: "deckForever", pile: "deck", on: false }, 0));
    expect(t.seenBy("a").piles[0]!.forever).toBe(false);
    empty(t, "a");
    expect(t.seenBy("b").piles).toEqual([]);
    const id = t.seenBy("a").felt[0]!.id;
    ok(t.act("a", { t: "grab", id }, 0));
    expect(t.act("a", { t: "drop", id, to: { in: "deck", pile: "deck" } }, 0)).toEqual({ refused: "gone" });
    expect(t.act("a", { t: "deckDo", pile: "deck", how: "shuffle" }, 0)).toEqual({ refused: "gone" });
    expect(t.act("a", { t: "deckMove", pile: "deck", x: 0, y: 0 }, 0)).toEqual({ refused: "gone" });
  });

  it("вечная пустая стоит; сняли вечность с пустой — исчезла сразу", () => {
    const t = seated("a");
    empty(t, "a");
    expect(t.seenBy("a").piles[0]).toMatchObject(DEFAULT_SPOT);
    expect(ok(t.act("a", { t: "deckForever", pile: "deck", on: false }, 0))).toContainEqual({ t: "spot", pile: "deck", spot: null });
  });

  it("команда бота, которой нужна колода, ставит новую посередине", async () => {
    const t = seated("a");
    const a = seatOf(t, "a");
    ok(t.act("a", { t: "deckMove", pile: "deck", x: 3, y: 1 }, 0));
    ok(t.act("a", { t: "deckForever", pile: "deck", on: false }, 0));
    for (const { id } of [...t.seenBy("a").piles[0]!.cards].reverse()) {
      ok(t.act("a", { t: "grab", id }, 0));
      ok(t.act("a", { t: "drop", id, to: { in: "hand", chair: a, i: 0 } }, 0));
    }
    expect(t.seenBy("a").piles).toEqual([]);
    const spread: unknown[] = [];
    const back = t.seenBy("a").chairs[0]!.hand.map((c) => ({ t: "move" as const, id: c.id, to: { in: "deck" as const, pile: "deck" }, ms: 0 }));
    await execute(t, [...back, { t: "shuffle", ms: 0 }], "bot", { spread: (ops) => spread.push(...ops), carry: () => {}, sleep: async () => {}, now: () => 0 });
    expect(t.seenBy("a").piles[0]).toMatchObject(DEFAULT_SPOT);
    expect(t.seenBy("a").piles[0]!.cards).toHaveLength(8);
    expect(spread).toContainEqual({ t: "spot", pile: "deck", top: true, spot: DEFAULT_SPOT });
  });

  it("отсортировать: по масти, внутри — по номиналу; перевернуть: порядок наоборот и каждая карта другой стороной", () => {
    const t = seated("a", "b");
    ok(t.act("a", { t: "turn", id: "c7" }, 0));
    ok(t.act("a", { t: "deckDo", pile: "deck", how: "sort" }, 0));
    const order = t.layout().deck.map((id) => t.faceOf(id)!);
    const key = (f: { suit: string; rank: string }) => "shdc".indexOf(f.suit) * 100 + Number(f.rank);
    expect(order.map(key)).toEqual([...order.map(key)].sort((x, y) => x - y));
    // Перевёрнутая карта при сортировке стороной не меняется.
    expect(t.seenBy("b").piles[0]!.cards.find((c) => c.id === "c7")).toMatchObject({ up: true, face: cards[7]!.face });

    const before = t.seenBy("b").piles[0]!.cards;
    ok(t.act("b", { t: "deckDo", pile: "deck", how: "flip" }, 0));
    const after = t.seenBy("b").piles[0]!.cards;
    expect(after.map((c) => c.id)).toEqual(before.map((c) => c.id).reverse());
    // Была лицом — стала рубашкой, и наоборот: теперь лица видны у всех, кроме c7.
    expect(after.filter((c) => c.face).map((c) => c.id).sort()).toEqual(before.filter((c) => !c.face).map((c) => c.id).sort());
    expect(after.find((c) => c.id === "c7")).toEqual({ id: "c7" });
  });

  it("перемешать может любой; пока карту колоды держат — отказ", () => {
    const t = seated("a", "b");
    ok(t.act("b", { t: "deckDo", pile: "deck", how: "shuffle" }, 0));
    expect(t.seenBy("a").piles[0]!.shuffles).toBe(1);
    const top = t.seenBy("a").piles[0]!.cards.at(-1)!.id;
    ok(t.act("a", { t: "grab", id: top }, 0));
    for (const how of ["shuffle", "sort", "flip"] as const) expect(t.act("b", { t: "deckDo", pile: "deck", how }, 0)).toEqual({ refused: "locked" });
    expect(t.act("b", { t: "deckDo", pile: "deck", how: "nope" as "sort" }, 0)).toEqual({ refused: "bad" });
  });
});

describe("приёмка в стопку: сторона упавшей карты", () => {
  /** Взять верхнюю, положить на сукно стороной `up`, взять снова — и отпустить в колоду. */
  function backToDeck(t: Table, by: string, up: boolean) {
    const id = t.seenBy(by).piles[0]!.cards.at(-1)!.id;
    ok(t.act(by, { t: "grab", id }, 0));
    ok(t.act(by, { t: "drop", id, to: { in: "felt", x: 3, y: 0, up: false, angle: 0 } }, 0));
    if (up) ok(t.act(by, { t: "turn", id }, 0));
    ok(t.act(by, { t: "grab", id }, 0));
    ok(t.act(by, { t: "drop", id, to: { in: "deck", pile: "deck" } }, 0));
    return t.seenBy(by).piles[0]!.cards.find((c) => c.id === id)!;
  }

  it("вся стопка рубашкой — карта, которую несли лицом, ложится рубашкой", () => {
    const t = seated("a");
    expect(backToDeck(t, "a", true).up).toBeUndefined();
  });

  it("вся стопка лицом — карта, которую несли рубашкой, ложится лицом", () => {
    const t = seated("a");
    ok(t.act("a", { t: "deckDo", pile: "deck", how: "flip" }, 0));
    expect(backToDeck(t, "a", false).up).toBe(true);
  });

  it("стопка вперемешку — карта ложится, как её видел несущий", () => {
    for (const up of [true, false]) {
      const t = seated("a");
      ok(t.act("a", { t: "deckDo", pile: "deck", how: "flip" }, 0));
      // Верхнюю — на сукно, новую верхнюю — рубашкой: в колоде лица и одна рубашка.
      const id = t.seenBy("a").piles[0]!.cards.at(-1)!.id;
      ok(t.act("a", { t: "grab", id }, 0));
      ok(t.act("a", { t: "drop", id, to: { in: "felt", x: 3, y: 0, up: false, angle: 0 } }, 0));
      ok(t.act("a", { t: "turn", id: t.seenBy("a").piles[0]!.cards.at(-1)!.id }, 0));
      // С перевёрнутой колоды карта легла на сукно лицом.
      if (!up) ok(t.act("a", { t: "turn", id }, 0));
      ok(t.act("a", { t: "grab", id }, 0));
      ok(t.act("a", { t: "drop", id, to: { in: "deck", pile: "deck" } }, 0));
      expect(t.seenBy("a").piles[0]!.cards.find((c) => c.id === id)!.up === true).toBe(up);
    }
  });
});

describe("несколько стопок", () => {
  const pileOf = (t: Table, id: string) => t.seenBy("a").piles.find((p) => p.id === id);
  /** Снять верхнюю колоды на сукно. */
  const lay = (t: Table, x: number, up = false) => {
    const id = t.seenBy("a").piles[0]!.cards.at(-1)!.id;
    ok(t.act("a", { t: "grab", id }, 0));
    ok(t.act("a", { t: "drop", id, to: { in: "felt", x, y: 0, up: false, angle: 0 } }, 0));
    if (up) ok(t.act("a", { t: "turn", id }, 0));
    return id;
  };

  it("сборка в новую стопку: карты с сукна, из руки и колоды — по порядку снизу вверх, стопка не вечная и сверху", () => {
    const t = seated("a", "b");
    const one = lay(t, 1, true);
    const two = lay(t, 2);
    ok(t.act("a", { t: "grab", id: "c5" }, 0));
    ok(t.act("a", { t: "drop", id: "c5", to: { in: "hand", chair: seatOf(t, "b"), i: 0 } }, 0));
    const ops = ok(t.act("a", { t: "gather", ids: [one, "c5", two, "c0"], side: "keep", to: { x: 3, y: 1, angle: 45 } }, 5));
    const piles = t.seenBy("a").piles;
    expect(piles.map((p) => p.id)).toEqual(["deck", "p1"]);
    expect(piles[1]).toMatchObject({ x: 3, y: 1, angle: 45, forever: false, below: [] });
    expect(piles[1]!.cards.map((c) => c.id)).toEqual([one, "c5", two, "c0"]);
    // Как лежали: открытая с сукна — лицом, остальные рубашкой (чужая рука скрыта, колода рубашкой).
    expect(piles[1]!.cards.map((c) => c.up === true)).toEqual([true, false, false, false]);
    expect(ops[0]).toMatchObject({ t: "spot", pile: "p1", top: true });
    expect(t.seenBy("a").felt).toEqual([]);
    expect(t.seenBy("b").chairs.find((c) => c.id === seatOf(t, "b"))!.hand).toEqual([]);
  });

  it("стороны: все рубашкой или все лицом; в стоящую стопку — наверх; сторона свежей стопки видна в снимке", () => {
    const t = seated("a");
    const one = lay(t, 1, true);
    const two = lay(t, 2);
    ok(t.act("a", { t: "gather", ids: [one, two], side: "down", to: { x: 0, y: 3, angle: 0 } }, 0));
    expect(pileOf(t, "p1")!.cards.every((c) => !c.up && !c.face)).toBe(true);
    ok(t.act("a", { t: "gather", ids: ["c0", "c1"], side: "up", to: { pile: "p1" } }, 0));
    expect(pileOf(t, "p1")!.cards.map((c) => c.id)).toEqual([one, two, "c0", "c1"]);
    expect(pileOf(t, "p1")!.cards.slice(2)).toEqual([{ id: "c0", face: cards[0]!.face, up: true }, { id: "c1", face: cards[1]!.face, up: true }]);
  });

  it("чего взять нельзя — остаётся: чужое в пальце, середина залоченной стопки, стопка с закрытой приёмкой; не принимает — отказ", () => {
    const t = seated("a", "b");
    const one = lay(t, 1);
    ok(t.act("b", { t: "grab", id: "c6" }, 0));
    ok(t.act("a", { t: "deckGuard", pile: "deck", guard: "lock", on: true }, 0));
    // Верхняя (c6) у b в пальце, c3 — середина под локом: собралась одна карта с сукна.
    ok(t.act("a", { t: "gather", ids: ["c6", "c3", one], side: "keep", to: { x: 2, y: 2, angle: 0 } }, 0));
    expect(pileOf(t, "p1")!.cards.map((c) => c.id)).toEqual([one]);
    expect(pileOf(t, "deck")!.cards.map((c) => c.id)).toContain("c3");
    // Ничего не собрать — отказ, и пустая стопка не встаёт.
    expect(t.act("a", { t: "gather", ids: ["c6", "c3"], side: "keep", to: { x: 2, y: 2, angle: 0 } }, 0)).toEqual({ refused: "bad" });
    expect(t.seenBy("a").piles).toHaveLength(2);
    ok(t.act("a", { t: "deckGuard", pile: "p1", guard: "shut", on: true }, 0));
    ok(t.act("b", { t: "release", id: "c6" }, 0));
    ok(t.act("a", { t: "deckGuard", pile: "deck", guard: "lock", on: false }, 0));
    expect(t.act("a", { t: "gather", ids: ["c6"], side: "keep", to: { pile: "p1" } }, 0)).toEqual({ refused: "locked" });
    // Из стопки с закрытой приёмкой не собрать.
    expect(t.act("b", { t: "gather", ids: [one], side: "keep", to: { x: 0, y: 0, angle: 0 } }, 0)).toEqual({ refused: "bad" });
  });

  it("опустевшая стопка игрока уходит со стола; колоду бот собирает и из стопок", async () => {
    const t = seated("a");
    const one = lay(t, 1);
    ok(t.act("a", { t: "gather", ids: [one], side: "keep", to: { x: 2, y: 0, angle: 0 } }, 0));
    ok(t.act("a", { t: "grab", id: one }, 0));
    const ops = ok(t.act("a", { t: "drop", id: one, to: { in: "felt", x: 0, y: 2, up: false, angle: 0 } }, 0));
    expect(ops).toContainEqual({ t: "spot", pile: "p1", spot: null });
    expect(t.seenBy("a").piles.map((p) => p.id)).toEqual(["deck"]);
    ok(t.act("a", { t: "gather", ids: [one, "c0"], side: "keep", to: { x: 2, y: 0, angle: 0 } }, 0));
    expect(t.act("a", { t: "drop", id: one, to: { in: "deck", pile: "nope" } }, 0)).toEqual({ refused: "not-held" });
    const { plan } = await import("./script.js");
    const p = plan(t, { t: "collect" }, [{ key: "a", name: "a" }], "a");
    if ("error" in p) throw new Error(p.error);
    await execute(t, p.steps, "a", { spread: () => {}, carry: () => {}, sleep: async () => {}, now: () => 0 });
    expect(t.seenBy("a").piles.map((p) => [p.id, p.cards.length])).toEqual([["deck", 8]]);
  });

  it("действия стопки — по её id: перевернуть, пин и перенос одной не трогают другую; перенесённая встаёт сверху", () => {
    const t = seated("a");
    ok(t.act("a", { t: "gather", ids: ["c0", "c1"], side: "keep", to: { x: 2, y: 0, angle: 0 } }, 0));
    ok(t.act("a", { t: "deckDo", pile: "p1", how: "flip" }, 0));
    expect(pileOf(t, "p1")!.cards.map((c) => c.id)).toEqual(["c1", "c0"]);
    expect(pileOf(t, "deck")!.cards.some((c) => c.up)).toBe(false);
    ok(t.act("a", { t: "deckPin", pile: "p1", on: true }, 0));
    expect(t.act("a", { t: "deckMove", pile: "p1", x: 0, y: 0 }, 0)).toEqual({ refused: "locked" });
    ok(t.act("a", { t: "deckMove", pile: "deck", x: 2, y: 0 }, 0));
    expect(t.seenBy("a").piles.map((p) => p.id)).toEqual(["p1", "deck"]);
    expect(t.act("a", { t: "gather", ids: ["c2"], side: "sideways" as "up", to: { pile: "p1" } }, 0)).toEqual({ refused: "bad" });
    expect(t.act("a", { t: "gather", ids: ["c2"], side: "up", to: { pile: "zzz" } }, 0)).toEqual({ refused: "gone" });
  });
});

describe("выделение лассо — лок", () => {
  it("выделить может любой; чужое выделенное не выделить, не взять, не перевернуть и не собрать; своё — можно", () => {
    const t = seated("a", "b");
    expect(ok(t.act("a", { t: "pick", ids: ["c7", "c3", "nope"], on: true }, 0))).toEqual([{ t: "pick", ids: ["c7", "c3"], by: "a" }]);
    expect(t.seenBy("b").picks).toEqual({ c7: "a", c3: "a" });
    // Чужое не перевыделить: пропускается молча.
    expect(ok(t.act("b", { t: "pick", ids: ["c7", "c6"], on: true }, 0))).toEqual([{ t: "pick", ids: ["c6"], by: "b" }]);
    for (const intent of [{ t: "grab", id: "c7" }, { t: "turn", id: "c7" }] as const) expect(t.act("b", intent, 0)).toEqual({ refused: "locked" });
    expect(t.act("b", { t: "gather", ids: ["c7", "c3"], side: "keep", to: { x: 1, y: 1, angle: 0 } }, 0)).toEqual({ refused: "bad" });
    // Чужое выделение в стопке держит и действия стопки.
    expect(t.act("b", { t: "deckDo", pile: "deck", how: "sort" }, 0)).toEqual({ refused: "locked" });
    ok(t.act("a", { t: "grab", id: "c7" }, 0));
    ok(t.act("a", { t: "drop", id: "c7", to: { in: "felt", x: 1, y: 1, up: false, angle: 0 } }, 0));
    // Снять чужое нельзя, своё — можно.
    expect(ok(t.act("b", { t: "pick", ids: ["c7"], on: false }, 0))).toEqual([]);
    expect(ok(t.act("a", { t: "pick", ids: ["c7"], on: false }, 0))).toEqual([{ t: "pick", ids: ["c7"], by: null }]);
    ok(t.act("b", { t: "grab", id: "c7" }, 0));
    // Карту в чужом пальце не выделить.
    expect(t.act("a", { t: "pick", ids: ["c7"], on: true }, 0)).toEqual({ refused: "locked" });
  });

  it("снять всё своё; ушёл — выделение снято; перемешивание снимает выделение с карт стопки", () => {
    const t = seated("a", "b");
    ok(t.act("a", { t: "pick", ids: ["c1", "c2"], on: true }, 0));
    ok(t.act("b", { t: "pick", ids: ["c5"], on: true }, 0));
    expect(ok(t.act("a", { t: "unpick" }, 0))).toEqual([{ t: "pick", ids: ["c1", "c2"], by: null }]);
    expect(t.seenBy("a").picks).toEqual({ c5: "b" });
    expect(t.leave("b")).toContainEqual({ t: "pick", ids: ["c5"], by: null });
    ok(t.act("a", { t: "pick", ids: ["c0"], on: true }, 0));
    ok(t.act("a", { t: "deckDo", pile: "deck", how: "shuffle" }, 0));
    expect(t.seenBy("a").picks).toEqual({});
    expect(t.act("a", { t: "pick", ids: "c0" as unknown as string[], on: true }, 0)).toEqual({ refused: "bad" });
  });
});
