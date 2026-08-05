import { describe, expect, it } from "vitest";
import { armedTargets, canDragFrom, routeDrop } from "./moveRules";
import type { CrossadeSeat, CrossadeState } from "./state";

/** Своё место за столом — дилерство правило читает из него, а не из аргумента. */
function seat(over: Partial<CrossadeSeat> = {}): CrossadeSeat {
  return {
    sessionId: "me",
    accountId: "acc-me",
    name: "Я",
    isDealer: false,
    isReady: true,
    isBot: false,
    connected: true,
    handOpen: false,
    handCount: 0,
    hand: [],
    ...over,
  };
}

function state(over: Partial<CrossadeState> = {}): CrossadeState {
  return {
    phase: "lobby",
    freeMode: false,
    deckFanned: false,
    deckRev: 0,
    inviteCode: "ABC123",
    deck: [],
    discard: [],
    play: [],
    seats: [],
    selfSessionId: "me",
    selfHand: [],
    ...over,
  };
}

describe("canDragFrom", () => {
  it("карта своей руки поднимается всегда", () => {
    expect(canDragFrom({ slot: "hand", card: "AS", state: state() })).toBe(true);
  });

  it("карта без слота не поднимается", () => {
    expect(canDragFrom({ slot: null, card: "AS", state: state() })).toBe(false);
  });

  it("колода: только ВЕРХНЯЯ карта", () => {
    const s = state({ deck: ["6H", "AS"], freeMode: true });
    expect(canDragFrom({ slot: "deck", card: "AS", state: s })).toBe(true);
    expect(canDragFrom({ slot: "deck", card: "6H", state: s })).toBe(false);
  });

  it("колода в лобби: дилеру да, остальным нет (раздача драгом)", () => {
    const asDealer = state({ deck: ["AS"], phase: "lobby", freeMode: false, seats: [seat({ isDealer: true })] });
    const asPlayer = state({ deck: ["AS"], phase: "lobby", freeMode: false, seats: [seat({ isDealer: false })] });
    expect(canDragFrom({ slot: "deck", card: "AS", state: asDealer })).toBe(true);
    expect(canDragFrom({ slot: "deck", card: "AS", state: asPlayer })).toBe(false);
  });

  it("колода в лобби: без своего места за столом — нет (снимок ещё не пришёл)", () => {
    const s = state({ deck: ["AS"], phase: "lobby", freeMode: false, seats: [] });
    expect(canDragFrom({ slot: "deck", card: "AS", state: s })).toBe(false);
  });

  it("колода в игре без freeMode: нельзя даже дилеру", () => {
    const s = state({ deck: ["AS"], phase: "playing", freeMode: false, seats: [seat({ isDealer: true })] });
    expect(canDragFrom({ slot: "deck", card: "AS", state: s })).toBe(false);
  });

  it("сброс и кучка: верх, и только в freeMode", () => {
    const zones = { discard: ["2C", "3D"], play: [["7S", "8H"]] };
    const free = state({ ...zones, freeMode: true, phase: "playing" });
    expect(canDragFrom({ slot: "discard", card: "3D", state: free })).toBe(true);
    expect(canDragFrom({ slot: "discard", card: "2C", state: free })).toBe(false);
    expect(canDragFrom({ slot: "play:0", card: "8H", state: free })).toBe(true);
    expect(canDragFrom({ slot: "play:0", card: "7S", state: free })).toBe(false);

    const locked = state({ ...zones, freeMode: false, phase: "playing" });
    expect(canDragFrom({ slot: "discard", card: "3D", state: locked })).toBe(false);
    expect(canDragFrom({ slot: "play:0", card: "8H", state: locked })).toBe(false);
  });

  it("пустая кучка «play:new» груза не отдаёт", () => {
    const s = state({ freeMode: true, phase: "playing" });
    expect(canDragFrom({ slot: "play:new", card: "AS", state: s })).toBe(false);
  });
});

describe("armedTargets", () => {
  const slots = ["deck", "discard", "play:0", "play:new", "hand", "seat:me", "seat:other"];

  it("из руки: сброс, все кучки и сама рука (реордер)", () => {
    const out = armedTargets("hand", slots, "playing");
    expect([...out].sort()).toEqual(["discard", "hand", "play:0", "play:new"]);
  });

  it("из руки без сброса в дереве: сброс не зажигается (дебаг-стол)", () => {
    const out = armedTargets("hand", ["play:0", "play:new", "hand", "seat:me"], "playing");
    expect(out.has("discard")).toBe(false);
    expect([...out].sort()).toEqual(["hand", "play:0", "play:new"]);
  });

  it("из колоды в лобби: места за столом, включая своё («сдать себе»)", () => {
    const out = armedTargets("deck", slots, "lobby");
    expect([...out].sort()).toEqual(["seat:me", "seat:other"]);
  });

  it("из колоды в игре: рука", () => {
    expect([...armedTargets("deck", slots, "playing")]).toEqual(["hand"]);
  });

  it("из сброса и из кучки: рука", () => {
    expect([...armedTargets("discard", slots, "playing")]).toEqual(["hand"]);
    expect([...armedTargets("play:0", slots, "playing")]).toEqual(["hand"]);
  });

  it("из неизвестного слота: ничего", () => {
    expect(armedTargets("seat:other", slots, "playing").size).toBe(0);
  });
});

describe("routeDrop", () => {
  const base = { card: "AS", index: null, freeMode: true };

  it("рука → рука: реордер по индексу цели", () => {
    expect(routeDrop({ ...base, from: "hand", to: "hand", index: 2 })).toEqual({
      kind: "reorder_hand",
      card: "AS",
      toIndex: 2,
    });
  });

  it("рука → рука без индекса: ничего (цель не спрашивали)", () => {
    expect(routeDrop({ ...base, from: "hand", to: "hand" })).toBeNull();
  });

  it("рука → сброс и рука → кучка", () => {
    expect(routeDrop({ ...base, from: "hand", to: "discard" })).toEqual({ kind: "discard_card", card: "AS" });
    expect(routeDrop({ ...base, from: "hand", to: "play:3" })).toEqual({ kind: "play_card", card: "AS", stack: 3 });
  });

  it("рука → «новая кучка»: play_card БЕЗ номера стопки", () => {
    expect(routeDrop({ ...base, from: "hand", to: "play:new" })).toEqual({ kind: "play_card", card: "AS" });
  });

  it("колода → место: раздача драгом", () => {
    expect(routeDrop({ ...base, from: "deck", to: "seat:bob" })).toEqual({ kind: "deal_card", card: "AS", seat: "bob" });
  });

  it("забрать: колода/сброс/кучка → рука", () => {
    expect(routeDrop({ ...base, from: "deck", to: "hand" })).toEqual({ kind: "take_card" });
    expect(routeDrop({ ...base, from: "discard", to: "hand" })).toEqual({ kind: "take_discard" });
    expect(routeDrop({ ...base, from: "play:1", to: "hand" })).toEqual({ kind: "take_play", card: "AS" });
  });

  it("мимо слота из колоды в freeMode — это тап «взять»", () => {
    expect(routeDrop({ ...base, from: "deck", to: null })).toEqual({ kind: "take_card" });
  });

  it("мимо слота из колоды без freeMode — ничего", () => {
    expect(routeDrop({ ...base, from: "deck", to: null, freeMode: false })).toBeNull();
  });

  it("мимо слота из руки — ничего (карта летит домой)", () => {
    expect(routeDrop({ ...base, from: "hand", to: null })).toBeNull();
  });

  it("кучка → кучка напрямую — не MVP, ничего", () => {
    expect(routeDrop({ ...base, from: "play:0", to: "play:1" })).toBeNull();
  });
});
