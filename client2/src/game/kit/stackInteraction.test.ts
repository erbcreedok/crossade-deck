import { describe, expect, it } from "vitest";
import {
  pieceDragFrom,
  PICK_ANY,
  PICK_FIRST,
  SPREAD_STATE0,
  offsetWithSpread,
  resolveInteraction,
  spreadInput,
  spreadTarget,
  spreadTick,
  stackDragFrom,
  STACK_INTERACTIONS,
  type SpreadConfig,
} from "./stackInteraction";
import { linear } from "./stackLayout";

const cfg = (over: Partial<SpreadConfig> = {}): SpreadConfig => ({
  gain: 5,
  close: { kind: "infinite" },
  spring: 12,
  input: { pointerTrigger: "zoom", touchTrigger: "zoom" },
  ...over,
});

describe("spreadTarget (полная позиция при amount=1)", () => {
  it("дефолт-цель = rest×gain (масштаб от якоря); rot не трогаем", () => {
    const base = { dx: 4, dy: 3, rot: 0.1 };
    expect(spreadTarget(base, 2, 5, { w: 60, h: 90 }, cfg({ gain: 3 }))).toEqual({ dx: 12, dy: 9, rot: 0.1 });
  });
  it("override target = другая раскладка, gain при этом не при чём", () => {
    const base = { dx: 4, dy: 3, rot: 0.1 };
    const t = spreadTarget(base, 1, 3, { w: 10, h: 10 }, cfg({ gain: 99, target: linear({ angleDeg: 0, step: 1 }) }));
    expect(t.dy).toBe(0); // linear(0): чистая горизонталь
    expect(t.dx).toBeGreaterThan(0);
    expect(t.dx).toBeLessThan(99 * 4); // это раскладка, а не rest×99
  });
});

describe("offsetWithSpread (lerp rest→цель по amount)", () => {
  it("amount 0 → rest, amount 1 → цель, 0.5 → середина", () => {
    const base = { dx: 0, dy: 0, rot: 0 };
    const target = { dx: 10, dy: 20, rot: 0.4 };
    expect(offsetWithSpread(base, target, 0)).toEqual({ dx: 0, dy: 0, rot: 0 });
    expect(offsetWithSpread(base, target, 1, 0, 0)).toEqual({ dx: 10, dy: 20, rot: 0.4 });
    expect(offsetWithSpread(base, target, 0.5).dx).toBe(5);
  });
  it("wobble качает по чётности индекса (dy/rot)", () => {
    const z = { dx: 0, dy: 0, rot: 0 };
    expect(offsetWithSpread(z, z, 0, 0, 1).dy).toBe(6); // чётный i → +
    expect(offsetWithSpread(z, z, 0, 1, 1).dy).toBe(-6); // нечётный → −
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
