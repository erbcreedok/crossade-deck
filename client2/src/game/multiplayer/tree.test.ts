import { describe, expect, it } from "vitest";
import type { CrossadeSeat, CrossadeState } from "../crossade/state";
import { buildMultiplayerTree } from "./tree";

// Дерево дебаг-стола Multiplayer: без колоды/сброса, общая play-зона + рука + места. Проверяем
// то, что у родни ломалось (пустой слот как цель дропа, дом карты) и то, что специфично: слотов
// deck/discard тут НЕТ вовсе.

function seat(sessionId: string, over: Partial<CrossadeSeat> = {}): CrossadeSeat {
  return {
    sessionId,
    accountId: sessionId,
    name: "Игрок",
    isDealer: false,
    isReady: true,
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
    freeMode: true,
    deckFanned: false,
    deckRev: 0,
    inviteCode: "LOCAL",
    deck: [],
    discard: [],
    play: [],
    seats: [],
    selfSessionId: "p1",
    selfHand: [],
    ...over,
  };
}

describe("buildMultiplayerTree", () => {
  it("колоды и сброса на этом столе нет вовсе", () => {
    const tree = buildMultiplayerTree(state({ play: [["A♠"]], selfHand: ["K♥"] }));
    expect(tree.origins.deck).toBeUndefined();
    expect(tree.origins.discard).toBeUndefined();
  });

  it("play-зона всегда держит пустой слот «новая кучка», и он ловит дроп", () => {
    const tree = buildMultiplayerTree(state({ play: [["A♠"]] }));
    expect(tree.origins["play:new"]).toBeDefined();
    const at = tree.origins["play:new"]!;
    expect(tree.slotAt({ x: at.x + 10, y: at.y + 10 })).toBe("play:new");
  });

  it("карта кучки знает слот и дом; карты руки идут рядом по x", () => {
    const tree = buildMultiplayerTree(state({ play: [["A♠"]], selfHand: ["K♥", "Q♦"] }));
    expect(tree.slotOf("A♠")).toBe("play:0");
    expect(tree.homeOf("A♠")).not.toBeNull();
    const k = tree.homeOf("K♥")!;
    const q = tree.homeOf("Q♦")!;
    expect(q.x).toBeGreaterThan(k.x);
    expect(q.y).toBe(k.y);
  });

  it("пустая рука остаётся дропзоной (взять со стола можно и с пустой рукой)", () => {
    const tree = buildMultiplayerTree(state({ selfHand: [] }));
    const at = tree.origins.hand!;
    expect(tree.slotAt({ x: at.x + 10, y: at.y + 10 })).toBe("hand");
  });

  it("место каждого игрока получает origin, но дропзоной не является", () => {
    const tree = buildMultiplayerTree(state({ seats: [seat("p1"), seat("p2")] }));
    expect(tree.origins["seat:p1"]).toBeDefined();
    expect(tree.origins["seat:p2"]).toBeDefined();
    const at = tree.origins["seat:p2"]!;
    expect(tree.slotAt({ x: at.x + 5, y: at.y + 5 })).toBeNull();
  });

  it("доска растёт, если рука перерастает базовый габарит", () => {
    const small = buildMultiplayerTree(state({ selfHand: ["A♠"] }));
    const hand = Array.from({ length: 12 }, (_, i) => `c${i}`);
    const big = buildMultiplayerTree(state({ selfHand: hand }));
    expect(big.size.w).toBeGreaterThan(small.size.w);
  });
});
