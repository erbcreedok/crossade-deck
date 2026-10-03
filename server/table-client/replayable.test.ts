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
