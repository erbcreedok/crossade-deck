import { describe, expect, it } from "vitest";
import { cardTags } from "./elementTags";
import { ELIGIBLE, canSelect, shouldLift, shouldOutline } from "./selectVisual";

describe("selectVisual — отбор-визуал как данные", () => {
  const diamond = cardTags("A♦"); // card, suit:♦, rank:A, color:red
  const spade = cardTags("10♠"); // card, suit:♠, ...
  const chip = new Set<string>(["chip"]);

  describe("eligible-предикаты (ELIGIBLE)", () => {
    it("cards: карта проходит, фишка — нет", () => {
      expect(canSelect(diamond, ELIGIBLE.cards!)).toBe(true);
      expect(canSelect(spade, ELIGIBLE.cards!)).toBe(true);
      expect(canSelect(chip, ELIGIBLE.cards!)).toBe(false);
    });

    it("any: проходит всё, включая фишку", () => {
      expect(canSelect(chip, ELIGIBLE.any!)).toBe(true);
      expect(canSelect(diamond, ELIGIBLE.any!)).toBe(true);
    });

    it("diamonds: проходят ТОЛЬКО буби", () => {
      expect(canSelect(diamond, ELIGIBLE.diamonds!)).toBe(true);
      expect(canSelect(spade, ELIGIBLE.diamonds!)).toBe(false);
      expect(canSelect(chip, ELIGIBLE.diamonds!)).toBe(false);
    });
  });

  describe("mark-хелперы", () => {
    it("shouldLift: подъём при lift/both, не при outline", () => {
      expect(shouldLift("lift")).toBe(true);
      expect(shouldLift("both")).toBe(true);
      expect(shouldLift("outline")).toBe(false);
    });

    it("shouldOutline: контур при outline/both, не при lift", () => {
      expect(shouldOutline("outline")).toBe(true);
      expect(shouldOutline("both")).toBe(true);
      expect(shouldOutline("lift")).toBe(false);
    });
  });
});
