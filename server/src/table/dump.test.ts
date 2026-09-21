import { describe, expect, it } from "vitest";
import { MAIN_PILE, type Person, type Snapshot } from "./contract.js";
import { deal } from "./deal.js";
import { deskOf } from "./desks.js";
import { Table } from "./table.js";

// СТОЛ ПЕРЕЖИВАЕТ ПРОЦЕСС. Слепок идёт через JSON — ровно так, как он лежит в базе.

const person = (key: string, bot = false): Person => ({ key, name: key, ink: "#fff", door: "guest", ...(bot ? { bot: true as const } : {}) });
const ok = (r: ReturnType<Table["act"]>) => {
  if ("refused" in r) throw new Error(`refused: ${r.refused}`);
};
const through = (t: Table, desk = deskOf("krest", () => null)) => Table.restore(JSON.parse(JSON.stringify(t.dump())), "Аня", desk);
/** Что лежит на столе — без того, что меняется от самого подъёма (версия, кто за столом, права). */
const lying = (s: Snapshot) => ({ piles: s.piles, felt: s.felt, chairs: s.chairs.map((c) => ({ ...c, owner: null })), rules: s.rules });

function played(): Table {
  const t = new Table(deal(), "Аня", deskOf("krest", () => null));
  t.join(person("Аня"));
  t.join(person("Боря"));
  t.seatBot(person("bot:игрок1", true));
  const top = () => t.seenBy("Аня").piles.find((p) => p.id === MAIN_PILE)!.cards.at(-1)!.id;
  const mine = t.seenBy("Аня").people.find((p) => p.key === "Аня")!.seat!;
  for (let i = 0; i < 3; i += 1) {
    const id = top();
    ok(t.act("Аня", { t: "grab", id }, 0));
    ok(t.act("Аня", { t: "drop", id, to: { in: "hand", chair: mine, i: 0 } }, 0));
  }
  const id = top();
  ok(t.act("Аня", { t: "grab", id }, 0));
  ok(t.act("Аня", { t: "drop", id, to: { in: "felt", x: 1, y: -1, up: true, angle: 30 } }, 0));
  ok(t.act("Аня", { t: "flag", chair: mine, flag: "lock", on: true }, 0));
  return t;
}

describe("слепок стола", () => {
  it("всё, что лежало, лежит там же: стопки, сукно, руки, флаги стульев, правила", () => {
    const t = played();
    const back = through(t);
    expect(lying(back.seenBy("Аня", true))).toEqual(lying(t.seenBy("Аня", true)));
  });

  it("человек возвращается на СВОЙ стул к СВОЕЙ руке, а не на новый", () => {
    const t = played();
    const before = t.seenBy("Аня").chairs.find((c) => c.owner === "Аня")!;
    const back = through(t);
    expect(back.seenBy("x").people.map((p) => p.key)).toEqual(["bot:игрок1"]);
    back.join(person("Аня"));
    const after = back.seenBy("Аня").chairs.find((c) => c.owner === "Аня")!;
    expect(after.id).toBe(before.id);
    expect(after.hand.map((h) => h.id)).toEqual(before.hand.map((h) => h.id));
    expect(after.lock).toBe(true);
    expect(back.seenBy("Аня").chairs).toHaveLength(t.seenBy("Аня").chairs.length);
  });

  it("то, что держали, не переживает процесс: ни блокировок, ни выделения", () => {
    const t = played();
    const id = t.seenBy("Аня").piles.find((p) => p.id === MAIN_PILE)!.cards.at(-1)!.id;
    ok(t.act("Боря", { t: "grab", id }, 0));
    const back = through(t);
    expect(back.seenBy("Аня").locks).toEqual({});
    back.join(person("Аня"));
    ok(back.act("Аня", { t: "grab", id }, 0));
  });

  it("версия растёт: клиент со старым снимком попросит новый", () => {
    const t = played();
    expect(through(t).version).toBe(t.version + 1);
  });

  it("слепок другого формата не поднимается — стол начнётся заново, а не развалится", () => {
    const t = played();
    expect(() => Table.restore({ ...t.dump(), format: 0 }, "Аня", deskOf("krest", () => null))).toThrow();
  });
});
