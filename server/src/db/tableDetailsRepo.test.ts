import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { cleanDetail, dirOf, fillLayers, layersFromViews, outOf, placeAngles, presetOf, ringAngles, sideAngles, visibleLayers, type Layer } from "../table/details.js";
import { MIGRATIONS } from "./migrations.js";
import { allDetails, dropDetail, nameTaken, oneDetail, putDetail } from "./tableDetailsRepo.js";

const fresh = () => {
  const d = new DatabaseSync(":memory:");
  for (const m of MIGRATIONS) m.up(d);
  return d;
};
const L = (o: Partial<Layer> & Pick<Layer, "id">): Layer => ({ flip: false, yaw: 0, pitch: 0, dx: 0, dy: 0, scale: 1, show: "nearest", stand: "tilt", ...o });

describe("детали хозяина", () => {
  it("из сети — только допустимое: ссылки на картинки, числа в границах, поворот в 0…360, свои имена слоёв без повторов", () => {
    const got = cleanDetail({
      name: "  Лис  ", tags: " звери, Лис ,звери", width: 99,
      layers: [
        { id: "a", sprite: "0123456789ab", yaw: -90, pitch: 120, dx: 9, scale: 0.01, out: 99, show: "always", stand: "plane", flip: true },
        { id: "a", sprite: "../etc/passwd", yaw: 400, show: "nope", stand: "nope" },
        "мусор",
      ],
    });
    expect(got?.name).toBe("Лис");
    expect(got?.tags).toEqual(["звери", "Лис"]);
    expect(got?.width).toBe(20);
    expect(got?.layers[0]).toEqual({ id: "a", sprite: "0123456789ab", flip: true, yaw: 270, pitch: 90, dx: 5, dy: 0, scale: 0.2, out: 10, show: "always", stand: "plane" });
    expect(got?.layers[1]).toMatchObject({ yaw: 40, show: "nearest", stand: "tilt", flip: false });
    expect(got?.layers[1]!.id).not.toBe("a");
    expect("sprite" in got!.layers[1]!).toBe(false);
    expect(got?.layers).toHaveLength(2);
    expect(cleanDetail({ name: " " })).toBeNull();
    expect(cleanDetail({ name: "Шар" })).toEqual({ name: "Шар", tags: [], width: 2.4, layers: [] });
  });

  it("пишется, переписывается, читается, удаляется; имя одно на деталь (регистр и «ё» не важны)", () => {
    const d = fresh();
    const one = { id: "d1", name: "Ёж", tags: ["звери"], width: 3, layers: [L({ id: "a", sprite: "0123456789ab" })], at: 10 };
    putDetail(one, d);
    putDetail({ ...one, name: "Ёж · голова", at: 20 }, d);
    expect(allDetails(d)).toEqual([{ ...one, name: "Ёж · голова", at: 20 }]);
    expect(nameTaken(" еж · ГОЛОВА ", null, d)).toBe(true);
    expect(nameTaken("Ёж · голова", "d1", d)).toBe(false);
    expect(dropDetail("d1", d)).toBe(true);
    expect(oneDetail("d1", d)).toBeNull();
  });

  it("детали до слоёв переезжают в слои: ракурс — слой на своём угле, отражение — та же картинка наоборот", () => {
    const d = new DatabaseSync(":memory:");
    for (const m of MIGRATIONS.filter((x) => x.version <= 30)) m.up(d);
    d.prepare("INSERT INTO table_details (id, name, tags, width, facing, ring, views, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("old", "Куб", "[]", 2.4, "box", null, JSON.stringify({ front: { sprite: "b:cube:head:front", dx: 1, dy: 0, scale: 2 }, right: { sprite: "b:cube:head:right", dx: 0, dy: 0, scale: 1 }, left: { mirror: "right", dx: 0, dy: 0, scale: 1 } }), 1);
    for (const m of MIGRATIONS.filter((x) => x.version > 30)) m.up(d);
    const got = oneDetail("old", d)!;
    expect(got.layers.map((l) => [l.sprite, l.yaw, l.flip, l.show, l.stand])).toEqual([["b:cube:head:front", 0, false, "always", "plane"], ["b:cube:head:right", 90, false, "always", "plane"], ["b:cube:head:right", 270, true, "always", "plane"]]);
    expect(got.layers[0]).toMatchObject({ dx: 1, scale: 2 });
  });

  it("заготовки показа: коробка — всегда, в своей плоскости; смесь — не заготовка; наружу по умолчанию — у коробки полширины", () => {
    const box = layersFromViews({ front: { sprite: "b:cube:head:front" } }, "box");
    expect(presetOf(box)).toBe("box");
    expect(presetOf([...box, L({ id: "z", sprite: "0123456789ab" })])).toBeNull();
    expect(outOf(2.4, box[0]!)).toBe(1.2);
    expect(outOf(2.4, L({ id: "t" }))).toBe(0);
    expect(outOf(2.4, { ...box[0]!, out: 0.5 })).toBe(0.5);
  });

  it("что видно: все «всегда» и ближайшие по углу «по углу» — все на том угле вместе (лицо и веки поверх)", () => {
    const layers = [L({ id: "f", sprite: "111111111111" }), L({ id: "e", sprite: "222222222222" }), L({ id: "r", sprite: "333333333333", yaw: 90 }), L({ id: "p", sprite: "444444444444", yaw: 90, show: "always" }), L({ id: "x", yaw: 0 })];
    expect(visibleLayers(layers, dirOf(10, 0)).map((l) => l.id)).toEqual(["f", "e", "p"]);
    expect(visibleLayers(layers, dirOf(80, 0)).map((l) => l.id)).toEqual(["r", "p"]);
  });

  it("заготовки углов: угол берёт самый близкий слой, лишние слои остаются, пустые углы — новые пустые слои", () => {
    const ring = Array.from({ length: 18 }, (_, k) => L({ id: `b${k}`, sprite: "111111111111", yaw: k * 20 }));
    const six = placeAngles(ring, sideAngles());
    expect(six).toHaveLength(18 + 2);
    expect(six.find((l) => l.id === "b0")?.yaw).toBe(0);
    expect(six.find((l) => l.id === "b9")?.yaw).toBe(180);
    expect(six.filter((l) => !l.sprite).map((l) => l.pitch).sort()).toEqual([-90, 90]);
    const back = placeAngles([L({ id: "f", sprite: "111111111111" }), L({ id: "r", sprite: "111111111111", yaw: 90 })], ringAngles(8));
    expect(back.find((l) => l.id === "r")?.yaw).toBe(90);
    expect(back).toHaveLength(8);
  });

  it("нарисованное agy — в пустые места на своём угле, заданное не трогается, левый бок — отражение бока", () => {
    const got = fillLayers([L({ id: "f", sprite: "aaaaaaaaaaaa", dx: 1 }), L({ id: "e", yaw: 180 })], [["front", "111111111111"], ["back", "222222222222"], ["right", "333333333333"], ["top", "444444444444"]]);
    expect(got.find((l) => l.id === "f")).toMatchObject({ sprite: "aaaaaaaaaaaa", dx: 1 });
    expect(got.find((l) => l.id === "e")?.sprite).toBe("222222222222");
    expect(got.filter((l) => l.yaw === 90).map((l) => l.sprite)).toEqual(["333333333333"]);
    expect(got.find((l) => l.pitch === 90)?.sprite).toBe("444444444444");
    expect(got.find((l) => l.yaw === 270)).toMatchObject({ sprite: "333333333333", flip: true });
  });
});
