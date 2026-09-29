import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { cleanDetail } from "../table/details.js";
import { MIGRATIONS } from "./migrations.js";
import { allDetails, dropDetail, oneDetail, putDetail } from "./tableDetailsRepo.js";

const fresh = () => {
  const d = new DatabaseSync(":memory:");
  for (const m of MIGRATIONS) m.up(d);
  return d;
};

describe("детали хозяина", () => {
  it("из сети — только допустимое: ссылки на картинки, отражение ракурса с картинкой, числа в границах", () => {
    expect(cleanDetail({
      name: "  Лис  ", slot: "head", facing: "nope",
      views: {
        front: { sprite: "0123456789ab", dx: 9, dy: -0.12345, scale: 0.01 },
        right: { sprite: "b:king:head:front" },
        left: { mirror: "right", scale: 2 },
        back: { mirror: "top" },
        top: { sprite: "../etc/passwd" },
        bottom: { mirror: "bottom" },
        side: { sprite: "0123456789ab" },
      },
    })).toEqual({
      name: "Лис", slot: "head", facing: "tilt",
      views: {
        front: { sprite: "0123456789ab", dx: 5, dy: -0.123, scale: 0.2 },
        right: { sprite: "b:king:head:front", dx: 0, dy: 0, scale: 1 },
        left: { mirror: "right", dx: 0, dy: 0, scale: 2 },
      },
    });
    expect(cleanDetail({ name: " ", slot: "head" })).toBeNull();
    expect(cleanDetail({ name: "Лис", slot: "other" })).toBeNull();
  });

  it("пишется, переписывается, читается, удаляется", () => {
    const d = fresh();
    const one = { id: "d1", name: "Лис", slot: "head" as const, facing: "tilt" as const, views: { front: { sprite: "0123456789ab", dx: 0, dy: 0, scale: 1 } }, at: 10 };
    putDetail(one, d);
    putDetail({ ...one, name: "Лиса", at: 20 }, d);
    expect(allDetails(d)).toEqual([{ ...one, name: "Лиса", at: 20 }]);
    expect(oneDetail("d1", d)?.views.front?.sprite).toBe("0123456789ab");
    expect(dropDetail("d1", d)).toBe(true);
    expect(oneDetail("d1", d)).toBeNull();
  });
});
