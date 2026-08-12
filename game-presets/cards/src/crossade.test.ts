import { describe, expect, it } from "vitest";
import { CROSSADE_FIELDS, crossade } from "./crossade.js";

describe("crossade — the 55-card set as data", () => {
  it("crossade.is-fifty-five — 52 standard + 2 jokers + 1 brand", () => {
    expect(crossade()).toHaveLength(55);
  });

  it("crossade.two-jokers-one-brand — the counts by kind are 52 / 2 / 1", () => {
    const by = (kind: string) => crossade().filter((c) => c.kind === kind).length;
    expect(by("pip")).toBe(52);
    expect(by("joker")).toBe(2);
    expect(by("brand")).toBe(1);
    expect(crossade().find((c) => c.kind === "brand")!.label).toBe("crossade deck");
  });

  it("crossade.fields-are-typed — every value a card carries is a declared ordered field value", () => {
    for (const card of crossade()) {
      for (const [field, value] of Object.entries(card.values)) {
        const declared = (CROSSADE_FIELDS as Record<string, { values: readonly string[] }>)[field];
        expect(declared, `${card.id}: undeclared field ${field}`).toBeTruthy();
        expect(declared!.values, `${card.id}.${field}=${value} not in the field's order`).toContain(value);
      }
    }
  });

  it("crossade.ids-are-unique — a stable id per physical card, none repeated", () => {
    const ids = crossade().map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("crossade.pip-colour-follows-suit — hearts and diamonds are red, spades and clubs black", () => {
    const pips = crossade().filter((c) => c.kind === "pip");
    for (const card of pips) {
      const expected = card.values.suit === "heart" || card.values.suit === "diamond" ? "red" : "black";
      expect(card.values.colour, `${card.id}`).toBe(expected);
    }
  });
});
