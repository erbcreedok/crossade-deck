import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { cleanDetail, fillViews, moveViews, nearestView, outOf, ringViews, viewDir } from "../table/details.js";
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
    putDetail({ id: "d2", name: "Бочка", tags: [], width: 5.2, facing: "camera", ring: 18, views: {}, at: 5 }, d);
    expect(oneDetail("d2", d)?.ring).toBe(18);
    expect("ring" in oneDetail("d1", d)!).toBe(false);
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

  it("по кругу: N ракурсов через равный угол, лишние ключи отбрасываются; ближайший ракурс — по направлению", () => {
    expect(ringViews(4)).toEqual(["a0", "a90", "a180", "a270"]);
    expect(cleanDetail({ name: "Бочка", ring: 4, views: { a90: { sprite: "b:barrel:body:a80" }, front: { sprite: "0123456789ab" }, a45: { sprite: "0123456789ab" } } })?.views).toEqual({ a90: { sprite: "b:barrel:body:a80", dx: 0, dy: 0, scale: 1 } });
    expect(cleanDetail({ name: "Бочка", ring: 99 })?.ring).toBeUndefined();
    expect(nearestView(ringViews(18), viewDir("right"))).toBe("a80");
    expect(nearestView(["front", "top"], viewDir("a0"))).toBe("front");
  });

  it("сменить набор — картинки на ближайшие углы, верх и низ у круга отпадают, обратно — на стороны", () => {
    const six = { front: { sprite: "111111111111", dx: 1, dy: 0, scale: 2 }, right: { sprite: "222222222222", dx: 0, dy: 0, scale: 1 }, top: { sprite: "333333333333", dx: 0, dy: 0, scale: 1 }, left: { mirror: "right", dx: 0, dy: 0, scale: 1 } };
    const round = moveViews(six, { ring: 8 });
    expect(round).toEqual({ a0: { sprite: "111111111111", dx: 1, dy: 0, scale: 2 }, a90: { sprite: "222222222222", dx: 0, dy: 0, scale: 1 } });
    expect(moveViews(round, {})).toEqual({ front: { sprite: "111111111111", dx: 1, dy: 0, scale: 2 }, right: { sprite: "222222222222", dx: 0, dy: 0, scale: 1 } });
    const barrel = Object.fromEntries(ringViews(18).map((v) => [v, { sprite: `b:barrel:body:${v}`, dx: 0, dy: 0, scale: 1 }]));
    // бок — ровно между двумя ракурсами (80° и 100°, 260° и 280°): годится любой из двух, но не дальний
    const sides = moveViews(barrel, {});
    expect([sides.front?.sprite, sides.back?.sprite]).toEqual(["b:barrel:body:a0", "b:barrel:body:a180"]);
    expect(sides.right?.sprite).toMatch(/:a(80|100)$/);
    expect(sides.left?.sprite).toMatch(/:a(260|280)$/);
    expect(fillViews({}, [["front", "444444444444"], ["top", "555555555555"], ["right", "666666666666"]], 18)).toEqual({ a0: { sprite: "444444444444", dx: 0, dy: 0, scale: 1 }, a80: { sprite: "666666666666", dx: 0, dy: 0, scale: 1 } });
  });
});
