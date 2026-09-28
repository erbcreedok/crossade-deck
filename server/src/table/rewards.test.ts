import { describe, expect, it } from "vitest";
import { AVATAR, giftsDue, giftText, ownedOf, putOn, setsOwned, STARTER, wearable } from "./rewards.js";
import { partsFor, SETS } from "./skins.js";

describe("награды: не все части открыты всем", () => {
  it("вначале у каждого только шар и палка — и это единственный целый набор; аватара нет", () => {
    const owned = ownedOf([]);
    expect(STARTER).toContain("stick:body");
    expect(STARTER).toContain("ball:head");
    expect(owned.has(AVATAR)).toBe(false);
    expect(setsOwned(owned).map((s) => s.id)).toEqual(["stick"]);
  });

  it("гость приложения без Telegram не получает ничего — ни в профиле, ни в комнате", () => {
    expect(giftsDue("dev:abc", ownedOf([]), false)).toEqual([]);
    expect(giftsDue("dev:abc", ownedOf([]), true)).toEqual([]);
  });

  it("вошёл через Telegram — аватар; в профиле фигура колоды не приходит, в первой комнате — приходит целиком", () => {
    expect(giftsDue("tg:1", ownedOf([]), false).map((g) => g.why)).toEqual(["telegram"]);
    const [avatar, figure] = giftsDue("tg:1", ownedOf([]), true, () => 0);
    expect(avatar!.parts).toEqual([AVATAR]);
    const set = SETS.find((s) => s.id === figure!.set)!;
    expect(figure!.parts).toEqual([set.parts.head, set.parts.body, "legs-card:legs"]);
  });

  it("каждая награда — один раз; случай выбирает разные фигуры", () => {
    const a = giftsDue("tg:1", ownedOf([AVATAR]), true, () => 0)[0]!, b = giftsDue("tg:1", ownedOf([AVATAR]), true, () => 0.99)[0]!;
    expect(a.set).not.toBe(b.set);
    expect(giftsDue("tg:1", ownedOf([AVATAR, ...a.parts]), true)).toEqual([]);
  });

  it("надевается, только если сидит стартовым: палка → фигура целиком, шар → аватар; своё не трогается", () => {
    const [avatar, figure] = giftsDue("tg:1", ownedOf([]), true, () => 0);
    expect(putOn(partsFor("stick"), [avatar!, figure!])).toEqual({ doll: figure!.set, parts: null });
    expect(putOn(partsFor("stick"), [avatar!])).toEqual({ parts: { head: AVATAR } });
    expect(putOn(partsFor("cube"), [avatar!])).toBeNull();
  });

  it("письмо в личку называет, что пришло", () => {
    const [avatar, figure] = giftsDue("tg:1", ownedOf([]), true, () => 0);
    expect(giftText(avatar!)).toMatch(/аватар/);
    expect(giftText(figure!)).toContain(figure!.name);
  });

  it("сидеть можно только тем, что есть: чужая часть заменяется стартовой того же слота", () => {
    const owned = ownedOf(["spade-K:head"]);
    const worn = wearable(partsFor("spade-K"), owned);
    expect(worn.head).toBe("spade-K:head");
    expect(worn.body).toBe("stick:body");
    expect(worn.legs).toBe("stick:legs");
  });
});
