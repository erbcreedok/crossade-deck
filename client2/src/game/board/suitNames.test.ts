import { describe, expect, it } from "vitest";
import { namedSuits, suitLabel } from "./suitNames";

describe("suitNames", () => {
  it("suitLabel — 4 основные в рус., новая масть символом", () => {
    expect(suitLabel("♠")).toBe("Пики");
    expect(suitLabel("♥")).toBe("Черви");
    expect(suitLabel("♦")).toBe("Бубны");
    expect(suitLabel("♣")).toBe("Трефы");
    expect(suitLabel("★")).toBe("★"); // новая масть игры — как есть
  });

  it("namedSuits — дедуп: вся рука пик → один раз «Пики»", () => {
    const tagsAny = new Set(["card", "suit:♠", "rank:10", "rank:6", "color:black"]);
    const members = [new Set(["card", "suit:♠"]), new Set(["card", "suit:♠"])];
    expect(namedSuits(tagsAny, members)).toEqual(["Пики"]);
  });

  it("namedSuits — несколько мастей, порядок первой встречи", () => {
    const tagsAny = new Set(["card", "suit:♠", "suit:♥", "suit:♦"]);
    expect(namedSuits(tagsAny, [])).toEqual(["Пики", "Черви", "Бубны"]);
  });

  it("namedSuits — джокер (card без suit) → «???» один раз в конце", () => {
    const tagsAny = new Set(["card", "suit:♠", "custom:joker"]);
    const members = [new Set(["card", "suit:♠"]), new Set(["card", "custom:joker"])];
    expect(namedSuits(tagsAny, members)).toEqual(["Пики", "???"]);
  });

  it("namedSuits — только джокеры → один «???»", () => {
    const tagsAny = new Set(["card", "custom:joker"]);
    const members = [new Set(["card", "custom:joker"]), new Set(["card", "custom:joker"])];
    expect(namedSuits(tagsAny, members)).toEqual(["???"]);
  });

  it("namedSuits — новая масть игры проходит символом", () => {
    const tagsAny = new Set(["card", "suit:★"]);
    expect(namedSuits(tagsAny, [new Set(["card", "suit:★"])])).toEqual(["★"]);
  });
});
