import { describe, expect, it } from "vitest";
import { FIRST_GIFT_VISIT, giftFor, ownedOf, setsOwned, STARTER, wearable } from "./rewards.js";
import { partsFor, SETS } from "./skins.js";

describe("награды: не все части открыты всем", () => {
  it("вначале у каждого только палка с кружком-аватаром — и это единственный целый набор", () => {
    const owned = ownedOf([]);
    expect(STARTER).toContain("stick:body");
    expect(STARTER).toContain("ball:head");
    expect(setsOwned(owned).map((s) => s.id)).toEqual(["stick"]);
  });

  it("на втором заходе — случайная фигура колоды: голова, тело и ноги двора; на первом и третьем — ничего", () => {
    const owned = ownedOf([]);
    expect(giftFor(1, owned)).toBeNull();
    const gift = giftFor(FIRST_GIFT_VISIT, owned, () => 0)!;
    const set = SETS.find((s) => s.id === gift.set)!;
    expect(gift.parts).toEqual([set.parts.head, set.parts.body, "legs-card:legs"]);
    expect(giftFor(3, owned)).toBeNull();
  });

  it("случай выбирает разные фигуры, и получивший фигуру второй раз не получает", () => {
    const a = giftFor(FIRST_GIFT_VISIT, ownedOf([]), () => 0)!, b = giftFor(FIRST_GIFT_VISIT, ownedOf([]), () => 0.99)!;
    expect(a.set).not.toBe(b.set);
    expect(giftFor(FIRST_GIFT_VISIT, ownedOf(a.parts))).toBeNull();
  });

  it("сидеть можно только тем, что есть: чужая часть заменяется стартовой того же слота", () => {
    const owned = ownedOf(["spade-K:head"]);
    const worn = wearable(partsFor("spade-K"), owned);
    expect(worn.head).toBe("spade-K:head");
    expect(worn.body).toBe("stick:body");
    expect(worn.legs).toBe("stick:legs");
  });
});
