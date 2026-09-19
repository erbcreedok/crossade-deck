// РАССКАЗУ ЭКРАНА НЕ ВЕРЯТ НА СЛОВО.
//
// Закон: из пачки берётся только то, что похоже на событие, и не больше положенного. Поток с одного
// экрана не может залить журнал.

import { describe, it, expect } from "vitest";
import { cleanWitnessed, Witnesses, SEEN_MAX, KIND_MAX, BATCHES_PER_SEC } from "./witness.js";

describe("witness.the-screen-is-heard-not-believed", () => {
  it("годное событие проходит целиком", () => {
    expect(cleanWitnessed({ seen: [{ at: 5, kind: "press", what: { g: "tip" } }] })).toEqual({
      seen: [{ at: 5, kind: "press", what: { g: "tip" } }],
    });
  });

  it("событие без подробностей — тоже событие", () => {
    expect(cleanWitnessed({ seen: [{ at: 5, kind: "open" }] })?.seen[0]).toEqual({ at: 5, kind: "open" });
  });

  it("мусор вместо пачки отбрасывается", () => {
    for (const raw of [null, undefined, 7, "пачка", {}, { seen: "нет" }, { seen: [] }]) {
      expect(cleanWitnessed(raw)).toBeNull();
    }
  });

  it("негодные события выбрасываются, годные из той же пачки остаются", () => {
    const got = cleanWitnessed({
      seen: [{ at: "скоро", kind: "press" }, null, { kind: "нет времени" }, { at: 1, kind: "" }, { at: 2, kind: "press" }],
    });
    expect(got?.seen).toEqual([{ at: 2, kind: "press" }]);
  });

  it("время, приехавшее 64-битным целым, принимается как время", () => {
    // Часы экрана не влезают в мелкое целое, и упаковщик сообщений отдаёт их `bigint`. Проверка
    // «это число» выбрасывала такой рассказ целиком и молча: сервер писал свою правду, экран — ничего.
    const got = cleanWitnessed({ seen: [{ at: 1758300000000n, kind: "open" }] });
    expect(got?.seen[0]).toEqual({ at: 1758300000000, kind: "open" });
  });

  it("время должно быть числом, а не бесконечностью", () => {
    expect(cleanWitnessed({ seen: [{ at: Number.NaN, kind: "press" }] })).toBeNull();
    expect(cleanWitnessed({ seen: [{ at: Number.POSITIVE_INFINITY, kind: "press" }] })).toBeNull();
  });

  it("длинный ярлык вида не проходит: это ярлык, а не текст", () => {
    expect(cleanWitnessed({ seen: [{ at: 1, kind: "я".repeat(KIND_MAX + 1) }] })).toBeNull();
    expect(cleanWitnessed({ seen: [{ at: 1, kind: "я".repeat(KIND_MAX) }] })).not.toBeNull();
  });

  it("слишком длинная пачка режется", () => {
    const seen = Array.from({ length: SEEN_MAX + 50 }, (_, i) => ({ at: i, kind: "press" }));
    expect(cleanWitnessed({ seen })?.seen).toHaveLength(SEEN_MAX);
  });

  it("поток с одного экрана останавливается на пределе", () => {
    const door = new Witnesses();
    for (let i = 0; i < BATCHES_PER_SEC; i += 1) expect(door.take("tg:7", 1000)).toBe(true);
    expect(door.take("tg:7", 1000)).toBe(false);
  });

  it("через секунду тот же экран снова пускают", () => {
    const door = new Witnesses();
    for (let i = 0; i < BATCHES_PER_SEC; i += 1) door.take("tg:7", 1000);
    expect(door.take("tg:7", 2001)).toBe(true);
  });

  it("буйный экран не затыкает соседа", () => {
    const door = new Witnesses();
    for (let i = 0; i < BATCHES_PER_SEC + 3; i += 1) door.take("tg:7", 1000);
    expect(door.take("tg:8", 1000)).toBe(true);
  });
});
