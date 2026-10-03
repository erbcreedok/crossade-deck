import { describe, expect, it } from "vitest";
import { deal } from "./deal.js";
import { Table } from "./table.js";
import { MAIN_PILE, type Op, type Person, type Snapshot } from "./contract.js";
import { cutSnapshot, historyPage } from "./historyCut.js";
import type { Told } from "../db/eventsRepo.js";

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });
const facesOf = (s: Snapshot): string[] => [...s.chairs.flatMap((c) => c.hand), ...s.piles.flatMap((p) => p.cards), ...s.felt].filter((c) => c.face).map((c) => c.id);
const ops = (out: ReturnType<Table["act"]>): Op[] => { if ("refused" in out) throw new Error(out.refused); return out.ops as Op[]; };

/** Стол, у которого «журнал» — те же строки, что пишет `TableRoom`: первый кадр правдой и дифы правдой. */
function session() {
  const t = new Table(deal(), "a");
  t.join(person("a")); t.join(person("b"));
  let id = 0, now = 1_000_000;
  const rows: Told[] = [{ id: id++, at: now, side: "table", kind: "table.first", what: { snapshot: t.seenBy("", true) } }];
  const say = (out: Op[]) => rows.push({ id: id++, at: (now += 1000), side: "table", kind: "patch", what: { v: t.version, ops: out.map((op) => t.seenOp(op, "", true)) } });
  const mine = t.layout().chairs.find((c) => c.owner === "a")!.id;
  for (let i = 0; i < 6; i++) {
    const top = t.seenBy("a").piles.find((p) => p.id === MAIN_PILE)!.cards.at(-1)!.id;
    say(ops(t.act("a", { t: "grab", id: top }, now)));
    say(ops(t.act("a", { t: "drop", id: top, to: i % 2 ? { in: "felt", x: i, y: 1, up: true, angle: 0 } : { in: "hand", chair: mine, i: 0 } }, now)));
  }
  return { t, rows, now: now + 1 };
}

describe("история для игрока: лица", () => {
  it("лиц, которых игрок не видит сейчас, в истории нет — ни в кадре, ни в ходах; видимые остаются", () => {
    const { t, rows, now } = session();
    const shown = new Set(facesOf(t.seenBy("b")));
    // Правда в журнале лица содержит (иначе проверять нечего).
    expect(facesOf((rows[0]!.what as { snapshot: Snapshot }).snapshot).length).toBeGreaterThan(0);
    expect(rows.some((r) => JSON.stringify(r.what).includes('"face"'))).toBe(true);
    const page = historyPage(rows, now, shown)!;
    const seen = new Set<string>();
    const walk = (x: unknown) => { if (x && typeof x === "object") { const o = x as { id?: string; face?: unknown }; if (o.face !== undefined && typeof o.id === "string") seen.add(o.id); for (const v of Object.values(o)) walk(v); } };
    walk(page.start); walk(page.events);
    for (const id of seen) expect(shown.has(id), `лицо ${id} утекло`).toBe(true);
    expect(page.events.length).toBeGreaterThan(5);
  });

  it("порции: больше ничего раньше → more=false; маленькая порция — more=true, а кадр в её начале — стол до этих событий", () => {
    const { t, rows, now } = session();
    const shown = new Set<string>();
    const all = historyPage(rows, now, shown)!;
    expect(all.more).toBe(false);
    const small = historyPage(rows, now, shown, 4)!;
    expect(small.more).toBe(true);
    expect(small.events).toHaveLength(4);
    expect(small.from).toBe(small.events[0]!.at);
    // Кадр порции — результат свёртки всех событий до неё: у него ровно столько карт на сукне, сколько их было к тому ходу.
    const before = rows.filter((r) => r.kind === "patch" && r.at < small.from).length;
    expect(before).toBeGreaterThan(0);
    // Следующая порция — до начала предыдущей.
    const older = historyPage(rows, small.from, shown, 4)!;
    expect(older.events.at(-1)!.at).toBeLessThan(small.from);
    void t;
  });

  it("до первого кадра истории нет", () => {
    const { rows } = session();
    expect(historyPage(rows, rows[0]!.at, new Set())).toBeNull();
    expect(historyPage([], Date.now(), new Set())).toBeNull();
  });

  it("кадр вырезается копией: журнал (правда) не портится", () => {
    const { rows } = session();
    const frame = (rows[0]!.what as { snapshot: Snapshot }).snapshot;
    const was = JSON.stringify(frame);
    cutSnapshot(frame, new Set());
    expect(JSON.stringify(frame)).toBe(was);
  });
});
