import { describe, expect, it } from "vitest";
import type { CrossadeSeat, CrossadeState } from "./state";
import { BOARD_H, BOARD_W, CARD, buildCrossadeTree } from "./tree";

// Дерево слотов — единственный источник геометрии стола Crossade, по образцу solitaire/tree.test.ts:
// проверяем то, что ЛОМАЛОСЬ у Косынки (дом vs угол слота, пустой слот как цель дропа) плюс то, что
// специфично для Crossade (фаза решает позицию колоды, play-зона всегда держит один пустой слот).

function seat(over: Partial<CrossadeSeat> = {}): CrossadeSeat {
  return {
    sessionId: "s1",
    accountId: "acc-1",
    name: "Игрок",
    isDealer: false,
    isReady: false,
    isBot: false,
    connected: true,
    handOpen: false,
    handCount: 0,
    hand: null,
    ...over,
  };
}

function state(over: Partial<CrossadeState> = {}): CrossadeState {
  return {
    phase: "playing",
    freeMode: false,
    deckFanned: false,
    deckRev: 0,
    inviteCode: "ABC123",
    deck: [],
    discard: [],
    play: [],
    seats: [],
    selfSessionId: "s1",
    selfHand: [],
    ...over,
  };
}

describe("buildCrossadeTree — колода", () => {
  it("в лобби колода стоит по центру стола", () => {
    const tree = buildCrossadeTree(state({ phase: "lobby", deck: ["A♠"] }));
    const centerX = BOARD_W / 2 - CARD.w / 2;
    expect(tree.origins.deck!.x).toBe(centerX);
  });

  it("в игре («ГОУ!») колода уходит влево, освобождая место сбросу и play-зоне", () => {
    const tree = buildCrossadeTree(state({ phase: "playing", deck: ["A♠"] }));
    const lobbyTree = buildCrossadeTree(state({ phase: "lobby", deck: ["A♠"] }));
    expect(tree.origins.deck!.x).toBeLessThan(lobbyTree.origins.deck!.x);
  });

  it("карта колоды знает свой слот и дом", () => {
    const tree = buildCrossadeTree(state({ deck: ["A♠", "K♥"] }));
    expect(tree.slotOf("A♠")).toBe("deck");
    expect(tree.homeOf("A♠")).not.toBeNull();
  });
});

describe("buildCrossadeTree — своя рука", () => {
  it("у каждой карты руки есть дом", () => {
    const tree = buildCrossadeTree(state({ selfHand: ["A♠", "K♥", "Q♦"] }));
    for (const card of ["A♠", "K♥", "Q♦"]) {
      expect(tree.homeOf(card)).not.toBeNull();
      expect(tree.slotOf(card)).toBe("hand");
    }
  });

  it("дома карт руки идут по РЯДУ (растут по x, не совпадают)", () => {
    const tree = buildCrossadeTree(state({ selfHand: ["A♠", "K♥"] }));
    const a = tree.homeOf("A♠")!;
    const k = tree.homeOf("K♥")!;
    expect(k.x).toBeGreaterThan(a.x);
    expect(k.y).toBe(a.y);
  });
});

describe("buildCrossadeTree — сброс", () => {
  it("slotAt попадает в слот сброса", () => {
    const tree = buildCrossadeTree(state());
    const d = tree.origins.discard!;
    const point = { x: d.x + CARD.w / 2, y: d.y + CARD.h / 2 };
    expect(tree.slotAt(point)).toBe("discard");
  });

  it("сброс держит габарит и пустым — цель дропа не исчезает", () => {
    const tree = buildCrossadeTree(state({ discard: [] }));
    expect(tree.origins.discard).toBeDefined();
    const d = tree.origins.discard!;
    expect(tree.slotAt({ x: d.x + CARD.w / 2, y: d.y + CARD.h / 2 })).toBe("discard");
  });
});

describe("buildCrossadeTree — play-зона", () => {
  it("пустая play-зона держит ровно один слот «новая кучка»", () => {
    const tree = buildCrossadeTree(state({ play: [] }));
    expect(tree.origins["play:new"]).toBeDefined();
    expect(tree.origins["play:0"]).toBeUndefined();
  });

  it("после добавления кучки появляется ЕЩЁ один пустой слот «новая», а не два", () => {
    const withOne = buildCrossadeTree(state({ play: [["7♠"]] }));
    expect(withOne.slotOf("7♠")).toBe("play:0");
    expect(withOne.origins["play:new"]).toBeDefined();
    expect(withOne.origins["play:1"]).toBeUndefined();

    const withTwo = buildCrossadeTree(state({ play: [["7♠"], ["8♦"]] }));
    expect(withTwo.slotOf("8♦")).toBe("play:1");
    expect(withTwo.origins["play:new"]).toBeDefined();
    expect(withTwo.origins["play:2"]).toBeUndefined();
  });

  it("кучка play-зоны — дропзона (общая, берёт любую карту)", () => {
    const tree = buildCrossadeTree(state({ play: [["7♠"]] }));
    const p0 = tree.origins["play:0"]!;
    expect(tree.slotAt({ x: p0.x + CARD.w / 2, y: p0.y + CARD.h / 2 })).toBe("play:0");
  });
});

describe("buildCrossadeTree — места игроков", () => {
  it("каждое место занимает свой слот полосой сверху", () => {
    const tree = buildCrossadeTree(state({ seats: [seat({ sessionId: "s1" }), seat({ sessionId: "s2" })] }));
    const a = tree.origins["seat:s1"]!;
    const b = tree.origins["seat:s2"]!;
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(b.x).toBeGreaterThan(a.x);
    expect(a.y).toBe(b.y);
  });
});

describe("buildCrossadeTree — габарит доски", () => {
  it("габарит доски стабилен в покое", () => {
    const tree = buildCrossadeTree(state());
    expect(tree.size).toEqual({ w: BOARD_W, h: BOARD_H });
  });

  it("растёт под руку, переросшую базовую ширину доски", () => {
    const bigHand = Array.from({ length: 40 }, (_, i) => `card-${i}`);
    const tree = buildCrossadeTree(state({ selfHand: bigHand }));
    expect(tree.size.w).toBeGreaterThan(BOARD_W);
  });

  it("дроп мимо доски — ничей", () => {
    const tree = buildCrossadeTree(state());
    expect(tree.slotAt({ x: -500, y: -500 })).not.toBe("discard");
    expect(tree.slotAt({ x: -500, y: -500 })).not.toBe("hand");
  });
});
