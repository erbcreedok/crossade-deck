import { describe, expect, it } from "vitest";
import { localTable } from "./localStore.js";
import { replayable, type ReplayClock } from "./replayable.js";

/** Часы, которые ходят только когда тест их двигает. */
function clock(): ReplayClock & { at: number; step(ms: number): void } {
  let timer: (() => void) | null = null;
  const c = {
    at: 1_000_000,
    now: () => c.at,
    every: (run: () => void) => { timer = run; return () => { timer = null; }; },
    step(ms: number) { c.at += ms; timer?.(); },
  };
  return c;
}

describe("реплей во время игры", () => {
  it("в просмотре стол из прошлого, жесты молчат, выход возвращает живой стол", () => {
    const clk = clock();
    const table = localTable({ freeChair: true });
    const store = replayable(table.view("me"), clk);
    const before = store.state.felt.length;
    const top = store.state.piles.flatMap((p) => p.cards).at(-1)!.id;
    clk.at += 2000;
    store.send({ t: "grab", id: top });
    clk.at += 1000;
    store.send({ t: "drop", id: top, to: { in: "felt", x: 1, y: 1, up: true, angle: 0 } });
    expect(store.state.felt.length).toBe(before + 1);
    const live = store.state;
    store.replay!.enter();
    store.replay!.seek(store.replay!.from + 100);
    expect(store.state.felt.length).toBe(before);
    // В просмотре намерения не уходят: стол не меняется.
    store.send({ t: "grab", id: top });
    store.replay!.exit();
    expect(store.state).toBe(live);
  });

  it("проигрыватель идёт вперёд и назад с заданной скоростью и сам встаёт на краю", () => {
    const clk = clock();
    const store = replayable(localTable({ freeChair: true }).view("me"), clk);
    clk.at += 10_000;
    store.replay!.enter();
    const start = store.replay!.cursor;
    store.replay!.play(-1);
    clk.step(1000);
    expect(store.replay!.cursor).toBeLessThan(start);
    store.replay!.setSpeed(4);
    const mid = store.replay!.cursor;
    clk.step(1000);
    expect(mid - store.replay!.cursor).toBeGreaterThan(1500);
    store.replay!.pause();
    expect(store.replay!.dir).toBe(0);
    store.replay!.play(1);
    for (let i = 0; i < 40 && store.replay!.dir !== 0; i++) clk.step(1000);
    expect(store.replay!.dir).toBe(0);
    expect(store.replay!.cursor).toBe(store.replay!.now);
  });

  it("жесты вперёд/назад прыгают по событиям; слушатели экрана получают сдвиги просмотра", () => {
    const clk = clock();
    const store = replayable(localTable({ freeChair: true }).view("me"), clk);
    const cards = store.state.piles.flatMap((p) => p.cards).map((c) => c.id);
    for (let i = 0; i < 2; i++) {
      clk.at += 3000;
      store.send({ t: "grab", id: cards.at(-1 - i)! });
      clk.at += 500;
      store.send({ t: "drop", id: cards.at(-1 - i)!, to: { in: "felt", x: i, y: 1, up: true, angle: 0 } });
    }
    let heard = 0;
    store.onChange(() => { heard += 1; });
    store.replay!.enter();
    const n = heard;
    expect(store.replay!.moments.length).toBe(2);
    store.replay!.jump(-1);
    const second = store.replay!.cursor;
    store.replay!.jump(-1);
    expect(store.replay!.cursor).toBeLessThan(second);
    expect(heard).toBeGreaterThan(n);
    const first = store.replay!.cursor;
    store.replay!.jump(-1);
    expect(store.replay!.cursor).toBe(first);
    store.replay!.jump(1);
    expect(store.replay!.cursor).toBe(second);
    store.replay!.jump(1);
    expect(store.replay!.cursor).toBe(store.replay!.now);
  });
});

describe("реплей: подгрузка истории", () => {
  it("уходит влево — просим у сервера прошлое, лента растёт, подгруженное можно смотреть; дальше ничего — more=false", async () => {
    const { Table } = await import("../src/table/table.js");
    const { deal } = await import("../src/table/deal.js");
    const { historyPage } = await import("../src/table/historyCut.js");
    const { MAIN_PILE } = await import("../src/table/contract.js");
    const t = new Table(deal(), "a");
    for (const k of ["a", "b"]) t.join({ key: k, name: k, ink: "#fff", door: "guest" });
    const c = t.seenBy("a").piles.find((p) => p.id === MAIN_PILE)!.cards.map((x) => x.id);
    const rows: Array<{ id: number; at: number; side: "table"; kind: string; who?: string; what?: unknown }> = [{ id: 0, at: 1000, side: "table", kind: "table.first", what: { snapshot: t.seenBy("", true) } }];
    let id = 1, now = 1000;
    for (let i = 0; i < 3; i++) for (const intent of [{ t: "grab", id: c.at(-1 - i)! }, { t: "drop", id: c.at(-1 - i)!, to: { in: "felt", x: i, y: 1, up: true, angle: 0 } }] as const) {
      const out = t.act("a", intent, now); if ("refused" in out) throw new Error(out.refused);
      rows.push({ id: id++, at: (now += 1000), side: "table", kind: "patch", what: { v: t.version, ops: out.ops.map((op) => t.seenOp(op, "", true)) } });
    }
    const clk = clock();
    const live = localTable({ freeChair: true }).view("me");
    const asked: number[] = [];
    // Часы сервера впереди часов экрана на 7 минут; вход в самый конец партии.
    const server = new Proxy(live, { get: (target, key) => (key === "now" ? () => clk.now() + 420_000 : key === "history" ? async (before: number) => { asked.push(before); return historyPage(rows as never, before, new Set()); } : Reflect.get(target, key)) });
    const store = replayable(server, clk);
    clk.at = 5_000_000;
    now = 0;
    store.replay!.enter();
    expect(store.replay!.more).toBe(true);
    const sky = store.replay!.moments.length;
    // Просят «до начала ленты» в серверных часах: сдвиг учтён.
    const p = store.replay!.loadOlder();
    expect(store.replay!.loading).toBe(true);
    await p;
    expect(asked).toHaveLength(1);
    expect(asked[0]! - 420_000).toBeLessThanOrEqual(5_000_000);
    expect(store.replay!.loading).toBe(false);
    // История на сервере из 6 патчей кончилась одной порцией, раньше ничего: more=false, повторный запрос не уходит.
    expect(store.replay!.more).toBe(false);
    await store.replay!.loadOlder();
    expect(asked).toHaveLength(1);
    expect(store.replay!.moments.length).toBeGreaterThan(sky);
  });
});
