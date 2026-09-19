// РАССКАЗ ЭКРАНА НЕ МЕШАЕТ ИГРЕ.
//
// Это прогон ядра, которым пользуется КЛИЕНТ (`telling.ts` в общем коде): оно нарочно написано без
// единого обращения к браузеру, чтобы его законы проверялись здесь, а не глазами в Playwright.
//
// Закон: копилка уходит пачкой, одинаковое подряд сжимается, а осечка отправки не всплывает наружу.

import { describe, it, expect, vi } from "vitest";
import type { Seen } from "./contract.js";
import { tableWitness, HEAP_MAX, SAME_MS } from "./telling.js";

/** Часы, которые идут туда, куда скажут. */
function fakeClock() {
  let at = 0;
  const timers = new Map<number, { run: () => void; due: number }>();
  let next = 1;
  return {
    clock: {
      now: () => at,
      later: (run: () => void, ms: number) => {
        const id = next++;
        timers.set(id, { run, due: at + ms });
        return id;
      },
      stop: (timer: unknown) => void timers.delete(timer as number),
    },
    tick(ms: number) {
      at += ms;
      for (const [id, t] of [...timers]) {
        if (t.due <= at) {
          timers.delete(id);
          t.run();
        }
      }
    },
    set(ms: number) {
      at = ms;
    },
  };
}

const spy = () => {
  const sent: Seen[][] = [];
  return { sent, send: (seen: readonly Seen[]) => void sent.push([...seen]) };
};

describe("witness.the-screen-tells-without-getting-in-the-way", () => {
  it("событие не уходит сразу — копится до пачки", () => {
    const { clock, tick } = fakeClock();
    const { sent, send } = spy();
    const w = tableWitness(send, clock, 5000);
    w.saw("press", { g: "tip" });
    expect(sent).toHaveLength(0);
    tick(5000);
    expect(sent).toEqual([[{ at: 0, kind: "press", what: { g: "tip" } }]]);
  });

  it("одинаковое подряд сжимается в одну запись со счётчиком", () => {
    const { clock, tick } = fakeClock();
    const { sent, send } = spy();
    const w = tableWitness(send, clock, 5000);
    for (let i = 0; i < 40; i += 1) w.saw("drag", { g: "carry" });
    expect(w.heap).toHaveLength(1);
    tick(5000);
    expect(sent[0]).toEqual([{ at: 0, kind: "drag", what: { g: "carry", times: 40 } }]);
  });

  it("то же событие спустя время — отдельная запись, а не счётчик", () => {
    const { clock, tick, set } = fakeClock();
    const { sent, send } = spy();
    const w = tableWitness(send, clock, 60_000);
    w.saw("press", { g: "tip" });
    set(SAME_MS + 1);
    w.saw("press", { g: "tip" });
    expect(w.heap).toHaveLength(2);
    tick(60_000);
    expect(sent[0]).toHaveLength(2);
  });

  it("разные события подряд не слипаются", () => {
    const { clock } = fakeClock();
    const w = tableWitness(spy().send, clock, 5000);
    w.saw("press", { g: "tip" });
    w.saw("press", { g: "zone" });
    expect(w.heap).toHaveLength(2);
  });

  it("переполненная копилка уходит сама, не дожидаясь срока", () => {
    const { clock } = fakeClock();
    const { sent, send } = spy();
    const w = tableWitness(send, clock, 60_000);
    for (let i = 0; i < HEAP_MAX; i += 1) w.saw("press", { i });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toHaveLength(HEAP_MAX);
    expect(w.heap).toHaveLength(0);
  });

  it("упавшая отправка не выходит наружу и копилку всё равно освобождает", () => {
    const { clock } = fakeClock();
    const w = tableWitness(
      () => {
        throw new Error("нет связи");
      },
      clock,
      5000,
    );
    w.saw("press");
    expect(() => w.tell()).not.toThrow();
    expect(w.heap).toHaveLength(0);
  });

  it("пустая копилка на сервер не ходит", () => {
    const { clock } = fakeClock();
    const send = vi.fn();
    tableWitness(send, clock, 5000).tell();
    expect(send).not.toHaveBeenCalled();
  });

  it("отправленное не уходит вторым разом", () => {
    const { clock } = fakeClock();
    const { sent, send } = spy();
    const w = tableWitness(send, clock, 5000);
    w.saw("press");
    w.tell();
    w.tell();
    expect(sent).toHaveLength(1);
  });
});
