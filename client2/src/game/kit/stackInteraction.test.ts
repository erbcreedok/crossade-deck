import { describe, expect, it } from "vitest";
import {
  pieceDragFrom,
  PICK_ANY,
  PICK_FIRST,
  pivotFrom,
  SPREAD_STATE0,
  resolveInteraction,
  spreadInput,
  recenterShift,
  spreadOffsetAt,
  spreadTick,
  stackDragFrom,
  STACK_INTERACTIONS,
  wobbleOffset,
  type SpreadConfig,
  type SpreadShapeCtx,
} from "./stackInteraction";
import { linear, type StackLayout } from "./stackLayout";

const cfg = (over: Partial<SpreadConfig> = {}): SpreadConfig => ({
  gain: 5,
  close: { kind: "infinite" },
  spring: 12,
  input: { pointerTrigger: "zoom", touchTrigger: "zoom" },
  ...over,
});

const mkCtx = (over: Partial<SpreadShapeCtx> = {}): SpreadShapeCtx => ({
  i: 2,
  n: 5,
  cell: { w: 60, h: 90 },
  gain: 4,
  base: { dx: 4, dy: 3, rot: 0.1 },
  pivot: { dx: 0, dy: 0, rot: 0 },
  layout: linear({ angleDeg: 0, step: 0.5 }),
  angleDeg: 0,
  ...over,
});

describe("SpreadShapes / spreadOffsetAt", () => {
  it("inherit — растит натуральный параметр раскладки (linear step ×gain); amount 0 = rest", () => {
    const layout: StackLayout = linear({ angleDeg: 0, step: 0.5 });
    const cell = { w: 60, h: 90 };
    const ctx = mkCtx({ i: 3, layout, base: layout(3, 5, cell), gain: 4 });
    const rest = spreadOffsetAt(cfg({ shape: "inherit" }), ctx, 0);
    const full = spreadOffsetAt(cfg({ shape: "inherit" }), ctx, 1);
    expect(rest.dx).toBeCloseTo(layout(3, 5, cell).dx); // amount 0 = rest (strength 1)
    expect(full.dx).toBeCloseTo(layout(3, 5, cell, 4).dx); // amount 1 = strength gain
    expect(full.dx).toBeCloseTo(rest.dx * 4); // step×4 → dx×4
  });
  it("radial — масштаб rest ВОКРУГ pivot (k=1+(gain-1)*amount)", () => {
    const ctx = mkCtx({ i: 1, n: 3, base: { dx: 4, dy: 2, rot: 0 }, pivot: { dx: 0, dy: 0, rot: 0 }, gain: 3 });
    expect(spreadOffsetAt(cfg({ shape: "radial" }), ctx, 1)).toMatchObject({ dx: 12, dy: 6 }); // ×3
    expect(spreadOffsetAt(cfg({ shape: "radial" }), ctx, 0.5).dx).toBe(8); // k=2 → 4*2
    expect(spreadOffsetAt(cfg({ shape: "radial" }), ctx, 0).dx).toBe(4); // amount 0 = rest
  });
  it("radial вокруг НЕнулевого pivot", () => {
    const ctx = mkCtx({ base: { dx: 10, dy: 0, rot: 0 }, pivot: { dx: 4, dy: 0, rot: 0 }, gain: 2 });
    expect(spreadOffsetAt(cfg({ shape: "radial" }), ctx, 1).dx).toBe(16); // 4 + (10-4)*2
  });
  it("linear-форма — в прямую по углу (dy≈0 при angleDeg 0); amount 0 = база", () => {
    const ctx = mkCtx({ i: 2, n: 4, base: { dx: 9, dy: 9, rot: 0.2 }, angleDeg: 0 });
    const full = spreadOffsetAt(cfg({ shape: "linear" }), ctx, 1);
    expect(full.dy).toBeCloseTo(0); // ряд по горизонтали
    expect(full.dx).toBeGreaterThan(0);
    expect(spreadOffsetAt(cfg({ shape: "linear" }), ctx, 0)).toEqual({ dx: 9, dy: 9, rot: 0.2 });
  });
  it("wobbleOffset качает по чётности индекса (dy/rot)", () => {
    expect(wobbleOffset(0, 1).dy).toBe(6); // чётный i → +
    expect(wobbleOffset(1, 1).dy).toBe(-6); // нечётный → −
    expect(wobbleOffset(2, 1).dy).toBe(6);
  });
});

describe("recenterShift (origin на месте)", () => {
  it("сдвиг совмещает origin по rest и по спред-офсетам", () => {
    const rests = [
      { dx: 0, dy: 0, rot: 0 },
      { dx: 10, dy: 0, rot: 0 },
    ];
    const spreads = [
      { dx: 5, dy: 0, rot: 0 },
      { dx: 25, dy: 0, rot: 0 },
    ]; // центр rest=5, центр спреда=15
    expect(recenterShift("center", rests, spreads)).toEqual({ dx: -10, dy: 0 }); // 5 - 15
    expect(recenterShift("bottom", rests, spreads)).toEqual({ dx: -5, dy: 0 }); // index0: 0 - 5
  });
});

describe("pivotFrom", () => {
  const rests = [
    { dx: 0, dy: 0, rot: 0 },
    { dx: 10, dy: 4, rot: 0 },
    { dx: 20, dy: 8, rot: 0 },
  ];
  it("bottom=index0, top=последний, right=макс dx, center=среднее", () => {
    expect(pivotFrom("bottom", rests)).toEqual(rests[0]);
    expect(pivotFrom("top", rests)).toEqual(rests[2]);
    expect(pivotFrom("right", rests).dx).toBe(20);
    expect(pivotFrom("center", rests)).toEqual({ dx: 10, dy: 4, rot: 0 });
  });
});

describe("spreadInput (прогресс 0..1)", () => {
  it("двигает target на дельту и зажимает в [0, 1], сбрасывает простой", () => {
    const a = spreadInput({ ...SPREAD_STATE0, idle: 5 }, 0.3);
    expect(a.target).toBeCloseTo(0.3);
    expect(a.idle).toBe(0);
    expect(spreadInput(a, 5).target).toBe(1); // упор в 1
    expect(spreadInput(a, -5).target).toBe(0); // упор в 0
  });
});

describe("spreadTick (прогресс 0..1)", () => {
  it("amount пружиной тянется к target(=1)", () => {
    let st = { amount: 0, target: 1, idle: 0, phase: 0, dir: 0 };
    for (let i = 0; i < 60; i++) st = spreadTick(st, 1 / 60, cfg());
    expect(st.amount).toBeGreaterThan(0.95);
    expect(st.amount).toBeLessThanOrEqual(1);
  });
  it("infinite — цель держится (без взаимодействия не схлопывается)", () => {
    let st = { amount: 1, target: 1, idle: 0, phase: 0, dir: 0 };
    for (let i = 0; i < 300; i++) st = spreadTick(st, 1 / 60, cfg({ close: { kind: "infinite" } }));
    expect(st.target).toBe(1);
  });
  it("timer — после N секунд простоя цель уходит в 0", () => {
    let st = { amount: 1, target: 1, idle: 0, phase: 0, dir: 0 };
    const c = cfg({ close: { kind: "timer", seconds: 2 } });
    for (let i = 0; i < 60 * 1; i++) st = spreadTick(st, 1 / 60, c); // 1 сек
    expect(st.target).toBe(1);
    for (let i = 0; i < 60 * 2; i++) st = spreadTick(st, 1 / 60, c); // ещё 2 сек → >2
    expect(st.target).toBe(0);
  });
  it("snap без направления (dir=0) — геометрически ближайший стоп", () => {
    const c = cfg({ close: { kind: "snap", stops: [0, 0.5, 1] } });
    let st = { amount: 0.4, target: 0.4, idle: 0, phase: 0, dir: 0 };
    for (let i = 0; i < 120; i++) st = spreadTick(st, 1 / 60, c);
    expect(st.target).toBe(0.5); // 0.4 ближе к 0.5, чем к 0/1
  });
  it("snap НАПРАВЛЕННЫЙ: закрывали (dir<0) — не отбрасывает вверх к open, роняет к стопу ниже", () => {
    // 0.8 геометрически БЛИЖЕ к 1 (это и был баг «улетает обратно»), но раз закрывали — идём к 0.5.
    const c = cfg({ close: { kind: "snap", stops: [0, 0.5, 1] } });
    let st = { amount: 0.8, target: 0.8, idle: 0, phase: 0, dir: -1 };
    for (let i = 0; i < 120; i++) st = spreadTick(st, 1 / 60, c);
    expect(st.target).toBe(0.5);
  });
  it("snap НАПРАВЛЕННЫЙ: открывали (dir>0) — идём к стопу выше, а не к геометрически ближнему нулю", () => {
    const c = cfg({ close: { kind: "snap", stops: [0, 0.5, 1] } });
    let st = { amount: 0.2, target: 0.2, idle: 0, phase: 0, dir: 1 }; // 0.2 ближе к 0, но открывали → 0.5
    for (let i = 0; i < 120; i++) st = spreadTick(st, 1 / 60, c);
    expect(st.target).toBe(0.5);
  });
  it("регрессия бага: полный→откат назад через spreadInput→снэп НЕ возвращает в open", () => {
    // Живой путь: открыто в 1, недотянутый откат назад ставит dir=-1 и target 0.8, снэп→0.5.
    const c = cfg({ close: { kind: "snap", stops: [0, 0.5, 1] } });
    let st = { amount: 1, target: 1, idle: 0, phase: 0, dir: 0 };
    st = spreadInput(st, -0.2); // откат назад: target 0.8, dir -1
    expect(st.dir).toBe(-1);
    for (let i = 0; i < 120; i++) st = spreadTick(st, 1 / 60, c);
    expect(st.target).toBe(0.5); // а НЕ 1
  });
  it("dribble — фаза растёт и на пике buildSeconds цель схлопывается", () => {
    const c = cfg({ close: { kind: "dribble", buildSeconds: 1 } });
    let st = { amount: 1, target: 1, idle: 0, phase: 0, dir: 0 };
    st = spreadTick(st, 0.5, c);
    expect(st.phase).toBeGreaterThan(0);
    expect(st.target).toBe(1);
    st = spreadTick(st, 0.6, c); // фаза перевалила за 1
    expect(st.target).toBe(0);
    expect(st.phase).toBe(0);
  });
});

describe("resolveInteraction / пресеты", () => {
  it("по имени возвращает готовую механику; по объекту — как есть", () => {
    const deck = resolveInteraction("deck");
    expect(deck.spread).not.toBeNull();
    expect(deck.pieceDrag?.trigger).toBe("tap");
    expect(deck.pieceDrag?.pick).toBe(PICK_FIRST); // предикат — по идентичности готового
    const obj = { spread: null, pieceDrag: null, stackDrag: { trigger: "hold" as const } };
    expect(resolveInteraction(obj)).toBe(obj);
    expect(resolveInteraction("нет такого").pieceDrag?.pick).toBe(PICK_ANY); // → plain
  });
  it("все пресеты собираются без ошибок", () => {
    for (const id of Object.keys(STACK_INTERACTIONS)) expect(STACK_INTERACTIONS[id]!.make()).toBeTruthy();
  });
});

describe("pick-предикаты и нормализаторы драга", () => {
  it("PICK_ANY тащит любую; PICK_FIRST — только верхнюю (i===n-1)", () => {
    expect(PICK_ANY({ id: "a", i: 0, n: 4 })).toBe(true);
    expect(PICK_ANY({ id: "a", i: 2, n: 4 })).toBe(true);
    expect(PICK_FIRST({ id: "a", i: 3, n: 4 })).toBe(true); // верхняя
    expect(PICK_FIRST({ id: "a", i: 0, n: 4 })).toBe(false); // низ
  });
  it("клиентский предикат работает как любая функция (напр. только чётные позиции)", () => {
    const evens = pieceDragFrom(({ i }) => i % 2 === 0, "tap");
    expect(evens?.pick({ id: "a", i: 2, n: 5 })).toBe(true);
    expect(evens?.pick({ id: "a", i: 1, n: 5 })).toBe(false);
  });
  it("pieceDragFrom: false → null, true → PICK_ANY, предикат → он сам; триггер сохраняется", () => {
    expect(pieceDragFrom(false, "tap")).toBeNull();
    expect(pieceDragFrom(true, "hold")).toEqual({ pick: PICK_ANY, trigger: "hold" });
    expect(pieceDragFrom(PICK_FIRST, "tap")).toEqual({ pick: PICK_FIRST, trigger: "tap" });
  });
  it("stackDragFrom: false → null, true → конфиг с триггером", () => {
    expect(stackDragFrom(false, "tap")).toBeNull();
    expect(stackDragFrom(true, "hold")).toEqual({ trigger: "hold" });
  });
});
