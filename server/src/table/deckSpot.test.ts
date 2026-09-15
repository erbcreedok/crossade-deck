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
  for (const { id } of [...t.seenBy(by).deck].reverse()) {
    ok(t.act(by, { t: "grab", id }, 0));
    ok(t.act(by, { t: "drop", id, to: { in: "felt", x: 2, y: 2, up: false, angle: 0 } }, 0));
  }
}

describe("колода: место, вечность и действия из тултипа", () => {
  it("со старта колода посередине и вечная; переставить по сукну может любой, за кромку — на кромку", () => {
    const t = seated("a", "b");
    expect(t.seenBy("b").spot).toEqual(DEFAULT_SPOT);
    expect(ok(t.act("b", { t: "deckMove", x: 1.5, y: -2 }, 0))).toEqual([{ t: "spot", spot: { x: 1.5, y: -2, forever: true } }]);
    ok(t.act("b", { t: "deckMove", x: 100, y: 0 }, 0));
    expect(t.seenBy("a").spot!.x).toBeCloseTo(FELT_REACH);
    expect(t.act("b", { t: "deckMove", x: Number.NaN, y: 0 }, 0)).toEqual({ refused: "bad" });
  });

  it("вечность снимает любой; невечная опустевшая колода исчезает, и класть в неё больше некуда", () => {
    const t = seated("a", "b");
    ok(t.act("b", { t: "deckForever", on: false }, 0));
    expect(t.seenBy("a").spot!.forever).toBe(false);
    empty(t, "a");
    expect(t.seenBy("b").spot).toBeNull();
    const id = t.seenBy("a").felt[0]!.id;
    ok(t.act("a", { t: "grab", id }, 0));
    expect(t.act("a", { t: "drop", id, to: { in: "deck" } }, 0)).toEqual({ refused: "gone" });
    expect(t.act("a", { t: "deckDo", how: "shuffle" }, 0)).toEqual({ refused: "gone" });
    expect(t.act("a", { t: "deckMove", x: 0, y: 0 }, 0)).toEqual({ refused: "gone" });
  });

  it("вечная пустая стоит; сняли вечность с пустой — исчезла сразу", () => {
    const t = seated("a");
    empty(t, "a");
    expect(t.seenBy("a").spot).toEqual(DEFAULT_SPOT);
    expect(ok(t.act("a", { t: "deckForever", on: false }, 0))).toContainEqual({ t: "spot", spot: null });
  });

  it("команда бота, которой нужна колода, ставит новую посередине", async () => {
    const t = seated("a");
    const a = seatOf(t, "a");
    ok(t.act("a", { t: "deckMove", x: 3, y: 1 }, 0));
    ok(t.act("a", { t: "deckForever", on: false }, 0));
    for (const { id } of [...t.seenBy("a").deck].reverse()) {
      ok(t.act("a", { t: "grab", id }, 0));
      ok(t.act("a", { t: "drop", id, to: { in: "hand", chair: a, i: 0 } }, 0));
    }
    expect(t.seenBy("a").spot).toBeNull();
    const spread: unknown[] = [];
    const back = t.seenBy("a").chairs[0]!.hand.map((c) => ({ t: "move" as const, id: c.id, to: { in: "deck" as const }, ms: 0 }));
    await execute(t, [...back, { t: "shuffle", ms: 0 }], "bot", { spread: (ops) => spread.push(...ops), carry: () => {}, sleep: async () => {}, now: () => 0 });
    expect(t.seenBy("a").spot).toEqual(DEFAULT_SPOT);
    expect(t.seenBy("a").deck).toHaveLength(8);
    expect(spread).toContainEqual({ t: "spot", spot: DEFAULT_SPOT });
  });

  it("отсортировать: по масти, внутри — по номиналу; перевернуть: порядок наоборот и каждая карта другой стороной", () => {
    const t = seated("a", "b");
    ok(t.act("a", { t: "turn", id: "c7" }, 0));
    ok(t.act("a", { t: "deckDo", how: "sort" }, 0));
    const order = t.layout().deck.map((id) => t.faceOf(id)!);
    const key = (f: { suit: string; rank: string }) => "shdc".indexOf(f.suit) * 100 + Number(f.rank);
    expect(order.map(key)).toEqual([...order.map(key)].sort((x, y) => x - y));
    // Перевёрнутая карта при сортировке стороной не меняется.
    expect(t.seenBy("b").deck.find((c) => c.id === "c7")).toMatchObject({ up: true, face: cards[7]!.face });

    const before = t.seenBy("b").deck;
    ok(t.act("b", { t: "deckDo", how: "flip" }, 0));
    const after = t.seenBy("b").deck;
    expect(after.map((c) => c.id)).toEqual(before.map((c) => c.id).reverse());
    // Была лицом — стала рубашкой, и наоборот: теперь лица видны у всех, кроме c7.
    expect(after.filter((c) => c.face).map((c) => c.id).sort()).toEqual(before.filter((c) => !c.face).map((c) => c.id).sort());
    expect(after.find((c) => c.id === "c7")).toEqual({ id: "c7" });
  });

  it("перемешать может любой; пока карту колоды держат — отказ", () => {
    const t = seated("a", "b");
    ok(t.act("b", { t: "deckDo", how: "shuffle" }, 0));
    expect(t.seenBy("a").shuffles).toBe(1);
    const top = t.seenBy("a").deck.at(-1)!.id;
    ok(t.act("a", { t: "grab", id: top }, 0));
    for (const how of ["shuffle", "sort", "flip"] as const) expect(t.act("b", { t: "deckDo", how }, 0)).toEqual({ refused: "locked" });
    expect(t.act("b", { t: "deckDo", how: "nope" as "sort" }, 0)).toEqual({ refused: "bad" });
  });
});
