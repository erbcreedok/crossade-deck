import { describe, expect, it } from "vitest";
import { isParametric, outlineOf } from "game-kit";
import { SUITS, suitByName } from "./suits.js";

describe("suits — the four marks as vector shapes", () => {
  it("suits.four-are-named — spade, heart, diamond, club and no fifth", () => {
    expect(SUITS.map((s) => s.name).sort()).toEqual(["club", "diamond", "heart", "spade"]);
    expect(new Set(SUITS.map((s) => s.name)).size).toBe(4);
  });

  it("suits.shapes-are-finite — every mark flattens to real points inside a real box", () => {
    for (const suit of SUITS) {
      const points = outlineOf(suit.shape);
      expect(points.length, `${suit.name}: no outline`).toBeGreaterThan(2);
      for (const p of points) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y), `${suit.name}: non-finite point`).toBe(true);
      }
    }
  });

  it("suits.reds-spin-blacks-ink — colour follows the owner's decision, no raw hex", () => {
    // Red suits ride the parametric `spin` (one hue for both); black suits ride the ink token.
    for (const suit of SUITS) {
      if (suit.color === "red") {
        expect(isParametric(suit.paint), `${suit.name} should be parametric`).toBe(true);
        expect((suit.paint as { token: string }).token).toBe("spin");
      } else {
        expect(suit.paint).toBe("text");
      }
    }
    expect(SUITS.filter((s) => s.color === "red").map((s) => s.name).sort()).toEqual(["diamond", "heart"]);
  });

  it("suits.by-name — resolves a mark, and a dangling name is undefined not a throw", () => {
    expect(suitByName("spade")?.color).toBe("black");
    // @ts-expect-error a name outside the union is exactly the dangling case
    expect(suitByName("crown")).toBeUndefined();
  });
});
