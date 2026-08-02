import { describe, it, expect } from "vitest";
import { sameColorRule } from "./boardRules";

// Правило приёма — последний гейт цепочки, и ошибаться оно обязано в сторону «нельзя».

const ctx = (figureId: string, toKey: string) => ({ figureId, toKey, fromKey: "a", board: { slots: {}, onEmpty: "keep" as const } });

describe("sameColorRule", () => {
  const figures = new Map([
    ["dark-1", true],
    ["light-1", false],
  ]);
  const slots = new Map([
    ["s-dark", true],
    ["s-light", false],
  ]);
  const rule = sameColorRule(figures, slots);

  it("свой цвет — принимает", () => {
    expect(rule(ctx("dark-1", "s-dark"))).toBe(true);
    expect(rule(ctx("light-1", "s-light"))).toBe(true);
  });

  it("чужой цвет — отказ", () => {
    expect(rule(ctx("dark-1", "s-light"))).toBe(false);
    expect(rule(ctx("light-1", "s-dark"))).toBe(false);
  });

  it("незнакомая фигура или незнакомый слот — отказ, а не «разрешено»", () => {
    expect(rule(ctx("ghost", "s-dark"))).toBe(false);
    expect(rule(ctx("dark-1", "s-ghost"))).toBe(false);
  });
});
