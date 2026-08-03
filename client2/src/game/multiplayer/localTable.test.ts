import { afterEach, describe, expect, it, vi } from "vitest";
import { bindRoom, type CrossadeSignal } from "../crossade/net";
import type { CrossadeState } from "../crossade/state";
import { buildDeck36, createLocalTable, type LocalTable } from "./localTable";

// ЛОКАЛЬНЫЙ СТОЛ — семантика доставки и минимальные правила. Ключевая гарантия здесь —
// СОВМЕСТИМОСТЬ со швом crossade/net.ts: клиент мастера скармливается НАСТОЯЩЕМУ bindRoom, и
// снимки каждого зрителя строит настоящий snapshotFrom. Сломается форма state — сломается тест.

const identity = (d: string[]) => [...d];

function table(players: number, extra: Partial<Parameters<typeof createLocalTable>[0]> = {}): LocalTable {
  return createLocalTable({ players, handSize: 2, shuffle: identity, ...extra });
}

/** Подписать зрителя настоящим bindRoom: возвращает последний снимок и сигналы. */
function watch(t: LocalTable, i: number) {
  const out = { state: null as CrossadeState | null, signals: [] as CrossadeSignal[] };
  const client = t.clients[i]!;
  bindRoom(client, {
    self: client.sessionId,
    onState: (s) => (out.state = s),
    onSignal: (sig) => out.signals.push(sig),
  });
  return out;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createLocalTable: раздача", () => {
  it("каждому по handSize карт с верха колоды, руки не пересекаются, остальное в колоде", () => {
    const t = table(3);
    const hands = t.clients.map((_, i) => watch(t, i).state!.selfHand);
    expect(hands.every((h) => h.length === 2)).toBe(true);
    const all = hands.flat();
    expect(new Set(all).size).toBe(6);
    const deck: string[] = [];
    t.state.deck.forEach((c) => deck.push(c));
    expect(deck.length).toBe(36 - 6);
    expect(deck.some((c) => all.includes(c))).toBe(false);
  });

  it("стол сразу в игре: phase playing, freeMode, все места за столом", () => {
    const t = table(4);
    const s = watch(t, 0).state!;
    expect(s.phase).toBe("playing");
    expect(s.freeMode).toBe(true);
    expect(s.seats.map((x) => x.sessionId)).toEqual(["p1", "p2", "p3", "p4"]);
  });

  it("подписка отдаёт состояние сразу, не дожидаясь чужого хода (как при джойне)", () => {
    const t = table(2);
    expect(watch(t, 1).state).not.toBeNull();
  });
});

describe("play_card / take_play: общая зона", () => {
  it("сыгранная карта уходит из руки автора и появляется кучкой у ВСЕХ зрителей", () => {
    const t = table(3);
    const a = watch(t, 0);
    const b = watch(t, 1);
    const card = a.state!.selfHand[0]!;

    t.clients[0]!.send("play_card", { card });

    expect(a.state!.selfHand).not.toContain(card);
    expect(a.state!.play).toEqual([[card]]);
    expect(b.state!.play).toEqual([[card]]);
    // Чужая рука зрителю не видна, но счёт на месте уменьшился.
    expect(b.state!.seats.find((s) => s.sessionId === "p1")!.handCount).toBe(1);
  });

  it("stack: валидный индекс кладёт в существующую кучку, протухший — новой кучкой (не роняет ход)", () => {
    const t = table(2);
    const a = watch(t, 0);
    const [c1, c2] = [a.state!.selfHand[0]!, a.state!.selfHand[1]!];
    t.clients[0]!.send("play_card", { card: c1 });
    t.clients[0]!.send("play_card", { card: c2, stack: 0 });
    expect(a.state!.play).toEqual([[c1, c2]]);

    const b = watch(t, 1);
    const c3 = b.state!.selfHand[0]!;
    t.clients[1]!.send("play_card", { card: c3, stack: 7 });
    expect(a.state!.play).toEqual([[c1, c2], [c3]]);
  });

  it("взять со стола может ЛЮБОЙ игрок, не только автор; пустая кучка исчезает у всех", () => {
    const t = table(2);
    const a = watch(t, 0);
    const b = watch(t, 1);
    const card = a.state!.selfHand[0]!;
    t.clients[0]!.send("play_card", { card });

    t.clients[1]!.send("take_play", { card });

    expect(b.state!.selfHand).toContain(card);
    expect(a.state!.play).toEqual([]);
    expect(b.state!.play).toEqual([]);
  });

  it("чужую карту из руки сыграть нельзя: action_rejected автору, состояние не тронуто", () => {
    const t = table(2);
    const a = watch(t, 0);
    const b = watch(t, 1);
    const foreign = b.state!.selfHand[0]!;

    t.clients[0]!.send("play_card", { card: foreign });

    expect(a.signals).toEqual([{ kind: "action_rejected", action: "play_card", reason: "not_in_hand", cards: [foreign] }]);
    expect(b.signals).toEqual([]);
    expect(a.state!.play).toEqual([]);
    expect(b.state!.selfHand).toContain(foreign);
  });
});

describe("set_hand_order", () => {
  it("перестановка своей руки применяется; не-перестановка отклоняется без следа", () => {
    const t = table(2);
    const a = watch(t, 0);
    const [c1, c2] = [a.state!.selfHand[0]!, a.state!.selfHand[1]!];

    t.clients[0]!.send("set_hand_order", { order: [c2, c1] });
    // snapshotFrom держит УЖЕ ПОКАЗАННЫЙ порядок при том же составе (applyHandOrder) — правда
    // мастера видна в сыром состоянии.
    expect(t.state.players).toBeDefined();
    const raw: string[] = [];
    t.state.players.forEach((p, sid) => {
      if (sid === "p1") p.hand.forEach((c) => raw.push(c));
    });
    expect(raw).toEqual([c2, c1]);

    t.clients[0]!.send("set_hand_order", { order: [c1, "A♠"] });
    expect(a.signals).toEqual([{ kind: "action_rejected", action: "set_hand_order", reason: "not_a_permutation", cards: [] }]);
  });
});

describe("latency", () => {
  it("каждое плечо едет latencyMs: ход виден всем через 2×latency, не раньше", () => {
    vi.useFakeTimers();
    const t = table(2, { latencyMs: 50 });
    const a = watch(t, 0);
    const card = a.state!.selfHand[0]!;

    t.clients[0]!.send("play_card", { card });
    expect(a.state!.play).toEqual([]);

    vi.advanceTimersByTime(50); // клиент → мастер: мастер применил, рассылка уехала в очередь
    expect(a.state!.play).toEqual([]);

    vi.advanceTimersByTime(50); // мастер → клиенты
    expect(a.state!.play).toEqual([[card]]);
  });

  it("отложенная рассылка несёт снимок НА МОМЕНТ broadcast, а не будущее состояние", () => {
    vi.useFakeTimers();
    const t = table(2, { latencyMs: 10 });
    const a = watch(t, 0);
    const seen: string[][][] = [];
    t.clients[0]!.onStateChange((s) => {
      const play: string[][] = [];
      s.play.forEach((st) => {
        const cards: string[] = [];
        st.cards.forEach((c) => cards.push(c));
        play.push(cards);
      });
      seen.push(play);
    });
    const [c1, c2] = [a.state!.selfHand[0]!, a.state!.selfHand[1]!];

    t.clients[0]!.send("play_card", { card: c1 });
    vi.advanceTimersByTime(10); // мастер применил первый ход, снимок рассылки заморожен
    t.clients[0]!.send("play_card", { card: c2 });
    vi.advanceTimersByTime(100);

    // Первый доехавший снимок — ОДНА карта (второй ход в него не подмешался задним числом).
    expect(seen[1]).toEqual([[c1]]);
    expect(seen[2]).toEqual([[c1], [c2]]);
  });

  it("destroy отменяет недоставленное", () => {
    vi.useFakeTimers();
    const t = table(2, { latencyMs: 10 });
    const a = watch(t, 0);
    t.clients[0]!.send("play_card", { card: a.state!.selfHand[0]! });
    t.destroy();
    vi.advanceTimersByTime(1000);
    expect(a.state!.play).toEqual([]);
  });
});

describe("сброс", () => {
  it("discard_card кладёт из руки наверх кучи, take_discard возвращает верхнюю любому игроку", () => {
    const t = table(2);
    const a = watch(t, 0);
    const b = watch(t, 1);
    const card = a.state!.selfHand[0]!;
    t.clients[0]!.send("discard_card", { card });
    expect(a.state!.selfHand).not.toContain(card);
    expect(b.state!.discard).toEqual([card]);

    t.clients[1]!.send("take_discard");
    expect(b.state!.selfHand).toContain(card);
    expect(a.state!.discard).toEqual([]);
  });

  it("чужую карту не сбросить, из пустой кучи не взять", () => {
    const t = table(2);
    const a = watch(t, 0);
    const foreign = watch(t, 1).state!.selfHand[0]!;
    t.clients[0]!.send("discard_card", { card: foreign });
    t.clients[0]!.send("take_discard");
    expect(a.signals.map((s) => (s.kind === "action_rejected" ? s.reason : s.kind))).toEqual(["not_in_hand", "empty"]);
  });
});

describe("live-каналы: hands и gesture", () => {
  function channel<T>(t: LocalTable, i: number, type: string): T[] {
    const got: T[] = [];
    t.clients[i]!.onMessage<T>(type, (m) => got.push(m));
    return got;
  }

  it("hands: каждому — ЧУЖИЕ руки alias'ами в порядке владельца, без своей и без номиналов", () => {
    const t = table(2);
    const handsAt0 = channel<{ hands: Record<string, string[]> }>(t, 0, "hands");
    t.clients[0]!.send("sync");
    const hands = handsAt0[0]!.hands;
    expect(Object.keys(hands)).toEqual(["p2"]);
    expect(hands.p2!.length).toBe(2);
    for (const alias of hands.p2!) expect(alias).toMatch(/^x\d+$/);
  });

  it("hands: реордер чужой руки виден перестановкой ТЕХ ЖЕ alias'ов", () => {
    const t = table(2);
    const handsAt0 = channel<{ hands: Record<string, string[]> }>(t, 0, "hands");
    const b = watch(t, 1);
    const [c1, c2] = [b.state!.selfHand[0]!, b.state!.selfHand[1]!];
    t.clients[0]!.send("sync");
    const before = handsAt0[0]!.hands.p2!;
    t.clients[1]!.send("set_hand_order", { order: [c2, c1] });
    const after = handsAt0[handsAt0.length - 1]!.hands.p2!;
    expect(after).toEqual([before[1], before[0]]);
  });

  it("gesture: остальным без эха автору; карта руки идёт alias'ом, над рукой координаты срезаны", () => {
    const t = table(3);
    const a = watch(t, 0);
    const atSelf = channel<object>(t, 0, "gesture");
    const at1 = channel<{ from: string; kind: string; card: string; zone?: string; at?: object }>(t, 1, "gesture");
    const card = a.state!.selfHand[0]!;

    t.clients[0]!.send("gesture", { kind: "grab", card, zone: "hand", at: { x: 1, y: 2 } });

    expect(atSelf).toEqual([]);
    expect(at1.length).toBe(1);
    expect(at1[0]!.from).toBe("p1");
    expect(at1[0]!.card).toMatch(/^x\d+$/);
    expect(at1[0]!.at).toBeUndefined();
  });

  it("gesture: над публичной зоной координаты идут как есть; публичная карта — под своим id", () => {
    const t = table(2);
    const a = watch(t, 0);
    const at1 = channel<{ card: string; zone?: string; at?: { x: number; y: number } }>(t, 1, "gesture");
    const card = a.state!.selfHand[0]!;
    // Карта руки над столом: alias + координаты (фантом едет по столу).
    t.clients[0]!.send("gesture", { kind: "move", card, zone: "board", at: { x: 10, y: 20 } });
    expect(at1[0]!.card).toMatch(/^x\d+$/);
    expect(at1[0]!.at).toEqual({ x: 10, y: 20 });

    // Публичная карта (сыграна) — под настоящим id.
    t.clients[0]!.send("play_card", { card });
    t.clients[0]!.send("gesture", { kind: "grab", card, zone: "board", at: { x: 1, y: 1 } });
    expect(at1[at1.length - 1]!.card).toBe(card);
  });
});

describe("трафик и колода", () => {
  it("onTraffic видит каждый send с автором", () => {
    const log: unknown[] = [];
    const t = table(2, { onTraffic: (e) => log.push(e) });
    t.clients[1]!.send("take_play", { card: "6♠" });
    expect(log).toEqual([{ from: "p2", type: "take_play", message: { card: "6♠" } }]);
  });

  it("buildDeck36 — 36 уникальных карт формата ранг+масть", () => {
    const deck = buildDeck36();
    expect(deck.length).toBe(36);
    expect(new Set(deck).size).toBe(36);
    expect(deck).toContain("A♠");
    expect(deck).toContain("6♣");
  });

  it("неизвестное сообщение отклоняется явно, а не молча", () => {
    const t = table(2);
    const a = watch(t, 0);
    t.clients[0]!.send("go");
    expect(a.signals).toEqual([{ kind: "action_rejected", action: "go", reason: "unknown_message", cards: [] }]);
  });
});
