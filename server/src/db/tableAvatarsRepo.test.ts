import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { MIGRATIONS } from "./migrations.js";
import { avatarsOf, keepAvatar } from "./tableAvatarsRepo.js";
import { saveTableProfile, tableProfile } from "./tableProfilesRepo.js";

const fresh = () => {
  const d = new DatabaseSync(":memory:");
  for (const m of MIGRATIONS) m.up(d);
  return d;
};

describe("аватары — снимки навсегда", () => {
  it("новое фото — новый снимок, прежний остаётся; то же фото второй раз не пишется", () => {
    const d = fresh();
    expect(keepAvatar("tg:1", "data:a", 1, d)).toBe(1);
    expect(keepAvatar("tg:1", "data:a", 2, d)).toBe(1);
    expect(keepAvatar("tg:1", "data:b", 3, d)).toBe(2);
    expect(avatarsOf("tg:1", d)).toEqual([{ n: 1, photo: "data:a" }, { n: 2, photo: "data:b" }]);
    expect(avatarsOf("tg:2", d)).toEqual([]);
  });

  it("в профиле помнится, какой снимок надет", () => {
    const d = fresh();
    saveTableProfile("tg:1", { avatar: 2 }, 1, d);
    expect(tableProfile("tg:1", d)?.avatar).toBe(2);
  });
});
