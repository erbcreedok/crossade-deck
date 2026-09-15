import { describe, expect, it } from "vitest";
import { cleanWatch, Eyes, eyesAt, type Eye } from "./eyes.js";

describe("глаза зрителей", () => {
  it("из сети — только места известного вида, без повторов", () => {
    expect(cleanWatch({ spots: ["pile:deck", "chair:tg:1", "мусор", 7, "pile:deck"] })).toEqual(["pile:deck", "chair:tg:1"]);
    expect(cleanWatch({})).toBeNull();
  });

  it("очередь по времени открытия, повторная отправка её не тасует", () => {
    const eyes = new Eyes();
    expect(eyes.look("b", ["pile:deck"], 10)).toBe(true);
    expect(eyes.look("a", ["pile:deck"], 20)).toBe(true);
    expect(eyes.all().map((e) => e.by)).toEqual(["b", "a"]);
    expect(eyes.look("b", ["pile:deck"], 30)).toBe(false);
    expect(eyes.all().map((e) => e.by)).toEqual(["b", "a"]);
  });

  it("закрыл окно — глаз гаснет; ушёл — гаснут все", () => {
    const eyes = new Eyes();
    eyes.look("a", ["pile:deck", "chair:x"], 1);
    expect(eyes.look("a", ["chair:x"], 2)).toBe(true);
    expect(eyes.all()).toHaveLength(1);
    expect(eyes.forget("a")).toBe(true);
    expect(eyes.all()).toEqual([]);
  });

  it("на месте: свой глаз не показывается, лишние — знаком «+»", () => {
    const all: Eye[] = ["a", "b", "c", "d", "me"].map((by, i) => ({ by, spot: "pile:deck", since: i }));
    const three = eyesAt(all, "pile:deck", "me", 3);
    expect(three.eyes.map((e) => e.by)).toEqual(["a", "b", "c"]);
    expect(three.more).toBe(true);
    const six = eyesAt(all, "pile:deck", "me", 6);
    expect(six.eyes.map((e) => e.by)).toEqual(["a", "b", "c", "d"]);
    expect(six.more).toBe(false);
  });
});
