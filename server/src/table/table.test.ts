import { describe, expect, it } from "vitest";
import { LOCK_TTL_MS, type Intent, type Person } from "./contract.js";
import { applyPatch } from "./patch.js";
import { FELT_REACH, Table } from "./table.js";

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });
const cards = Array.from({ length: 5 }, (_, i) => ({ id: `c${i}`, face: { rank: String(i + 6), suit: "s" as const } }));

function seated() {
  const table = new Table(cards);
  table.join(person("a"));
  table.join(person("b"));
  return table;
}

const ops = (r: ReturnType<Table["act"]>) => {
  if ("refused" in r) throw new Error(`refused: ${r.refused}`);
  return r.ops;
};

describe("Table: блокировка", () => {
  it("взятое одним другой взять не может, пока первый не положил", () => {
    const t = seated();
    ops(t.act("a", { t: "grab", id: "c4" }, 0));
    expect(t.act("b", { t: "grab", id: "c4" }, 1)).toEqual({ refused: "locked" });
    ops(t.act("a", { t: "drop", id: "c4", to: { in: "hand", who: "a", i: 0 } }, 2));
    expect("ops" in t.act("b", { t: "grab", id: "c4" }, 3)).toBe(true);
  });

  it("положить можно только то, что держишь сам", () => {
    const t = seated();
    expect(t.act("b", { t: "drop", id: "c4", to: { in: "deck" } }, 0)).toEqual({ refused: "not-held" });
  });

  it("брошенная за кромку карта ложится на край сукна", () => {
    const t = seated();
    ops(t.act("a", { t: "grab", id: "c4" }, 0));
    const [move] = ops(t.act("a", { t: "drop", id: "c4", to: { in: "felt", x: 0, y: 16, up: false } }, 0));
    expect(move).toMatchObject({ to: { in: "felt", x: 0, y: FELT_REACH } });
  });

  it("с колоды берётся только верхняя", () => {
    const t = seated();
    expect(t.act("a", { t: "grab", id: "c0" }, 0)).toEqual({ refused: "not-top" });
  });

  it("непродлённая блокировка истекает, продлённая — нет", () => {
    const t = seated();
    ops(t.act("a", { t: "grab", id: "c4" }, 0));
    ops(t.act("a", { t: "hold", id: "c4" }, LOCK_TTL_MS - 1));
    expect(t.sweep(LOCK_TTL_MS + 1)).toEqual([]);
    expect(t.sweep(2 * LOCK_TTL_MS)).toEqual([{ t: "unlock", id: "c4" }]);
  });

  it("ушедший отпускает всё, что держал, а рука его ждёт", () => {
    const t = seated();
    ops(t.act("a", { t: "grab", id: "c4" }, 0));
    ops(t.act("a", { t: "drop", id: "c4", to: { in: "hand", who: "a", i: 0 } }, 0));
    ops(t.act("a", { t: "grab", id: "c3" }, 0));
    expect(t.leave("a")).toEqual([{ t: "unlock", id: "c3" }, { t: "leave", key: "a" }]);
    t.join(person("a"));
    expect(t.seenBy("a").hands.a).toEqual([{ id: "c4", face: cards[4].face }]);
  });
});

describe("Table: кто что видит", () => {
  it("свою руку — лицом, чужую и колоду — рубашкой, сукно — как легла", () => {
    const t = seated();
    ops(t.act("a", { t: "grab", id: "c4" }, 0));
    ops(t.act("a", { t: "drop", id: "c4", to: { in: "hand", who: "a", i: 0 } }, 0));
    ops(t.act("a", { t: "grab", id: "c3" }, 0));
    ops(t.act("a", { t: "drop", id: "c3", to: { in: "felt", x: 1, y: 2, up: true } }, 0));
    expect(t.seenBy("a").hands.a[0].face).toBeDefined();
    expect(t.seenBy("b").hands.a[0].face).toBeUndefined();
    expect(t.seenBy("b").deck.every((one) => one.face === undefined)).toBe(true);
    expect(t.seenBy("b").felt[0].face).toEqual(cards[3].face);
  });

  it("дифы режутся под зрителя: чужой ход в свою руку лица не несёт", () => {
    const t = seated();
    ops(t.act("a", { t: "grab", id: "c4" }, 0));
    const [move] = ops(t.act("a", { t: "drop", id: "c4", to: { in: "hand", who: "a", i: 0 } }, 0));
    expect((t.seenOp(move, "a") as { card: { face?: unknown } }).card.face).toBeDefined();
    expect((t.seenOp(move, "b") as { card: { face?: unknown } }).card.face).toBeUndefined();
  });
});

describe("патч клиента совпадает с сервером", () => {
  it("после каждого шага снимок + дифы == снимок, взятый целиком, для каждого зрителя", () => {
    const t = new Table(cards);
    const viewers = ["a", "b"];
    t.join(person("a"));
    t.join(person("b"));
    let seen = Object.fromEntries(viewers.map((v) => [v, t.seenBy(v)]));
    const run = (fresh: ReturnType<Table["join"]>) => {
      for (const v of viewers) {
        seen[v] = applyPatch(seen[v], { v: t.version, ops: fresh.map((op) => t.seenOp(op, v)) });
        expect(seen[v]).toEqual(t.seenBy(v));
      }
    };
    const script: [string, Intent][] = [
      ["a", { t: "grab", id: "c4" }],
      ["a", { t: "drop", id: "c4", to: { in: "hand", who: "a", i: 0 } }],
      ["b", { t: "grab", id: "c3" }],
      ["b", { t: "drop", id: "c3", to: { in: "hand", who: "a", i: 9 } }],
      ["a", { t: "flip" }],
      ["a", { t: "grab", id: "c3" }],
      ["a", { t: "drop", id: "c3", to: { in: "felt", x: 0.5, y: -1, up: true } }],
      ["b", { t: "grab", id: "c3" }],
      ["b", { t: "drop", id: "c3", to: { in: "hand", who: "b", i: 0 } }],
      ["a", { t: "grab", id: "c2" }],
    ];
    for (const [by, intent] of script) run(ops(t.act(by, intent, 0)));
    run(t.leave("b"));
  });
});
