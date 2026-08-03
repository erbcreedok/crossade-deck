import { describe, expect, it } from "vitest";
import { cardTags, withTags } from "./elementTags";

describe("cardTags", () => {
  it("раскладывает лицо на card/suit/rank/color", () => {
    const t = cardTags("7♦");
    expect(t).toEqual(new Set(["card", "suit:♦", "rank:7", "color:red"]));
  });

  it("чёрная масть → color:black, именованный ранг", () => {
    const t = cardTags("Q♠");
    expect(t.has("card")).toBe(true);
    expect(t.has("suit:♠")).toBe(true);
    expect(t.has("rank:12")).toBe(true);
    expect(t.has("color:black")).toBe(true);
  });

  it("придержанное значение (пустое лицо) → только card", () => {
    expect(cardTags("")).toEqual(new Set(["card"]));
  });
});

describe("withTags", () => {
  it("домешивает игровые теги без дублей", () => {
    const t = withTags(cardTags("7♦"), ["role:trump", "card"]);
    expect(t.has("role:trump")).toBe(true);
    expect([...t].filter((x) => x === "card")).toHaveLength(1);
  });

  it("без extra возвращает копию базы", () => {
    const base = cardTags("A♣");
    const t = withTags(base);
    expect(t).toEqual(base);
    expect(t).not.toBe(base);
  });
});
