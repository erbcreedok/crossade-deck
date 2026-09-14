import { describe, expect, it } from "vitest";
import { LOCK_TTL_MS, type Intent, type Op, type Person, type Snapshot } from "./contract.js";
import { applyPatch } from "./patch.js";
import { seatPoint } from "./ring.js";
import { FELT_REACH, Table } from "./table.js";

const person = (key: string): Person => ({ key, name: key, ink: "#fff", door: "guest" });
const cards = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, face: { rank: String(i + 6), suit: "s" as const } }));

const ops = (r: ReturnType<Table["act"]>) => {
  if ("refused" in r) throw new Error(`refused: ${r.refused}`);
  return r.ops;
};

/** Стол, за которым сидят `keys`; создатель — первый. */
function seated(...keys: string[]) {
  const table = new Table(cards, keys[0] ?? null);
  for (const key of keys) table.join(person(key));
  return table;
}
const seatOf = (t: Table, key: string) => t.seenBy(key).people.find((p) => p.key === key)!.seat!;
const chair = (t: Table, id: string, viewer = "x") => t.seenBy(viewer).chairs.find((c) => c.id === id);

/** Взять верхнюю карту колоды и положить в руку стула. */
function deal(t: Table, by: string, chairId: string) {
  const top = t.seenBy(by).deck.at(-1)!.id;
  ops(t.act(by, { t: "grab", id: top }, 0));
  ops(t.act(by, { t: "drop", id: top, to: { in: "hand", chair: chairId, i: 0 } }, 0));
  return top;
}

describe("Table: блокировка карт", () => {
  it("взятое одним другой взять не может, пока первый не положил", () => {
    const t = seated("a", "b");
    ops(t.act("a", { t: "grab", id: "c7" }, 0));
    expect(t.act("b", { t: "grab", id: "c7" }, 1)).toEqual({ refused: "locked" });
    ops(t.act("a", { t: "drop", id: "c7", to: { in: "hand", chair: seatOf(t, "a"), i: 0 } }, 2));
    expect("ops" in t.act("b", { t: "grab", id: "c6" }, 3)).toBe(true);
  });

  it("с колоды берётся только верхняя; положить можно только взятое", () => {
    const t = seated("a", "b");
    expect(t.act("a", { t: "grab", id: "c0" }, 0)).toEqual({ refused: "not-top" });
    expect(t.act("b", { t: "drop", id: "c7", to: { in: "deck" } }, 0)).toEqual({ refused: "not-held" });
  });

  it("непродлённая блокировка истекает", () => {
    const t = seated("a");
    ops(t.act("a", { t: "grab", id: "c7" }, 0));
    ops(t.act("a", { t: "hold", id: "c7" }, LOCK_TTL_MS - 1));
    expect(t.sweep(LOCK_TTL_MS + 1)).toEqual([]);
    expect(t.sweep(2 * LOCK_TTL_MS)).toEqual([{ t: "unlock", id: "c7" }]);
  });

  it("брошенная за кромку карта ложится на край сукна", () => {
    const t = seated("a");
    ops(t.act("a", { t: "grab", id: "c7" }, 0));
    const [move] = ops(t.act("a", { t: "drop", id: "c7", to: { in: "felt", x: 0, y: 16, up: false } }, 0));
    expect(move).toMatchObject({ to: { in: "felt", x: 0, y: FELT_REACH } });
  });
});

describe("Table: стулья", () => {
  it("каждый садится на свой стул, места — по пицце", () => {
    const t = seated("a", "b", "c");
    expect(t.seenBy("a").chairs.map((c) => c.angle)).toEqual([0, 180, 270]);
    expect(new Set(t.seenBy("a").people.map((p) => p.seat)).size).toBe(3);
  });

  it("ушёл с картами — стул остаётся с ними; вернулся — садится обратно и видит свои", () => {
    const t = seated("a", "b");
    const seat = seatOf(t, "b");
    const card = deal(t, "b", seat);
    t.leave("b");
    expect(chair(t, seat, "a")).toMatchObject({ owner: null, hand: [{ id: card }] });
    t.join(person("b"));
    expect(seatOf(t, "b")).toBe(seat);
    expect(chair(t, seat, "b")!.hand[0]!.face).toBeDefined();
  });

  it("ушёл без карт — стул уходит по правилу; вечный — стоит", () => {
    const t = seated("a", "b", "c");
    const b = seatOf(t, "b");
    const c = seatOf(t, "c");
    ops(t.act("c", { t: "flag", chair: c, flag: "forever", on: true }, 0));
    t.leave("b");
    t.leave("c");
    expect(chair(t, b)).toBeUndefined();
    expect(chair(t, c)).toMatchObject({ owner: null, forever: true });
  });

  it("правило выключено — пустой покинутый стул стоит; включили на лету — уходит", () => {
    const t = seated("a", "b");
    ops(t.act("a", { t: "rules", rules: { dropEmptyChairs: false } }, 0));
    const b = seatOf(t, "b");
    t.leave("b");
    expect(chair(t, b)).toBeDefined();
    const [rules, unchair] = ops(t.act("a", { t: "rules", rules: { dropEmptyChairs: true } }, 0));
    expect(rules).toEqual({ t: "rules", rules: { dropEmptyChairs: true } });
    expect(unchair).toEqual({ t: "unchair", id: b, felt: [] });
  });

  it("правило меняет только админ", () => {
    const t = seated("a", "b");
    expect(t.act("b", { t: "rules", rules: { dropEmptyChairs: false } }, 0)).toEqual({ refused: "not-yours" });
  });

  it("последнюю карту забрали с покинутого стула — стул уходит", () => {
    const t = seated("a", "b");
    const b = seatOf(t, "b");
    const card = deal(t, "b", b);
    t.leave("b");
    ops(t.act("a", { t: "grab", id: card }, 0));
    const done = ops(t.act("a", { t: "drop", id: card, to: { in: "hand", chair: seatOf(t, "a"), i: 0 } }, 0));
    expect(done.at(-1)).toEqual({ t: "unchair", id: b, felt: [] });
  });

  it("убранный с картами стул кладёт их закрытой стопкой на своё место", () => {
    const t = seated("a", "b");
    const b = seatOf(t, "b");
    deal(t, "b", b);
    deal(t, "b", b);
    // Стул с картами правило не трогает — убираем прямым путём, как это сделало бы будущее правило.
    const inner = t as unknown as { removeChair(c: unknown): Op[]; chairs: Map<string, unknown> };
    const [removed] = inner.removeChair(inner.chairs.get(b));
    const at = seatPoint(180);
    expect(removed).toMatchObject({ t: "unchair", id: b });
    const felt = (removed as { felt: { x: number; y: number; up: boolean }[] }).felt;
    expect(felt).toHaveLength(2);
    expect(felt.every((c) => !c.up && Math.abs(c.x - at.x) < 0.1 && Math.abs(c.y - at.y) < 0.1)).toBe(true);
    expect(t.seenBy("a").felt.map((c) => c.face)).toEqual([undefined, undefined]);
  });

  it("сесть на покинутый: карты стула — твои; старый стул с картами стал вечным", () => {
    const t = seated("a", "b");
    const a = seatOf(t, "a");
    const b = seatOf(t, "b");
    const mine = deal(t, "a", a);
    const theirs = deal(t, "b", b);
    t.leave("b");
    ops(t.act("a", { t: "sit", chair: b }, 0));
    expect(seatOf(t, "a")).toBe(b);
    expect(chair(t, b, "a")!.hand).toEqual([{ id: theirs, face: cards.find((c) => c.id === theirs)!.face }]);
    expect(chair(t, a, "a")).toMatchObject({ owner: null, forever: true, hand: [{ id: mine }] });
  });

  it("пересел со стула без карт — старый исчезает сразу, даже когда правило выключено", () => {
    const t = seated("a", "b");
    ops(t.act("a", { t: "rules", rules: { dropEmptyChairs: false } }, 0));
    const a = seatOf(t, "a");
    const b = seatOf(t, "b");
    t.leave("b");
    ops(t.act("a", { t: "sit", chair: b }, 0));
    expect(chair(t, a)).toBeUndefined();
  });

  it("на занятый стул не сесть", () => {
    const t = seated("a", "b");
    expect(t.act("a", { t: "sit", chair: seatOf(t, "b") }, 0)).toEqual({ refused: "taken" });
  });
});

describe("Table: флаги и права", () => {
  it("свои флаги — хозяин, чужие — только админ, покинутого — любой", () => {
    const t = seated("admin", "b", "c");
    const b = seatOf(t, "b");
    expect(t.act("c", { t: "flag", chair: b, flag: "pin", on: true }, 0)).toEqual({ refused: "not-yours" });
    expect("ops" in t.act("b", { t: "flag", chair: b, flag: "pin", on: true }, 0)).toBe(true);
    expect("ops" in t.act("admin", { t: "flag", chair: b, flag: "pin", on: false }, 0)).toBe(true);
    deal(t, "b", b); // с картами покинутый стул остаётся стоять
    t.leave("b");
    expect("ops" in t.act("c", { t: "flag", chair: b, flag: "hide", on: false }, 0)).toBe(true);
  });

  it("админ — создатель, пока он за столом", () => {
    const t = seated("admin", "b", "c");
    const b = seatOf(t, "b");
    expect(t.seenBy("b").admin).toBe("admin");
    t.leave("admin");
    expect(t.seenBy("b").admin).toBeNull();
    expect(t.act("c", { t: "flag", chair: b, flag: "pin", on: true }, 0)).toEqual({ refused: "not-yours" });
    t.join(person("admin"));
    expect(t.seenBy("b").admin).toBe("admin");
    expect("ops" in t.act("admin", { t: "flag", chair: b, flag: "pin", on: true }, 0)).toBe(true);
  });

  it("лок: чужие не берут и не кладут, хозяин — свободно, админ — только сняв лок", () => {
    const t = seated("admin", "b");
    const b = seatOf(t, "b");
    const card = deal(t, "b", b);
    ops(t.act("b", { t: "flag", chair: b, flag: "lock", on: true }, 0));
    expect(t.act("admin", { t: "grab", id: card }, 0)).toEqual({ refused: "chair-locked" });
    const top = t.seenBy("admin").deck.at(-1)!.id;
    ops(t.act("admin", { t: "grab", id: top }, 0));
    expect(t.act("admin", { t: "drop", id: top, to: { in: "hand", chair: b, i: 0 } }, 0)).toEqual({ refused: "chair-locked" });
    ops(t.act("admin", { t: "flag", chair: b, flag: "lock", on: false }, 0));
    ops(t.act("admin", { t: "drop", id: top, to: { in: "hand", chair: b, i: 0 } }, 0));
    ops(t.act("b", { t: "flag", chair: b, flag: "lock", on: true }, 0));
    expect("ops" in t.act("b", { t: "grab", id: card }, 0)).toBe(true);
  });

  it("с покинутого стула спадают лок и пин, скрыть остаётся", () => {
    const t = seated("a", "b");
    const b = seatOf(t, "b");
    deal(t, "b", b);
    for (const flag of ["lock", "pin"] as const) ops(t.act("b", { t: "flag", chair: b, flag, on: true }, 0));
    t.leave("b");
    expect(chair(t, b)).toMatchObject({ lock: false, pin: false, hide: true });
  });

  it("скрыть: по умолчанию другие видят рубашку; снял — видят как хозяин; хозяин видит всегда", () => {
    const t = seated("a", "b");
    const b = seatOf(t, "b");
    deal(t, "b", b);
    expect(chair(t, b, "b")!.hand[0]!.face).toBeDefined();
    expect(chair(t, b, "a")!.hand[0]!.face).toBeUndefined();
    const [shown] = ops(t.act("b", { t: "flag", chair: b, flag: "hide", on: false }, 0));
    expect((t.seenOp(shown!, "a") as { chair: { hand: { face?: unknown }[] } }).chair.hand[0]!.face).toBeDefined();
    t.leave("b");
    expect(chair(t, b, "a")!.hand[0]!.face).toBeDefined();
  });
});

describe("патч клиента совпадает с сервером", () => {
  it("после каждого шага снимок + дифы == снимок, взятый целиком, для каждого зрителя", () => {
    const viewers = ["a", "b", "c"];
    const t = new Table(cards, "a");
    const seen: Record<string, Snapshot> = Object.fromEntries(viewers.map((v) => [v, t.seenBy(v)]));
    const run = (fresh: Op[]) => {
      for (const v of viewers) {
        seen[v] = applyPatch(seen[v]!, { v: t.version, ops: fresh.map((op) => t.seenOp(op, v)) });
        expect(seen[v]).toEqual(t.seenBy(v));
      }
    };
    for (const v of viewers) run(t.join(person(v)));
    const a = seatOf(t, "a");
    const b = seatOf(t, "b");
    const step = (by: string, intent: Intent) => run(ops(t.act(by, intent, 0)));
    step("a", { t: "grab", id: "c7" });
    step("a", { t: "drop", id: "c7", to: { in: "hand", chair: a, i: 0 } });
    step("b", { t: "grab", id: "c6" });
    step("b", { t: "drop", id: "c6", to: { in: "hand", chair: b, i: 0 } });
    step("b", { t: "flag", chair: b, flag: "hide", on: false });
    step("a", { t: "flip" });
    step("a", { t: "grab", id: "c7" });
    step("a", { t: "drop", id: "c7", to: { in: "felt", x: 0.5, y: -1, up: true } });
    step("b", { t: "flag", chair: b, flag: "lock", on: true });
    run(t.leave("b"));
    step("c", { t: "sit", chair: b });
    step("c", { t: "flag", chair: b, flag: "hide", on: true });
    step("a", { t: "rules", rules: { dropEmptyChairs: false } });
    run(t.leave("a"));
    run(t.join(person("a")));
  });
});
