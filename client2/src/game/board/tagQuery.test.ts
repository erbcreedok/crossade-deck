import { describe, expect, it } from "vitest";
import { and, any, hasAllTags, hasAnyTag, hasTag, not, or } from "./tagQuery";

const card7d = new Set(["card", "suit:♦", "rank:7", "color:red"]);
const chip = new Set(["chip", "color:green"]);

describe("tagQuery", () => {
  it("hasTag", () => {
    expect(hasTag("card")(card7d)).toBe(true);
    expect(hasTag("card")(chip)).toBe(false);
  });

  it("hasAllTags — «только буби»", () => {
    const onlyDiamonds = hasAllTags(["card", "suit:♦"]);
    expect(onlyDiamonds(card7d)).toBe(true);
    expect(onlyDiamonds(new Set(["card", "suit:♠"]))).toBe(false);
    expect(hasAllTags([])(chip)).toBe(true); // пустой список — истина
  });

  it("hasAnyTag", () => {
    expect(hasAnyTag(["chip", "card"])(chip)).toBe(true);
    expect(hasAnyTag(["a", "b"])(chip)).toBe(false);
    expect(hasAnyTag([])(chip)).toBe(false); // пустой список — ложь
  });

  it("not / and / or комбинируются", () => {
    expect(not(hasTag("card"))(chip)).toBe(true);
    expect(and(hasTag("card"), hasTag("color:red"))(card7d)).toBe(true);
    expect(and(hasTag("card"), hasTag("color:black"))(card7d)).toBe(false);
    expect(or(hasTag("chip"), hasTag("card"))(chip)).toBe(true);
    expect(and()(chip)).toBe(true);
    expect(or()(chip)).toBe(false);
  });

  it("any — всегда истина", () => {
    expect(any(card7d)).toBe(true);
    expect(any(new Set())).toBe(true);
  });
});
