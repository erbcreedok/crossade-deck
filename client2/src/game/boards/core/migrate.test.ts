import { describe, expect, it } from "vitest";
import { migrateState } from "./migrate";
import { roundTableBoard } from "../library/roundTable";
import { initialState } from "./state";

describe("migrateState — смена спеки не теряет карты", () => {
  it("динамика → кольцо: жители контейнера рассыпаются по фикс-слотам по кругу", () => {
    const from = roundTableBoard({ slots: "dynamic", dealt: 5 });
    const to = roundTableBoard({ slots: 4, dealt: 0 });
    const old = initialState(from, 4);
    const next = migrateState(old, to);
    const spread = [0, 1, 2, 3].map((i) => next.field.slots[`table:${i}`]?.members ?? []);
    expect(spread.flat().sort()).toEqual((old.field.slots["table:0"]?.members ?? []).slice().sort());
    expect(spread[0]!.length).toBe(2); // 5 жителей на 4 слота: первый получает двоих (i % n)
    // Колода в боксе едет как есть.
    expect(next.field.slots["board:0"]!.members).toEqual(old.field.slots["board:0"]!.members);
  });

  it("кольцо → динамика: все фикс-слоты сливаются в один контейнер в порядке слотов", () => {
    const from = roundTableBoard({ slots: 4, dealt: 4 });
    const to = roundTableBoard({ slots: "dynamic", dealt: 0 });
    const old = initialState(from, 4);
    const next = migrateState(old, to);
    expect(next.field.slots["table:0"]!.members).toEqual(
      [0, 1, 2, 3].flatMap((i) => old.field.slots[`table:${i}`]?.members ?? []),
    );
  });

  it("меньше посадок: рука исчезнувшего места высыпается в первую зону, ход не указывает в пустоту", () => {
    const spec = roundTableBoard({ seats: 4, dealt: 0 });
    let old = initialState(spec, 4);
    old = { ...old, field: { ...old.field, slots: { ...old.field.slots, "hand:p4": { members: ["6♥", "7♥"] } } }, turn: { at: 3, dir: 1 } };
    const next = migrateState(old, roundTableBoard({ seats: 2, dealt: 0 }), 2);
    expect(next.seats.length).toBe(2);
    expect(next.field.slots["hand:p4"]).toBeUndefined();
    expect(next.field.slots["board:0"]!.members).toContain("6♥");
    expect(next.turn.at).toBe(1);
    // Рука ЖИВОГО места едет как есть.
    const withHand = { ...old, field: { ...old.field, slots: { ...old.field.slots, "hand:p1": { members: ["8♥"] } } } };
    expect(migrateState(withHand, roundTableBoard({ seats: 2, dealt: 0 }), 2).field.slots["hand:p1"]!.members).toEqual(["8♥"]);
  });
});
