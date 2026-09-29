import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { cleanDetail, fillViews, outOf } from "../table/details.js";
import { MIGRATIONS } from "./migrations.js";
import { allDetails, dropDetail, nameTaken, oneDetail, putDetail } from "./tableDetailsRepo.js";

const fresh = () => {
  const d = new DatabaseSync(":memory:");
  for (const m of MIGRATIONS) m.up(d);
  return d;
};

describe("детали хозяина", () => {
  it("из сети — только допустимое: ссылки на картинки, отражение ракурса с картинкой, числа в границах", () => {
    expect(cleanDetail({
      name: "  Лис  ", tags: " звери, Лис ,звери", width: 99, facing: "nope",
      views: {
        front: { sprite: "0123456789ab", dx: 9, dy: -0.12345, scale: 0.01, out: 99 },
        right: { sprite: "b:king:head:front" },
        left: { mirror: "right", scale: 2 },
        back: { mirror: "top" },
        top: { sprite: "../etc/passwd" },
        bottom: { mirror: "bottom" },
        side: { sprite: "0123456789ab" },
      },
    })).toEqual({
      name: "Лис", tags: ["звери", "Лис"], width: 20, facing: "tilt",
      views: {
        front: { sprite: "0123456789ab", dx: 5, dy: -0.123, scale: 0.2, out: 10 },
        right: { sprite: "b:king:head:front", dx: 0, dy: 0, scale: 1 },
        left: { mirror: "right", dx: 0, dy: 0, scale: 2 },
      },
    });
    expect(cleanDetail({ name: " " })).toBeNull();
    expect(cleanDetail({ name: "Шар" })).toEqual({ name: "Шар", tags: [], width: 2.4, facing: "tilt", views: {} });
  });

  it("пишется, переписывается, читается, удаляется", () => {
    const d = fresh();
    const one = { id: "d1", name: "Лис", tags: ["звери"], width: 3, facing: "tilt" as const, views: { front: { sprite: "0123456789ab", dx: 0, dy: 0, scale: 1 } }, at: 10 };
    putDetail(one, d);
    putDetail({ ...one, name: "Лиса", at: 20 }, d);
    expect(allDetails(d)).toEqual([{ ...one, name: "Лиса", at: 20 }]);
    expect(oneDetail("d1", d)?.views.front?.sprite).toBe("0123456789ab");
    expect(dropDetail("d1", d)).toBe(true);
    expect(oneDetail("d1", d)).toBeNull();
  });

  it("нарисованное agy встаёт только в пустые ракурсы; левый бок — отражение бока", () => {
    const mine = { front: { sprite: "aaaaaaaaaaaa", dx: 1, dy: 0, scale: 2 } };
    expect(fillViews(mine, [["front", "111111111111"], ["back", "222222222222"], ["right", "333333333333"], ["a40", "444444444444"]])).toEqual({
      front: { sprite: "aaaaaaaaaaaa", dx: 1, dy: 0, scale: 2 },
      back: { sprite: "222222222222", dx: 0, dy: 0, scale: 1 },
      right: { sprite: "333333333333", dx: 0, dy: 0, scale: 1 },
      left: { mirror: "right", dx: 0, dy: 0, scale: 1 },
    });
  });

  it("имя детали одно на деталь: занято — без разницы в регистре и «ё»; своё имя себе не мешает", () => {
    const d = fresh();
    putDetail({ id: "d1", name: "Ёж · голова", tags: [], width: 2.4, facing: "tilt", views: {}, at: 1 }, d);
    expect(nameTaken(" еж · ГОЛОВА ", null, d)).toBe(true);
    expect(nameTaken("Ёж · голова", "d1", d)).toBe(false);
    expect(nameTaken("Ёж · тело", null, d)).toBe(false);
  });

  it("сторона отстоит от середины: своё «наружу» — или коробка на полширины, лист — 0", () => {
    expect(outOf({ facing: "box", width: 2.4 }, {})).toBe(1.2);
    expect(outOf({ facing: "tilt", width: 2.4 }, {})).toBe(0);
    expect(outOf({ facing: "box", width: 2.4 }, { out: 0.5 })).toBe(0.5);
  });
});
