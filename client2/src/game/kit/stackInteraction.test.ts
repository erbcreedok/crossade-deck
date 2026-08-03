import { describe, expect, it } from "vitest";
import {
  SPREAD_STATE0,
  offsetWithSpread,
  resolveInteraction,
  spreadInput,
  spreadOffset,
  spreadTick,
  STACK_INTERACTIONS,
  type SpreadConfig,
} from "./stackInteraction";

const cfg = (over: Partial<SpreadConfig> = {}): SpreadConfig => ({
  trigger: "always",
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
    let st = { amount: 0, target: 30, idle: 0, phase: 0 };
    for (let i = 0; i < 60; i++) st = spreadTick(st, 1 / 60, cfg());
    expect(st.amount).toBeGreaterThan(29);
    expect(st.amount).toBeLessThanOrEqual(30);
  });
  it("infinite — цель держится (без взаимодействия не схлопывается)", () => {
    let st = { amount: 30, target: 30, idle: 0, phase: 0 };
    for (let i = 0; i < 300; i++) st = spreadTick(st, 1 / 60, cfg({ close: { kind: "infinite" } }));
    expect(st.target).toBe(30);
  });
  it("timer — после N секунд простоя цель уходит в 0", () => {
    let st = { amount: 30, target: 30, idle: 0, phase: 0 };
    const c = cfg({ close: { kind: "timer", seconds: 2 } });
    for (let i = 0; i < 60 * 1; i++) st = spreadTick(st, 1 / 60, c); // 1 сек
    expect(st.target).toBe(30);
    for (let i = 0; i < 60 * 2; i++) st = spreadTick(st, 1 / 60, c); // ещё 2 сек → >2
    expect(st.target).toBe(0);
  });
  it("snap — цель липнет к ближайшему стопу (доли maxGap)", () => {
    const c = cfg({ close: { kind: "snap", stops: [0, 0.5, 1] } }); // стопы: 0,15,30
    let st = { amount: 20, target: 20, idle: 0, phase: 0 };
    for (let i = 0; i < 120; i++) st = spreadTick(st, 1 / 60, c);
    expect(st.target).toBe(15); // 20 ближе к 15, чем к 30/0
  });
  it("dribble — фаза растёт и на пике buildSeconds цель схлопывается", () => {
    const c = cfg({ close: { kind: "dribble", buildSeconds: 1 } });
    let st = { amount: 30, target: 30, idle: 0, phase: 0 };
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
    expect(deck.cardDrag).toEqual({ trigger: "tap", pick: "first" });
    const obj = { spread: null, cardDrag: null, stackDrag: { trigger: "hold" as const } };
    expect(resolveInteraction(obj)).toBe(obj);
    expect(resolveInteraction("нет такого").cardDrag).toEqual({ trigger: "tap", pick: "any" }); // → plain
  });
  it("все пресеты собираются без ошибок", () => {
    for (const id of Object.keys(STACK_INTERACTIONS)) expect(STACK_INTERACTIONS[id]!.make()).toBeTruthy();
  });
});
