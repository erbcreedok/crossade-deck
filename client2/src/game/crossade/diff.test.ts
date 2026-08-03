import { describe, expect, it } from "vitest";
import { sameOrder, sameZones } from "./diff";
import { snapshotFrom, type CrossadeRaw, type RawPlayer } from "./state";

function player(over: Partial<RawPlayer> = {}): RawPlayer {
  return {
    id: "acc-1",
    name: "Игрок",
    isDealer: false,
    isReady: false,
    isBot: false,
    connected: true,
    handOpen: false,
    hand: [],
    ...over,
  };
}

function raw(over: Partial<CrossadeRaw> = {}): CrossadeRaw {
  return {
    phase: "lobby",
    freeMode: false,
    deckFanned: false,
    deckRev: 0,
    inviteCode: "ABC123",
    deck: [],
    discard: [],
    play: [],
    seatOrder: [],
    players: {},
    ...over,
  };
}

describe("sameOrder", () => {
  it("одинаковые массивы — true", () => {
    expect(sameOrder(["A", "B"], ["A", "B"])).toBe(true);
  });
  it("тот же состав, другой порядок — false (это НЕ isPermutationOf)", () => {
    expect(sameOrder(["A", "B"], ["B", "A"])).toBe(false);
  });
  it("разная длина — false", () => {
    expect(sameOrder(["A"], ["A", "B"])).toBe(false);
  });
});

describe("sameZones", () => {
  it("нет предыдущего снимка — false (первая сборка всегда полная)", () => {
    const next = snapshotFrom(raw({ deck: ["A"] }), "s1");
    expect(sameZones(null, next)).toBe(false);
  });

  it("зоны не изменились, поменялось что-то другое (freeMode) — true", () => {
    const prev = snapshotFrom(raw({ deck: ["A", "B"], freeMode: false }), "s1");
    const next = snapshotFrom(raw({ deck: ["A", "B"], freeMode: true }), "s1", prev);
    expect(sameZones(prev, next)).toBe(true);
  });

  it("колода поменяла порядок — false", () => {
    const prev = snapshotFrom(raw({ deck: ["A", "B"] }), "s1");
    const next = snapshotFrom(raw({ deck: ["B", "A"], deckRev: 1 }), "s1", prev);
    expect(sameZones(prev, next)).toBe(false);
  });

  it("сброс пополнился картой — false", () => {
    const prev = snapshotFrom(raw({ discard: ["A"] }), "s1");
    const next = snapshotFrom(raw({ discard: ["A", "B"], deckRev: 1 }), "s1", prev);
    expect(sameZones(prev, next)).toBe(false);
  });

  it("play-стопка выросла на карту — false", () => {
    const prev = snapshotFrom(raw({ play: [{ cards: ["A"] }] }), "s1");
    const next = snapshotFrom(raw({ play: [{ cards: ["A", "B"] }] }), "s1", prev);
    expect(sameZones(prev, next)).toBe(false);
  });

  it("новая (ещё одна) play-стопка появилась — false", () => {
    const prev = snapshotFrom(raw({ play: [] }), "s1");
    const next = snapshotFrom(raw({ play: [{ cards: ["A"] }] }), "s1", prev);
    expect(sameZones(prev, next)).toBe(false);
  });

  it("своя рука переставлена ЛОКАЛЬНО (тот же набор) держится — зоны те же", () => {
    const prev = snapshotFrom(
      raw({ seatOrder: ["s1"], players: { s1: player({ hand: ["A", "B"] }) } }),
      "s1",
    );
    // Сервер прислал ту же руку в другом порядке — applyHandOrder держит prev.selfHand целиком.
    const next = snapshotFrom(
      raw({ seatOrder: ["s1"], players: { s1: player({ hand: ["B", "A"] }) } }),
      "s1",
      prev,
    );
    expect(next.selfHand).toEqual(prev.selfHand); // удержание порядка сработало (state.ts)
    expect(sameZones(prev, next)).toBe(true);
  });

  it("своя рука реально изменилась (добор карты) — false", () => {
    const prev = snapshotFrom(
      raw({ seatOrder: ["s1"], players: { s1: player({ hand: ["A"] }) } }),
      "s1",
    );
    const next = snapshotFrom(
      raw({ seatOrder: ["s1"], players: { s1: player({ hand: ["A", "B"] }) } }),
      "s1",
      prev,
    );
    expect(sameZones(prev, next)).toBe(false);
  });
});
