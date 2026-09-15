import { describe, expect, it } from "vitest";
import { bareTitle, crusadeName, numberOf, titleFrom, uniqueTitle } from "./names.js";

describe("имена столов", () => {
  it("имя по чату", () => {
    expect(titleFrom("Чат пиццы")).toBe("Стол «Чат пиццы»");
  });

  it("без чата — случайное имя похода", () => {
    const title = titleFrom(undefined, () => 0);
    expect(title).toBe("Стол «Утренний поход»");
    expect(crusadeName(() => 0.999)).toBe("Вечерний бивак");
  });

  it("первому номер не ставится, второму — [2]", () => {
    expect(uniqueTitle("Стол «Чат»", [])).toBe("Стол «Чат»");
    expect(uniqueTitle("Стол «Чат»", ["Стол «Чат»"])).toBe("[2] Стол «Чат»");
    expect(uniqueTitle("Стол «Чат»", ["Стол «Чат»", "[2] Стол «Чат»"])).toBe("[3] Стол «Чат»");
  });

  it("номер — наименьший свободный: закрыли [2], он снова свободен", () => {
    expect(uniqueTitle("Стол «Чат»", ["Стол «Чат»", "[3] Стол «Чат»"])).toBe("[2] Стол «Чат»");
  });

  it("чужие имена не мешают, свой префикс назначается заново", () => {
    expect(uniqueTitle("Стол «Чат»", ["Стол «Другой»"])).toBe("Стол «Чат»");
    expect(uniqueTitle("[7] Стол «Чат»", ["Стол «Чат»"])).toBe("[2] Стол «Чат»");
  });

  it("разбор префикса", () => {
    expect(numberOf("[2] Стол «Чат»")).toBe(2);
    expect(numberOf("Стол «Чат»")).toBe(1);
    expect(bareTitle("[12] Стол «Чат»")).toBe("Стол «Чат»");
  });
});
