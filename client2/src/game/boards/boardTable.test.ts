import { afterEach, describe, expect, it, vi } from "vitest";
import { at } from "../slotfield/slotField";
import { createBoardTable } from "./boardTable";
import { handOf } from "./state";
import { durakBoard } from "./library";

// Общий стол борды: одно авторитетное состояние, команды клиентов применяются по одной,
// снимок летит всем (эхо автору включительно), latency — на оба плеча.

afterEach(() => vi.useRealTimers());

describe("createBoardTable", () => {
  it("ход одного клиента виден всем: снимки долетают каждому подписчику", () => {
    const t = createBoardTable({ spec: durakBoard(), seats: 2 });
    const seen: string[][] = [[], []];
    t.drivers[0]!.onState((s) => seen[0]!.push(at(s.field, "table:r0c0")?.members.join(",") ?? ""));
    t.drivers[1]!.onState((s) => seen[1]!.push(at(s.field, "table:r0c0")?.members.join(",") ?? ""));
    const card = handOf(t.state, "p1")[0]!;
    t.drivers[0]!.dispatch({ t: "move", el: card, from: "hand:p1", to: "table:r0c0" });
    expect(seen[0]!.at(-1)).toBe(card);
    expect(seen[1]!.at(-1)).toBe(card);
  });

  it("политики зон решаются ОДИН раз мастером: пара дурака отвергает третью карту у всех", () => {
    const t = createBoardTable({ spec: durakBoard(), seats: 2 });
    const [a, b, c] = handOf(t.state, "p1");
    t.drivers[0]!.dispatch({ t: "move", el: a!, from: "hand:p1", to: "table:r0c0" });
    t.drivers[1]!.dispatch({ t: "move", el: b!, from: "hand:p1", to: "table:r0c0" });
    t.drivers[0]!.dispatch({ t: "move", el: c!, from: "hand:p1", to: "table:r0c0" });
    expect(at(t.state.field, "table:r0c0")?.members).toEqual([a, b]);
  });

  it("latency: команда доезжает через 2×latency, destroy отменяет недоставленное", () => {
    vi.useFakeTimers();
    const t = createBoardTable({ spec: durakBoard(), seats: 2, latencyMs: 50 });
    let last = t.state;
    t.drivers[1]!.onState((s) => (last = s));
    const card = handOf(t.state, "p2")[0]!;
    t.drivers[1]!.dispatch({ t: "move", el: card, from: "hand:p2", to: "table:r0c1" });
    vi.advanceTimersByTime(50);
    expect(at(last.field, "table:r0c1")?.members ?? []).toEqual([]);
    vi.advanceTimersByTime(50);
    expect(at(last.field, "table:r0c1")?.members).toEqual([card]);

    t.drivers[1]!.dispatch({ t: "move", el: card, from: "table:r0c1", to: "hand:p2" });
    t.destroy();
    vi.advanceTimersByTime(1000);
    expect(at(last.field, "table:r0c1")?.members).toEqual([card]); // недоставленное умерло
  });
});
