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
  const top = t.seenBy(by).piles[0]!.cards.at(-1)!.id;
  ops(t.act(by, { t: "grab", id: top }, 0));
  ops(t.act(by, { t: "drop", id: top, to: { in: "hand", chair: chairId, i: 0 } }, 0));
  return top;
}

describe("Table: переворот карты", () => {
  const handOf = (t: Table, viewer: string, id: string) => t.seenBy(viewer).chairs.find((c) => c.id === id)!.hand;

  it("в руке: перевёрнутая — рубашкой к хозяину и лицом наружу; скрытый стул — рубашки всем", () => {
    const t = seated("a", "b");
    const a = seatOf(t, "a");
    const card = deal(t, "a", a);
    deal(t, "a", a);
    ops(t.act("a", { t: "turn", id: card }, 5));
    // Скрыт (по умолчанию): лицо не видно никому — ни хозяину, ни другим.
    expect(handOf(t, "a", a).find((c) => c.id === card)).toEqual({ id: card, up: true });
    expect(handOf(t, "b", a).every((c) => !c.face)).toBe(true);
    expect(handOf(t, "a", a).find((c) => c.id !== card)!.face).toBeDefined();
    // Не скрыт: другим лица приходят все — худ рисует неперевёрнутые, стул — перевёрнутые.
    ops(t.act("a", { t: "flag", chair: a, flag: "hide", on: false }, 6));
    expect(handOf(t, "b", a).every((c) => c.face)).toBe(true);
    expect(handOf(t, "b", a).find((c) => c.id === card)!.up).toBe(true);
    expect(handOf(t, "a", a).find((c) => c.id === card)!.face).toBeDefined();
    ops(t.act("a", { t: "turn", id: card }, 7));
    expect(handOf(t, "b", a).find((c) => c.id === card)!.up).toBeUndefined();
  });

  it("можно там же, где можно взять: чужой лок, не верхняя колоды, закрытый стул — отказ", () => {
    const t = seated("a", "b");
    const b = seatOf(t, "b");
    ops(t.act("a", { t: "deckGuard", pile: "deck", guard: "lock", on: true }, 0));
    expect(t.act("a", { t: "turn", id: "c0" }, 0)).toEqual({ refused: "not-top" });
    ops(t.act("a", { t: "deckGuard", pile: "deck", guard: "lock", on: false }, 0));
    ops(t.act("b", { t: "grab", id: "c7" }, 0));
    expect(t.act("a", { t: "turn", id: "c7" }, 0)).toEqual({ refused: "locked" });
    ops(t.act("b", { t: "drop", id: "c7", to: { in: "hand", chair: b, i: 0 } }, 0));
    ops(t.act("b", { t: "flag", chair: b, flag: "lock", on: true }, 0));
    expect(t.act("a", { t: "turn", id: "c7" }, 0)).toEqual({ refused: "chair-locked" });
    expect("ops" in t.act("b", { t: "turn", id: "c7" }, 0)).toBe(true);
  });

  it("колода: верхняя лицом вверх видна всем; на сукне переворот меняет только сторону", () => {
    const t = seated("a", "b");
    ops(t.act("a", { t: "turn", id: "c7" }, 0));
    expect(t.seenBy("b").piles[0]!.cards.at(-1)).toEqual({ id: "c7", face: cards[7]!.face, up: true });
    ops(t.act("a", { t: "grab", id: "c7" }, 0));
    ops(t.act("a", { t: "drop", id: "c7", to: { in: "felt", x: 1, y: 2, up: false, angle: 30 } }, 0));
    // С колоды — как лежала: лицом вверх.
    expect(t.seenBy("b").felt[0]).toMatchObject({ id: "c7", up: true, x: 1, y: 2, angle: 30, face: cards[7]!.face });
    ops(t.act("b", { t: "turn", id: "c7" }, 0));
    expect(t.seenBy("b").felt[0]).toEqual({ id: "c7", up: false, x: 1, y: 2, angle: 30 });
  });

  it("след: перевернул я, а «откуда» — из руки того, кто положил", () => {
    const t = seated("a", "b");
    const b = seatOf(t, "b");
    const card = deal(t, "b", b);
    ops(t.act("b", { t: "grab", id: card }, 0));
    ops(t.act("b", { t: "drop", id: card, to: { in: "felt", x: 0, y: 0, up: true, angle: 0 } }, 0));
    ops(t.act("a", { t: "turn", id: card }, 9));
    expect(t.seenBy("a").trails[card]).toMatchObject({ by: "a", from: "hand", hand: "b", at: 9 });
  });

  it("сторона при переносе: в руку — лицом к хозяину; из руки на сукно — как видно в худе несущему", () => {
    const t = seated("a", "b");
    const a = seatOf(t, "a");
    const card = deal(t, "a", a);
    ops(t.act("a", { t: "grab", id: card }, 0));
    ops(t.act("a", { t: "drop", id: card, to: { in: "felt", x: 0, y: 0, up: false, angle: 0 } }, 0));
    expect(t.seenBy("b").felt[0]!.up).toBe(true);
    ops(t.act("a", { t: "grab", id: card }, 0));
    ops(t.act("a", { t: "drop", id: card, to: { in: "hand", chair: a, i: 0 } }, 0));
    ops(t.act("a", { t: "turn", id: card }, 0));
    ops(t.act("a", { t: "grab", id: card }, 0));
    ops(t.act("a", { t: "drop", id: card, to: { in: "felt", x: 0, y: 0, up: true, angle: 0 } }, 0));
    expect(t.seenBy("b").felt[0]!.up).toBe(false);
    // Со стола в руку — перевёрнутость сброшена.
    ops(t.act("a", { t: "turn", id: card }, 0));
    ops(t.act("a", { t: "grab", id: card }, 0));
    ops(t.act("a", { t: "drop", id: card, to: { in: "hand", chair: a, i: 0 } }, 0));
    expect(handOf(t, "a", a)[0]).toEqual({ id: card, face: expect.anything() });
    // Из скрытой чужой руки — рубашкой.
    ops(t.act("b", { t: "grab", id: card }, 0));
    ops(t.act("b", { t: "drop", id: card, to: { in: "felt", x: 0, y: 0, up: true, angle: 0 } }, 0));
    expect(t.seenBy("b").felt[0]!.up).toBe(false);
  });
});

describe("Table: блокировка карт", () => {
  it("взятое одним другой взять не может, пока первый не положил", () => {
    const t = seated("a", "b");
    ops(t.act("a", { t: "grab", id: "c7" }, 0));
    expect(t.act("b", { t: "grab", id: "c7" }, 1)).toEqual({ refused: "locked" });
    ops(t.act("a", { t: "drop", id: "c7", to: { in: "hand", chair: seatOf(t, "a"), i: 0 } }, 2));
    expect("ops" in t.act("b", { t: "grab", id: "c6" }, 3)).toBe(true);
  });

  it("с колоды под локом берётся только верхняя; положить можно только взятое", () => {
    const t = seated("a", "b");
    ops(t.act("a", { t: "deckGuard", pile: "deck", guard: "lock", on: true }, 0));
    expect(t.act("a", { t: "grab", id: "c0" }, 0)).toEqual({ refused: "not-top" });
    expect(t.act("b", { t: "drop", id: "c7", to: { in: "deck", pile: "deck" } }, 0)).toEqual({ refused: "not-held" });
  });

  it("непродлённая блокировка истекает", () => {
    const t = seated("a");
    ops(t.act("a", { t: "grab", id: "c7" }, 0));
    ops(t.act("a", { t: "hold", id: "c7" }, LOCK_TTL_MS - 1));
    expect(t.sweep(LOCK_TTL_MS + 1)).toEqual([]);
    expect(t.sweep(2 * LOCK_TTL_MS)).toEqual([{ t: "unlock", id: "c7" }]);
  });

  it("палец в воздухе: только держащий, версия не растёт, блокировка продлевается, лицо — по месту взятия", () => {
    const t = seated("a", "b");
    const top = deal(t, "a", seatOf(t, "a"));
    ops(t.act("a", { t: "grab", id: top }, 0));
    const v = t.version;
    const over = { in: "felt", x: 1, y: 2, up: true, angle: 0 } as const;
    expect(t.carry("b", { id: top, over }, 1)).toEqual({ refused: "not-held" });
    expect(t.carry("a", { id: top, over: { in: "hand", chair: "нет", i: 0 } }, 1)).toEqual({ refused: "bad" });
    expect(t.carry("a", { id: top, over }, LOCK_TTL_MS - 1)).toEqual({ ok: true });
    expect(t.version).toBe(v);
    expect(t.sweep(LOCK_TTL_MS + 1)).toEqual([]);
    // Своё хозяину не отдаётся; другому — рубашкой: рука «a» скрыта.
    expect(t.carriesSeenBy("a")).toEqual([]);
    expect(t.carriesSeenBy("b")).toEqual([{ id: top, by: "a", over, from: { in: "hand", chair: seatOf(t, "a"), i: 0 }, card: { id: top } }]);
    ops(t.act("a", { t: "flag", chair: seatOf(t, "a"), flag: "hide", on: false }, 2));
    expect(t.carriesSeenBy("b")[0]!.card.face).toBeDefined();
    // Положил — в воздухе больше ничего.
    ops(t.act("a", { t: "drop", id: top, to: over }, 3));
    expect(t.carriesSeenBy("b")).toEqual([]);
  });

  it("след карты: кто перенёс, откуда, чья рука — и опоздавший видит его в снимке", () => {
    const t = seated("a", "b");
    const top = t.seenBy("a").piles[0]!.cards.at(-1)!.id;
    const felt = { in: "felt", x: 0, y: 0, up: false, angle: 0 } as const;
    ops(t.act("a", { t: "grab", id: top }, 0));
    ops(t.act("a", { t: "drop", id: top, to: felt }, 100));
    expect(t.seenBy("b").trails[top]).toEqual({ by: "a", byName: "a", from: "deck", at: 100 });
    ops(t.act("b", { t: "grab", id: top }, 0));
    ops(t.act("b", { t: "drop", id: top, to: { in: "hand", chair: seatOf(t, "b"), i: 0 } }, 200));
    ops(t.act("a", { t: "grab", id: top }, 0));
    const [move] = ops(t.act("a", { t: "drop", id: top, to: { ...felt, x: 1 } }, 300));
    expect(move).toMatchObject({ trail: { by: "a", from: "hand", hand: "b", at: 300 } });
    // Сдвиг по сукну меняет «двигал», но не «откуда»: карта всё ещё из руки b.
    ops(t.act("b", { t: "grab", id: top }, 0));
    ops(t.act("b", { t: "drop", id: top, to: felt }, 400));
    t.leave("b");
    t.join(person("c"));
    expect(t.seenBy("c").trails[top]).toEqual({ by: "b", byName: "b", from: "hand", hand: "b", at: 400 });
    // Со стола в руку — «откуда» перебито: со стола.
    ops(t.act("c", { t: "grab", id: top }, 0));
    ops(t.act("c", { t: "drop", id: top, to: { in: "hand", chair: seatOf(t, "c"), i: 0 } }, 500));
    expect(t.seenBy("c").trails[top]).toEqual({ by: "c", byName: "c", from: "felt", at: 500 });

  });

  it("брошенная за кромку карта ложится на край сукна", () => {
    const t = seated("a");
    ops(t.act("a", { t: "grab", id: "c7" }, 0));
    const [move] = ops(t.act("a", { t: "drop", id: "c7", to: { in: "felt", x: 0, y: 16, up: false, angle: 0 } }, 0));
    expect(move).toMatchObject({ to: { in: "felt", x: 0, y: FELT_REACH } });
  });

  it("карта ложится под тем углом, под которым её бросили; угол приводится к (-180, 180]", () => {
    const t = seated("a", "b");
    ops(t.act("a", { t: "grab", id: "c7" }, 0));
    ops(t.act("a", { t: "drop", id: "c7", to: { in: "felt", x: 1, y: 1, up: true, angle: 270 } }, 0));
    expect(t.seenBy("b").felt[0]).toMatchObject({ id: "c7", angle: -90 });
    ops(t.act("b", { t: "grab", id: "c7" }, 0));
    ops(t.act("b", { t: "drop", id: "c7", to: { in: "felt", x: 1, y: 1, up: true, angle: Number.NaN } }, 0));
    expect(t.seenBy("a").felt[0]!.angle).toBe(0);
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
    expect(rules).toEqual({ t: "rules", rules: { dropEmptyChairs: true, faces: "classic", back: "plaid" } });
    expect(unchair).toEqual({ t: "unchair", id: b, felt: [] });
  });

  it("вид колоды: по умолчанию классика на пледе; чужое и кривое значение не проходит", () => {
    const t = seated("a", "b");
    expect(t.seenBy("b").rules).toMatchObject({ faces: "classic", back: "plaid" });
    ops(t.act("a", { t: "rules", rules: { faces: "minimal", back: "ink" } }, 0));
    expect(t.seenBy("b").rules).toMatchObject({ faces: "minimal", back: "ink" });
    ops(t.act("a", { t: "rules", rules: { faces: "gothic" as "minimal", back: "../x" as "ink" } }, 0));
    expect(t.seenBy("b").rules).toMatchObject({ faces: "minimal", back: "ink" });
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
    expect(t.act("c", { t: "flag", chair: b, flag: "lock", on: true }, 0)).toEqual({ refused: "not-yours" });
    expect("ops" in t.act("b", { t: "flag", chair: b, flag: "lock", on: true }, 0)).toBe(true);
    expect("ops" in t.act("admin", { t: "flag", chair: b, flag: "lock", on: false }, 0)).toBe(true);
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
    expect(t.act("c", { t: "flag", chair: b, flag: "lock", on: true }, 0)).toEqual({ refused: "not-yours" });
    t.join(person("admin"));
    expect(t.seenBy("b").admin).toBe("admin");
    expect("ops" in t.act("admin", { t: "flag", chair: b, flag: "lock", on: true }, 0)).toBe(true);
  });

  it("лок: чужие не берут и не кладут, хозяин — свободно, админ — только сняв лок", () => {
    const t = seated("admin", "b");
    const b = seatOf(t, "b");
    const card = deal(t, "b", b);
    ops(t.act("b", { t: "flag", chair: b, flag: "lock", on: true }, 0));
    expect(t.act("admin", { t: "grab", id: card }, 0)).toEqual({ refused: "chair-locked" });
    const top = t.seenBy("admin").piles[0]!.cards.at(-1)!.id;
    ops(t.act("admin", { t: "grab", id: top }, 0));
    expect(t.act("admin", { t: "drop", id: top, to: { in: "hand", chair: b, i: 0 } }, 0)).toEqual({ refused: "chair-locked" });
    ops(t.act("admin", { t: "flag", chair: b, flag: "lock", on: false }, 0));
    ops(t.act("admin", { t: "drop", id: top, to: { in: "hand", chair: b, i: 0 } }, 0));
    ops(t.act("b", { t: "flag", chair: b, flag: "lock", on: true }, 0));
    expect("ops" in t.act("b", { t: "grab", id: card }, 0)).toBe(true);
  });

  it("с покинутого стула спадает лок, скрыть остаётся", () => {
    const t = seated("a", "b");
    const b = seatOf(t, "b");
    deal(t, "b", b);
    ops(t.act("b", { t: "flag", chair: b, flag: "lock", on: true }, 0));
    t.leave("b");
    expect(chair(t, b)).toMatchObject({ lock: false, hide: true });
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

describe("Table: поза, порядок, встать", () => {
  it("позу руки меняет хозяин и админ; видят все; карты брать поза не мешает", () => {
    const t = seated("a", "b", "c");
    const b = seatOf(t, "b");
    expect(chair(t, b)!.pose).toEqual({ fan: true, shrink: false, tuck: false });
    ops(t.act("b", { t: "pose", chair: b, pose: { shrink: true } }, 0));
    expect(chair(t, b, "c")!.pose).toEqual({ fan: true, shrink: true, tuck: false });
    expect(t.act("c", { t: "pose", chair: b, pose: { tuck: true } }, 0)).toEqual({ refused: "not-yours" });
    ops(t.act("a", { t: "pose", chair: b, pose: { tuck: true, fan: false } }, 0));
    expect(chair(t, b)!.pose).toEqual({ fan: false, shrink: true, tuck: true });
    expect(t.act("b", { t: "pose", chair: b, pose: { fan: 1 as unknown as boolean } }, 0)).toEqual({ refused: "bad" });
    const x = deal(t, "b", b);
    deal(t, "b", b);
    expect("ops" in t.act("c", { t: "grab", id: x }, 0)).toBe(true);
  });

  it("сортировка по масти, по номиналу, реверс и шафл — один раз и только своя рука", () => {
    const faces = [
      { id: "h9", face: { rank: "9", suit: "h" as const } },
      { id: "sA", face: { rank: "A", suit: "s" as const } },
      { id: "jk", face: { rank: "JK", suit: "r" as const } },
      { id: "h6", face: { rank: "6", suit: "h" as const } },
      { id: "s6", face: { rank: "6", suit: "s" as const } },
    ];
    const t = new Table(faces, "a");
    t.join(person("a"));
    t.join(person("b"));
    const a = seatOf(t, "a");
    for (let i = 0; i < 5; i += 1) deal(t, "a", a);
    const hand = () => chair(t, a, "a")!.hand.map((c) => c.id);
    ops(t.act("a", { t: "arrange", how: "suit" }, 0));
    expect(hand()).toEqual(["s6", "sA", "h6", "h9", "jk"]);
    ops(t.act("a", { t: "arrange", how: "rank" }, 0));
    expect(hand()).toEqual(["s6", "h6", "h9", "sA", "jk"]);
    ops(t.act("a", { t: "arrange", how: "reverse" }, 0));
    expect(hand()).toEqual(["jk", "sA", "h9", "h6", "s6"]);
    ops(t.act("a", { t: "arrange", how: "shuffle" }, 0));
    expect([...hand()].sort()).toEqual(["h6", "h9", "jk", "s6", "sA"]);
    // Не держится: новая карта ложится туда, куда её положили.
    const back = hand()[0]!;
    ops(t.act("a", { t: "arrange", how: "suit" }, 0));
    ops(t.act("a", { t: "grab", id: "sA" }, 0));
    ops(t.act("a", { t: "drop", id: "sA", to: { in: "hand", chair: a, i: 0 } }, 0));
    expect(hand()[0]).toBe("sA");
    expect(back).toBeTruthy();
    expect(t.act("a", { t: "arrange", how: "nope" as "suit" }, 0)).toEqual({ refused: "bad" });
    // Шафл с готовым порядком: те же карты — принят как есть; чужая или лишняя карта — отказ.
    const mine = [...hand()].reverse();
    ops(t.act("a", { t: "arrange", how: "shuffle", ids: mine }, 0));
    expect(hand()).toEqual(mine);
    expect(t.act("a", { t: "arrange", how: "shuffle", ids: [...mine.slice(1), "zz"] }, 0)).toEqual({ refused: "bad" });
    expect(t.act("a", { t: "arrange", how: "shuffle", ids: mine.slice(1) }, 0)).toEqual({ refused: "bad" });
  });

  it("встать: за столом без стула; стул с картами стоит, пустой уходит по правилу; сесть можно снова", () => {
    const t = seated("a", "b");
    const a = seatOf(t, "a");
    const b = seatOf(t, "b");
    deal(t, "a", a);
    ops(t.act("a", { t: "stand" }, 0));
    expect(t.seenBy("b").people.find((p) => p.key === "a")!.seat).toBeUndefined();
    expect(chair(t, a)!.owner).toBeNull();
    expect(t.seenBy("b").admin).toBe("a");
    ops(t.act("b", { t: "stand" }, 0));
    expect(chair(t, b)).toBeUndefined();
    expect(t.act("b", { t: "stand" }, 0)).toEqual({ refused: "bad" });
    ops(t.act("b", { t: "sit", chair: a }, 0));
    expect(chair(t, a)!.owner).toBe("b");
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
    step("a", { t: "turn", id: "c7" });
    step("b", { t: "turn", id: "c6" });
    step("a", { t: "turn", id: "c5" });
    step("a", { t: "arrange", how: "shuffle" });
    step("b", { t: "pose", chair: b, pose: { shrink: true } });
    step("a", { t: "pose", chair: b, pose: { tuck: true } });
    step("a", { t: "grab", id: "c7" });
    step("a", { t: "drop", id: "c7", to: { in: "felt", x: 0.5, y: -1, up: true, angle: 35 } });
    step("b", { t: "turn", id: "c7" });
    step("c", { t: "deckMove", pile: "deck", x: 1, y: 2, angle: 30 });
    step("a", { t: "grab", id: "c7" });
    step("a", { t: "drop", id: "c7", to: { in: "felt", x: -1, y: 0, up: false, angle: 0 } });
    step("a", { t: "deckDo", pile: "deck", how: "flip" });
    step("b", { t: "deckDo", pile: "deck", how: "sort" });
    step("c", { t: "deckDo", pile: "deck", how: "shuffle" });
    // После перемешивания у карт колоды новые id — берутся по месту.
    const mid = t.seenBy("b").piles[0]!.cards[2]!.id;
    step("b", { t: "turn", id: mid });
    step("b", { t: "grab", id: mid });
    step("b", { t: "drop", id: mid, to: { in: "deck", pile: "deck", i: 0 } });
    step("a", { t: "deckGuard", pile: "deck", guard: "lock", on: true });
    const top = t.seenBy("b").piles[0]!.cards.at(-1)!.id;
    step("b", { t: "grab", id: top });
    step("b", { t: "drop", id: top, to: { in: "hand", chair: b, i: 0 } });
    step("b", { t: "grab", id: top });
    step("b", { t: "drop", id: top, to: { in: "deck", pile: "deck", i: 0 } });
    step("a", { t: "deckGuard", pile: "deck", guard: "shut", on: true });
    step("a", { t: "deckGuard", pile: "deck", guard: "lock", on: false });
    step("a", { t: "deckGuard", pile: "deck", guard: "shut", on: false });
    step("b", { t: "deckPin", pile: "deck", on: true });
    step("a", { t: "deckPin", pile: "deck", on: false });
    step("a", { t: "deckForever", pile: "deck", on: false });
    // Несколько стопок: собрать с сукна и из колоды в новую, перенести колоду поверх, собрать в стоящую, опустошить.
    step("a", { t: "gather", ids: ["c7", t.seenBy("a").piles[0]!.cards[0]!.id], side: "up", to: { x: -2, y: 1, angle: 20 } });
    step("b", { t: "deckMove", pile: "deck", x: -2, y: 1.2 });
    step("a", { t: "deckDo", pile: "p1", how: "flip" });
    step("c", { t: "gather", ids: [t.seenBy("c").piles.at(-1)!.cards.at(-1)!.id], side: "keep", to: { pile: "p1" } });
    step("b", { t: "deckPin", pile: "p1", on: true });
    for (const one of t.seenBy("a").piles.find((p) => p.id === "p1")!.cards.map((c) => c.id).reverse()) {
      step("a", { t: "grab", id: one });
      step("a", { t: "drop", id: one, to: { in: "hand", chair: a, i: 0 } });
    }
    step("b", { t: "pick", ids: [t.seenBy("b").piles[0]!.cards[0]!.id, "c6"], on: true });
    step("a", { t: "pick", ids: ["c6", t.seenBy("a").chairs[0]!.hand[0]?.id ?? "c5"], on: true });
    step("b", { t: "pick", ids: ["c6"], on: false });
    step("a", { t: "unpick" });
    step("b", { t: "flag", chair: b, flag: "lock", on: true });
    step("b", { t: "stand" });
    step("b", { t: "sit", chair: b });
    run(t.leave("b"));
    step("c", { t: "sit", chair: b });
    step("c", { t: "flag", chair: b, flag: "hide", on: true });
    step("a", { t: "rules", rules: { dropEmptyChairs: false } });
    run(t.leave("a"));
    run(t.join(person("a")));
  });
});
