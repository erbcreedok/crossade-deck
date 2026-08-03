import { describe, expect, it } from "vitest";
import { applyHandOrder, isPermutationOf, snapshotFrom, type CrossadeRaw, type RawPlayer } from "./state";

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

describe("isPermutationOf", () => {
  it("тот же набор в другом порядке — перестановка", () => {
    expect(isPermutationOf(["A", "B", "C"], ["C", "A", "B"])).toBe(true);
  });
  it("разная длина или разный состав — не перестановка", () => {
    expect(isPermutationOf(["A", "B"], ["A", "B", "C"])).toBe(false);
    expect(isPermutationOf(["A", "B", "D"], ["A", "B", "C"])).toBe(false);
  });
});

describe("applyHandOrder — удержание порядка руки", () => {
  it("нет localOrder — серверный порядок как есть", () => {
    expect(applyHandOrder(["A", "B"], null)).toEqual(["A", "B"]);
  });

  it("перестановка того же набора держится целиком", () => {
    expect(applyHandOrder(["A", "B", "C"], ["C", "A", "B"])).toEqual(["C", "A", "B"]);
  });

  it("добор карты не сбрасывает порядок — новая карта остаётся на своём серверном месте", () => {
    // Пользователь разложил A,B,C как C,A,B; сервер добавил D в конец.
    expect(applyHandOrder(["A", "B", "C", "D"], ["C", "A", "B"])).toEqual(["C", "A", "B", "D"]);
  });

  it("сброс карты из руки — оставшиеся сохраняют взаимный порядок", () => {
    // Локально было C,A,B; сервер лишился A (сыграна) — остаются C,B в том же порядке.
    expect(applyHandOrder(["C", "B"], ["C", "A", "B"])).toEqual(["C", "B"]);
  });

  it("состав изменился полностью (все карты новые) — серверный порядок", () => {
    expect(applyHandOrder(["X", "Y"], ["A", "B"])).toEqual(["X", "Y"]);
  });
});

describe("snapshotFrom — stale-check по deckRev", () => {
  it("устаревшее эхо (rev меньше прежнего) — возвращает prev без изменений", () => {
    const prev = snapshotFrom(raw({ deckRev: 5, deck: ["A", "B"] }), "s1");
    const stale = snapshotFrom(raw({ deckRev: 3, deck: ["Z"] }), "s1", prev);
    expect(stale).toBe(prev);
    expect(stale.deck).toEqual(["A", "B"]);
  });

  it("более новое или равное rev — пересобирает снимок", () => {
    const prev = snapshotFrom(raw({ deckRev: 5, deck: ["A", "B"] }), "s1");

    const same = snapshotFrom(raw({ deckRev: 5, deck: ["A", "B", "C"] }), "s1", prev);
    expect(same.deck).toEqual(["A", "B", "C"]);

    const newer = snapshotFrom(raw({ deckRev: 6, deck: ["Z"] }), "s1", same);
    expect(newer.deck).toEqual(["Z"]);
  });
});

describe("snapshotFrom — видимость чужой руки", () => {
  it("чужая закрытая рука → hand null, но handCount верный", () => {
    const state = snapshotFrom(
      raw({
        seatOrder: ["s1", "s2"],
        players: {
          s1: player({ hand: ["A♠", "K♥"], handOpen: false }),
          s2: player({ hand: ["Q♦"], handOpen: false }),
        },
      }),
      "s2",
    );
    const other = state.seats.find((s) => s.sessionId === "s1")!;
    expect(other.hand).toBeNull();
    expect(other.handCount).toBe(2);
  });

  it("чужая ОТКРЫТАЯ рука видна целиком", () => {
    const state = snapshotFrom(
      raw({
        seatOrder: ["s1", "s2"],
        players: {
          s1: player({ hand: ["A♠", "K♥"], handOpen: true }),
          s2: player({ hand: [], handOpen: false }),
        },
      }),
      "s2",
    );
    expect(state.seats.find((s) => s.sessionId === "s1")!.hand).toEqual(["A♠", "K♥"]);
  });

  it("своя рука видна ВСЕГДА, даже если handOpen=false", () => {
    const state = snapshotFrom(
      raw({
        seatOrder: ["s1"],
        players: { s1: player({ hand: ["7♣"], handOpen: false }) },
      }),
      "s1",
    );
    expect(state.seats[0]!.hand).toEqual(["7♣"]);
    expect(state.selfHand).toEqual(["7♣"]);
  });
});

describe("snapshotFrom — seats в порядке seatOrder, начиная с дилера", () => {
  it("seatOrder уже голова круга — seats идут в том же порядке", () => {
    const state = snapshotFrom(
      raw({
        seatOrder: ["dealer-sid", "s2", "s3"],
        players: {
          "dealer-sid": player({ isDealer: true }),
          s2: player(),
          s3: player(),
        },
      }),
      "s2",
    );
    expect(state.seats.map((s) => s.sessionId)).toEqual(["dealer-sid", "s2", "s3"]);
    expect(state.seats[0]!.isDealer).toBe(true);
  });

  it("игрок выпавший из seatOrder (рассинхрон) дописывается в хвост, а не теряется", () => {
    const state = snapshotFrom(
      raw({
        seatOrder: ["s1"],
        players: { s1: player(), s2: player() },
      }),
      "s1",
    );
    expect(state.seats.map((s) => s.sessionId)).toEqual(["s1", "s2"]);
  });
});
