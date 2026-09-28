import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "./migrations.js";
import { carryTableProfile, saveTableProfile, tableProfile } from "./tableProfilesRepo.js";

const fresh = () => {
  const d = new DatabaseSync(":memory:");
  for (const m of MIGRATIONS) m.up(d);
  return d;
};

describe("tableProfiles.keeps-what-was-chosen", () => {
  it("нет профиля — null; записал часть — остальное пусто; дописал — прежнее не стёрлось", () => {
    const d = fresh();
    expect(tableProfile("tg:1", d)).toBeNull();
    saveTableProfile("tg:1", { doll: "queen" }, 1, d);
    expect(tableProfile("tg:1", d)).toEqual({ doll: "queen", palette: null, color: null });
    saveTableProfile("tg:1", { palette: 7, color: "#e0483f" }, 2, d);
    expect(tableProfile("tg:1", d)).toEqual({ doll: "queen", palette: 7, color: "#e0483f" });
  });

  it("привязал Telegram — профиль гостя переезжает, если у Telegram своего нет", () => {
    const d = fresh();
    saveTableProfile("dev:a", { doll: "king", palette: 3 }, 1, d);
    expect(carryTableProfile("dev:a", "tg:9", 2, d)).toBe(true);
    expect(tableProfile("tg:9", d)).toEqual({ doll: "king", palette: 3, color: null });
    saveTableProfile("dev:b", { doll: "queen" }, 3, d);
    expect(carryTableProfile("dev:b", "tg:9", 4, d), "у Telegram уже свой — не перетирается").toBe(false);
    expect(tableProfile("tg:9", d)?.doll).toBe("king");
  });
});
