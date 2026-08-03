import { describe, expect, it } from "vitest";
import {
  approvedIn,
  pendingDots,
  rejectedCards,
  PENDING_DOT_PERIOD_S,
  PENDING_SLOW_AFTER_S,
} from "./pending";

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

describe("pendingDots — индикатор затянувшегося запроса", () => {
  it("быстрый ответ индикатора не заслуживает: до порога — null", () => {
    expect(pendingDots(0)).toBeNull();
    expect(pendingDots(PENDING_SLOW_AFTER_S - 0.01)).toBeNull();
  });

  it("после порога точки растут и идут по кругу: · → ·· → ··· → ·", () => {
    const at = (n: number) => pendingDots(PENDING_SLOW_AFTER_S + PENDING_DOT_PERIOD_S * n + 0.01);
    expect(at(0)).toBe("·");
    expect(at(1)).toBe("··");
    expect(at(2)).toBe("···");
    expect(at(3)).toBe("·");
  });
});
