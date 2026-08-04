import { describe, expect, it } from "vitest";
import {
  cardDragFrom,
  PICK_ANY,
  PICK_FIRST,
  SPREAD_STATE0,
  offsetWithSpread,
  resolveInteraction,
  spreadInput,
  spreadOffset,
  spreadTick,
  stackDragFrom,
  STACK_INTERACTIONS,
  type SpreadConfig,
} from "./stackInteraction";

const cfg = (over: Partial<SpreadConfig> = {}): SpreadConfig => ({
  pointerTrigger: "zoom",
  touchTrigger: "zoom",
  maxGap: 30,
  keepDiagonal: true,
  centerX: false,
  close: { kind: "infinite" },
  spring: 12,
  ...over,
});

describe("spreadOffset / offsetWithSpread", () => {
  it("зазор растёт линейно по индексу; centerX сдвигает на половину полного", () => {
    expect(spreadOffset(0, 4, 10, false)).toBe(0);
    expect(spreadOffset(3, 4, 10, false)).toBe(30);
    // centerX: полный зазор = 10*(4-1)=30, половина 15
    expect(spreadOffset(0, 4, 10, true)).toBe(-15);
    expect(spreadOffset(3, 4, 10, true)).toBe(15);
  });
  it("keepDiagonal сохраняет вертикаль базы; false — гасит (чистый ряд)", () => {
    const base = { dx: 5, dy: 7, rot: 0.1 };
    expect(offsetWithSpread(base, 2, 4, 10, cfg({ keepDiagonal: true })).dy).toBe(7);
    expect(offsetWithSpread(base, 2, 4, 10, cfg({ keepDiagonal: false })).dy).toBe(0);
    expect(offsetWithSpread(base, 2, 4, 10, cfg()).dx).toBe(5 + 20); // база + раздвиг
  });
});

describe("spreadInput", () => {
  it("двигает target на дельту и зажимает в [0, maxGap], сбрасывает простой", () => {
    const a = spreadInput({ ...SPREAD_STATE0, idle: 5 }, 12, cfg());
    expect(a.target).toBe(12);
    expect(a.idle).toBe(0);
    expect(spreadInput(a, 100, cfg()).target).toBe(30); // упор в maxGap
    expect(spreadInput(a, -100, cfg()).target).toBe(0); // упор в 0
  });
});

describe("spreadTick", () => {
  it("amount пружиной тянется к target", () => {
    let st = { amount: 0, target: 30, idle: 0, phase: 0, dir: 0 };
    for (let i = 0; i < 60; i++) st = spreadTick(st, 1 / 60, cfg());
    expect(st.amount).toBeGreaterThan(29);
    expect(st.amount).toBeLessThanOrEqual(30);
  });
  it("infinite — цель держится (без взаимодействия не схлопывается)", () => {
    let st = { amount: 30, target: 30, idle: 0, phase: 0, dir: 0 };
    for (let i = 0; i < 300; i++) st = spreadTick(st, 1 / 60, cfg({ close: { kind: "infinite" } }));
    expect(st.target).toBe(30);
  });
  it("timer — после N секунд простоя цель уходит в 0", () => {
    let st = { amount: 30, target: 30, idle: 0, phase: 0, dir: 0 };
    const c = cfg({ close: { kind: "timer", seconds: 2 } });
    for (let i = 0; i < 60 * 1; i++) st = spreadTick(st, 1 / 60, c); // 1 сек
    expect(st.target).toBe(30);
    for (let i = 0; i < 60 * 2; i++) st = spreadTick(st, 1 / 60, c); // ещё 2 сек → >2
    expect(st.target).toBe(0);
  });
  it("snap без направления (dir=0) — геометрически ближайший стоп", () => {
    const c = cfg({ close: { kind: "snap", stops: [0, 0.5, 1] } }); // стопы: 0,15,30
    let st = { amount: 20, target: 20, idle: 0, phase: 0, dir: 0 };
    for (let i = 0; i < 120; i++) st = spreadTick(st, 1 / 60, c);
    expect(st.target).toBe(15); // 20 ближе к 15, чем к 30/0
  });
  it("snap НАПРАВЛЕННЫЙ: закрывали (dir<0) — не отбрасывает вверх к open, роняет к стопу ниже", () => {
    // 24 геометрически БЛИЖЕ к 30 (это и был баг «улетает обратно»), но раз закрывали — идём к 15.
    const c = cfg({ close: { kind: "snap", stops: [0, 0.5, 1] } }); // стопы: 0,15,30
    let st = { amount: 24, target: 24, idle: 0, phase: 0, dir: -1 };
    for (let i = 0; i < 120; i++) st = spreadTick(st, 1 / 60, c);
    expect(st.target).toBe(15);
  });
  it("snap НАПРАВЛЕННЫЙ: открывали (dir>0) — идём к стопу выше, а не к геометрически ближнему нулю", () => {
    const c = cfg({ close: { kind: "snap", stops: [0, 0.5, 1] } }); // стопы: 0,15,30
    let st = { amount: 6, target: 6, idle: 0, phase: 0, dir: 1 }; // 6 ближе к 0, но открывали → 15
    for (let i = 0; i < 120; i++) st = spreadTick(st, 1 / 60, c);
    expect(st.target).toBe(15);
  });
  it("регрессия бага: полный→откат назад через spreadInput→снэп НЕ возвращает в open", () => {
    // Живой путь: открыто в maxGap(30), недотянутый откат назад ставит dir=-1 и target≈24, снэп→15.
    const c = cfg({ close: { kind: "snap", stops: [0, 0.5, 1] } }); // стопы: 0,15,30
    let st = { amount: 30, target: 30, idle: 0, phase: 0, dir: 0 };
    st = spreadInput(st, -6, c); // откат назад: target 24, dir -1
    expect(st.dir).toBe(-1);
    for (let i = 0; i < 120; i++) st = spreadTick(st, 1 / 60, c);
    expect(st.target).toBe(15); // а НЕ 30
  });
  it("dribble — фаза растёт и на пике buildSeconds цель схлопывается", () => {
    const c = cfg({ close: { kind: "dribble", buildSeconds: 1 } });
    let st = { amount: 30, target: 30, idle: 0, phase: 0, dir: 0 };
    st = spreadTick(st, 0.5, c);
    expect(st.phase).toBeGreaterThan(0);
    expect(st.target).toBe(30);
    st = spreadTick(st, 0.6, c); // фаза перевалила за 1
    expect(st.target).toBe(0);
    expect(st.phase).toBe(0);
  });
});

describe("resolveInteraction / пресеты", () => {
  it("по имени возвращает готовую механику; по объекту — как есть", () => {
    const deck = resolveInteraction("deck");
    expect(deck.spread).not.toBeNull();
    expect(deck.cardDrag?.trigger).toBe("tap");
    expect(deck.cardDrag?.pick).toBe(PICK_FIRST); // предикат — по идентичности готового
    const obj = { spread: null, cardDrag: null, stackDrag: { trigger: "hold" as const } };
    expect(resolveInteraction(obj)).toBe(obj);
    expect(resolveInteraction("нет такого").cardDrag?.pick).toBe(PICK_ANY); // → plain
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
    const evens = cardDragFrom(({ i }) => i % 2 === 0, "tap");
    expect(evens?.pick({ id: "a", i: 2, n: 5 })).toBe(true);
    expect(evens?.pick({ id: "a", i: 1, n: 5 })).toBe(false);
  });
  it("cardDragFrom: false → null, true → PICK_ANY, предикат → он сам; триггер сохраняется", () => {
    expect(cardDragFrom(false, "tap")).toBeNull();
    expect(cardDragFrom(true, "hold")).toEqual({ pick: PICK_ANY, trigger: "hold" });
    expect(cardDragFrom(PICK_FIRST, "tap")).toEqual({ pick: PICK_FIRST, trigger: "tap" });
  });
  it("stackDragFrom: false → null, true → конфиг с триггером", () => {
    expect(stackDragFrom(false, "tap")).toBeNull();
    expect(stackDragFrom(true, "hold")).toEqual({ trigger: "hold" });
  });
});
