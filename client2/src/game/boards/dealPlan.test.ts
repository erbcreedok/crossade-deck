import { describe, expect, it } from "vitest";
import { autoDealPlan, DEAL_PAIR_GAP, DEAL_SEAT_GAP, dealOrder } from "./dealPlan";

const seat = (id: string, occupant: string | null = id) => ({ id, occupant });

describe("autoDealPlan", () => {
  it("порядок: по кругу от следующего за дилером, дилер последним, пустые стулья пропущены", () => {
    const seats = [seat("p1"), seat("p2", null), seat("p3"), seat("p4")];
    expect(dealOrder(seats, "p1")).toEqual(["p3", "p4", "p1"]);
  });

  it("по две карты каждому: пара почти синхронна, следующий игрок — с паузой", () => {
    const plan = autoDealPlan([seat("p1"), seat("p2")], "p1");
    expect(plan.map((s) => s.seat)).toEqual(["p2", "p2", "p1", "p1"]);
    expect(plan[1]!.delay - plan[0]!.delay).toBeCloseTo(DEAL_PAIR_GAP, 6);
    expect(plan[2]!.delay - plan[0]!.delay).toBeCloseTo(DEAL_SEAT_GAP, 6);
    expect(plan[3]!.delay).toBeCloseTo(DEAL_SEAT_GAP + DEAL_PAIR_GAP, 6);
  });

  it("никого за столом — пустой план (раздавать некому, не падаем)", () => {
    expect(autoDealPlan([seat("p1", null)], "p1")).toEqual([]);
  });
});
