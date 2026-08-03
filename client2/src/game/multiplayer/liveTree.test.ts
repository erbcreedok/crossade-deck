import { describe, expect, it } from "vitest";
import type { CrossadeState } from "../crossade/state";
import { buildLiveTree, isSharedPoint, othersInRing, type LiveHands } from "./liveTree";
import { buildMultiplayerTree } from "./tree";

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

const noOthers: LiveHands = { order: [], hands: {} };

describe("buildLiveTree — общая система координат", () => {
  it("публичные зоны стоят на ОДНИХ координатах при разном числе игроков сверху", () => {
    const two = buildLiveTree(state(), { order: ["p2"], hands: { p2: ["x1"] } });
    const five = buildLiveTree(state(), { order: ["p2", "p3", "p4", "p5"], hands: { p2: ["x1"], p3: [], p4: [], p5: [] } });
    expect(two.origins["play:new"]).toEqual(five.origins["play:new"]);
    expect(two.origins.discard).toEqual(five.origins.discard);
    expect(two.origins.hand).toEqual(five.origins.hand);
  });

  it("сброс есть и ловит дроп; рубашки чужих рук знают слот и дом", () => {
    const tree = buildLiveTree(state(), { order: ["p2"], hands: { p2: ["x3", "x7"] } });
    const d = tree.origins.discard!;
    expect(tree.slotAt({ x: d.x + 10, y: d.y + 10 })).toBe("discard");
    expect(tree.slotOf("x3")).toBe("seat:p2");
    expect(tree.homeOf("x7")).not.toBeNull();
    const a = tree.homeOf("x3")!;
    const b = tree.homeOf("x7")!;
    expect(b.x).toBeGreaterThan(a.x);
  });

  it("место игрока НЕ дропзона: жест над чужим рядом не резолвится в слот", () => {
    const tree = buildLiveTree(state(), { order: ["p2"], hands: { p2: ["x3"] } });
    const at = tree.origins["seat:p2"]!;
    expect(tree.slotAt({ x: at.x + 5, y: at.y + 5 })).toBeNull();
  });
});

describe("othersInRing", () => {
  it("после self идут остальные по кругу", () => {
    expect(othersInRing(["p1", "p2", "p3", "p4"], "p3")).toEqual(["p4", "p1", "p2"]);
    expect(othersInRing(["p1", "p2"], "p1")).toEqual(["p2"]);
  });
});

describe("isSharedPoint — приватность координат", () => {
  it("полоса мест — не публичная зона, публичные зоны — публичная", () => {
    const tree = buildLiveTree(state({ selfHand: ["A♠"] }), { order: ["p2"], hands: { p2: ["x1"] } });
    const seat = tree.origins["seat:p2"]!;
    const play = tree.origins["play:new"]!;
    const hand = tree.origins.hand!;
    expect(isSharedPoint({ x: seat.x + 10, y: seat.y + 10 })).toBe(false);
    expect(isSharedPoint({ x: play.x + 10, y: play.y + 10 })).toBe(true);
    expect(isSharedPoint({ x: hand.x + 10, y: hand.y + 10 })).toBe(true);
  });
});

describe("совместимость с базовым деревом", () => {
  it("live-дерево отдаёт тот же интерфейс MultiplayerTree (форма, не наследование)", () => {
    const live = buildLiveTree(state(), noOthers);
    const base = buildMultiplayerTree(state());
    for (const key of Object.keys(base) as (keyof typeof base)[]) expect(key in live).toBe(true);
  });
});
