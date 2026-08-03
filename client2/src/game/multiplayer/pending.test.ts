import { describe, expect, it } from "vitest";
import { approvedIn, pendingIndicatorVisible, rejectedCards, PENDING_SLOW_AFTER_S } from "./pending";

describe("approvedIn", () => {
  it("play_card одобрен, когда карта появилась в ЛЮБОЙ кучке зоны", () => {
    expect(approvedIn("play_card", "J♥", { play: [["6♠"], ["J♥", "K♦"]], selfHand: [] })).toBe(true);
    expect(approvedIn("play_card", "J♥", { play: [["6♠"]], selfHand: ["J♥"] })).toBe(false);
  });

  it("take_play одобрен, когда карта появилась в СВОЕЙ руке", () => {
    expect(approvedIn("take_play", "J♥", { play: [], selfHand: ["6♠", "J♥"] })).toBe(true);
    expect(approvedIn("take_play", "J♥", { play: [["J♥"]], selfHand: [] })).toBe(false);
  });
});

describe("rejectedCards", () => {
  it("отказ бьёт только по тем ожидающим, кого перечислил сервер", () => {
    expect(rejectedCards(["J♥", "6♠"], ["J♥", "K♦"])).toEqual(["J♥"]);
    expect(rejectedCards([], ["J♥"])).toEqual([]);
  });
});

describe("pendingIndicatorVisible — индикатор затянувшегося запроса", () => {
  it("быстрый ответ индикатора не заслуживает: до порога скрыт, после — виден", () => {
    expect(pendingIndicatorVisible(0)).toBe(false);
    expect(pendingIndicatorVisible(PENDING_SLOW_AFTER_S - 0.01)).toBe(false);
    expect(pendingIndicatorVisible(PENDING_SLOW_AFTER_S)).toBe(true);
  });
});
