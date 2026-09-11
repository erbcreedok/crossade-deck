// СТОРОЖ `guest-names.nothing-that-hits-a-person-for-being-born`.
//
// Кличка достаётся случайному живому человеку, который её себе не выбирал. Слово про то, кем он
// родился — национальность, раса, вера, ориентация, тело как диагноз — не шутка, а оскорбление
// наугад. Список закрыт этим тестом, а не памятью того, кто его правит.

import { describe, it, expect } from "vitest";
import { GUEST_ADJ, GUEST_NOUN, guestName } from "./guestNames.js";

/** Корни, которых в списках быть не может. Проверяются как ЧАСТЬ слова, а не как слово целиком. */
const FORBIDDEN = [
  "жид", "хохол", "хачик", "чурк", "негр", "цыган", "москал", "узкоглаз", "чернож",
  "пидор", "пидар", "педик", "гомик", "лесб", "транс",
  "даун", "дебил", "олигофрен", "калек", "инвалид", "убог", "слепой", "глухой",
  "мусульман", "христос", "еврей", "христ",
];

const ALL = [...GUEST_ADJ, ...GUEST_NOUN];

describe("guest-names.nothing-that-hits-a-person-for-being-born", () => {
  it("ни одного слова про то, кем человек родился", () => {
    const bad = ALL.filter((word) => FORBIDDEN.some((root) => word.toLowerCase().includes(root)));
    expect(bad).toEqual([]);
  });

  it("двадцать и двадцать — четыреста пар, больше чем людей за столом", () => {
    expect(GUEST_ADJ).toHaveLength(20);
    expect(GUEST_NOUN).toHaveLength(20);
    expect(new Set(ALL).size).toBe(40);
  });

  it("номер пары перебирает все четыреста, а не каждую двадцатую", () => {
    const names = new Set(Array.from({ length: 400 }, (_, i) => guestName(i)));
    expect(names.size).toBe(400);
  });

  it("кличка — два слова: прилагательное и существительное", () => {
    const [adj, noun, ...rest] = guestName().split(" ");
    expect(GUEST_ADJ).toContain(adj);
    expect(GUEST_NOUN).toContain(noun);
    expect(rest).toEqual([]);
  });
});
