import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { atDist, cleanDetail, facing, fillLayers, layerOf, normalOf, shapeCorners, shapeLayers, turnOf, upOf, visibleLayers, type Layer, type ShapeKind, type V3 } from "../table/details.js";
import { MIGRATIONS } from "./migrations.js";
import { allDetails, dropDetail, nameTaken, oneDetail, putDetail } from "./tableDetailsRepo.js";

const fresh = () => {
  const d = new DatabaseSync(":memory:");
  for (const m of MIGRATIONS) m.up(d);
  return d;
};
const near = (a: readonly number[], b: readonly number[], eps = 1e-3) => a.every((v, i) => Math.abs(v - b[i]!) < eps);
/** Углы слоя в осях детали — так, как их вырезает страница: форма в квадрате картинки шириной `width × scale`. */
const cornersOf = (l: Layer, width: number): V3[] => {
  const m = turnOf(l), r = (width * l.scale) / 2;
  return shapeCorners(l.shape)!.map(([cx, cy]) => [0, 1, 2].map((i) => [l.x, l.y, l.z][i]! + r * (m[i]![0]! * cx + m[i]![1]! * cy)) as V3);
};

describe("детали хозяина", () => {
  it("из сети — только допустимое: ссылки на картинки, числа в границах, углы в −180…180, свои имена слоёв без повторов", () => {
    const got = cleanDetail({
      name: "  Лис  ", tags: " звери, Лис ,звери", width: 99,
      layers: [
        { id: "a", sprite: "0123456789ab", x: 99, y: 1, z: -2, rx: 190, ry: -90, rz: 360, scale: 0.001, flipX: true, flipY: true, shape: "tri", show: "nearest", stand: "camera" },
        { id: "a", sprite: "../etc/passwd", ry: 400, show: "nope", stand: "nope", shape: "star" },
        "мусор",
      ],
    });
    expect(got?.name).toBe("Лис");
    expect(got?.tags).toEqual(["звери", "Лис"]);
    expect(got?.width).toBe(20);
    expect(got?.layers[0]).toEqual({ id: "a", sprite: "0123456789ab", x: 20, y: 1, z: -2, rx: -170, ry: -90, rz: 0, scale: 0.05, flipX: true, flipY: true, shape: "tri", show: "nearest", stand: "camera" });
    expect(got?.layers[1]).toMatchObject({ ry: 40, show: "always", stand: "plane", shape: "rect", flipX: false });
    expect(got?.layers[1]!.id).not.toBe("a");
    expect("sprite" in got!.layers[1]!).toBe(false);
    expect(got?.layers).toHaveLength(2);
    expect(cleanDetail({ name: " " })).toBeNull();
    expect(cleanDetail({ name: "Шар" })).toEqual({ name: "Шар", tags: [], width: 2.4, layers: [] });
  });

  it("пишется, переписывается, читается, удаляется; имя одно на деталь (регистр и «ё» не важны)", () => {
    const d = fresh();
    const one = { id: "d1", name: "Ёж", tags: ["звери"], width: 3, layers: [layerOf({ id: "a", sprite: "0123456789ab" })], at: 10 };
    putDetail(one, d);
    putDetail({ ...one, name: "Ёж · голова", at: 20 }, d);
    expect(allDetails(d)).toEqual([{ ...one, name: "Ёж · голова", at: 20 }]);
    expect(nameTaken(" еж · ГОЛОВА ", null, d)).toBe(true);
    expect(nameTaken("Ёж · голова", "d1", d)).toBe(false);
    expect(dropDetail("d1", d)).toBe(true);
    expect(oneDetail("d1", d)).toBeNull();
  });

  it("прежние детали переезжают в пространство: ракурс — поворот лицом туда же, «наружу» — место, отражение — слева направо", () => {
    const d = new DatabaseSync(":memory:");
    for (const m of MIGRATIONS.filter((x) => x.version <= 30)) m.up(d);
    d.prepare("INSERT INTO table_details (id, name, tags, width, facing, ring, views, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run("old", "Куб", "[]", 2.4, "box", null, JSON.stringify({ front: { sprite: "b:cube:head:front", dx: 1, dy: 0, scale: 2 }, right: { sprite: "b:cube:head:right" }, left: { mirror: "right" }, top: { sprite: "b:cube:head:top" } }), 1);
    for (const m of MIGRATIONS.filter((x) => x.version > 30)) m.up(d);
    const [front, right, left, top] = oneDetail("old", d)!.layers;
    // Лицо — к тебе, сдвинуто вправо на 1 и наружу на полширины.
    expect(near([front!.x, front!.y, front!.z], [1, 0, 1.2])).toBe(true);
    expect(front).toMatchObject({ scale: 2, show: "always", stand: "plane", flipX: false });
    // Правый бок детали — её правая рука: слева от того, кто смотрит на лицо (−x).
    expect(near(normalOf(right!), [-1, 0, 0])).toBe(true);
    expect(near([right!.x, right!.y, right!.z], [-1.2, 0, 0])).toBe(true);
    expect(near(normalOf(left!), [1, 0, 0])).toBe(true);
    expect(left).toMatchObject({ sprite: "b:cube:head:right", flipX: true });
    expect(near(normalOf(top!), [0, 1, 0])).toBe(true);
  });

  it("поворот по лицу и верху: лицо и верх картинки — те, что просили", () => {
    for (const [n, u] of [[[0, 0, 1], [0, 1, 0]], [[1, 1, 1], [0, 1, 0]], [[0, -1, 0], [0, 0, 1]], [[-0.3, 0.2, -0.9], [1, 0, 0]]] as [V3, V3][]) {
      const l = layerOf(facing(n, u));
      const len = Math.hypot(...n);
      expect(near(normalOf(l), n.map((v) => v / len))).toBe(true);
      expect(Math.abs(upOf(l).reduce((s, v, i) => s + v * n[i]!, 0))).toBeLessThan(1e-3);
    }
  });

  it("что видно: все «всегда» и ближайшие по лицу «по углу» — все на том угле вместе (лицо и веки поверх); места без картинки — по просьбе", () => {
    const N = (o: Partial<Layer>) => layerOf({ show: "nearest", stand: "tilt", ...o });
    const layers = [N({ id: "f", sprite: "111111111111" }), N({ id: "e", sprite: "222222222222" }), N({ id: "r", sprite: "333333333333", ry: 90 }), layerOf({ id: "p", sprite: "444444444444", ry: 90 }), N({ id: "x" })];
    expect(visibleLayers(layers, [0.17, 0, 0.98]).map((l) => l.id)).toEqual(["f", "e", "p"]);
    expect(visibleLayers(layers, [0.98, 0, 0.17]).map((l) => l.id)).toEqual(["r", "p"]);
    expect(visibleLayers(layers, [0.17, 0, 0.98], true).map((l) => l.id)).toEqual(["f", "e", "p", "x"]);
  });

  it("дайсы сходятся: у каждой грани углы — вершины многогранника, общие с соседями (d4 — по 3 грани, d8 — 4, d12 — 3, d20 — 5)", () => {
    const expected: Record<string, [faces: number, verts: number, perVert: number]> = { d4: [4, 4, 3], d8: [8, 6, 4], d12: [12, 20, 3], d20: [20, 12, 5] };
    for (const [kind, [faces, verts, perVert]] of Object.entries(expected)) {
      const { layers } = shapeLayers(kind as ShapeKind, [], 2.4);
      expect(layers).toHaveLength(faces);
      const corners: V3[] = [];
      for (const l of layers) {
        expect(l.show).toBe("always");
        // Лицо — наружу, от середины.
        expect(normalOf(l).reduce((s, v, i) => s + v * [l.x, l.y, l.z][i]!, 0)).toBeGreaterThan(0);
        for (const c of cornersOf(l, 2.4)) {
          expect(Math.hypot(...c)).toBeCloseTo(2.4 * 0.75, 2);
          corners.push(c);
        }
      }
      const groups: V3[][] = [];
      for (const c of corners) { const g = groups.find((x) => near(x[0]!, c, 2e-3)); if (g) g.push(c); else groups.push([c]); }
      expect(groups).toHaveLength(verts);
      expect(groups.every((g) => g.length === perVert)).toBe(true);
    }
  });

  it("куб и призма замкнуты: соседние грани встык", () => {
    const cube = shapeLayers("cube", [], 2).layers;
    expect(cube).toHaveLength(6);
    for (const l of cube) expect(Math.hypot(l.x, l.y, l.z)).toBeCloseTo(1, 3);
    const prism = shapeLayers("prism", [], 2, 8).layers;
    // Край грани призмы: середина + полширины грани вправо — там же, где левый край соседней.
    const edge = (l: Layer, side: 1 | -1): V3 => { const m = turnOf(l), r = l.scale; return [l.x + side * r * m[0]![0]!, l.y, l.z + side * r * m[2]![0]!]; };
    expect(near(edge(prism[0]!, -1), edge(prism[1]!, 1))).toBe(true);
  });

  it("заготовка формы: картинки прежних слоёв — на ближайшие грани, лишние уходят и сосчитаны", () => {
    const old = [layerOf({ sprite: "111111111111", flipX: true }), layerOf({ sprite: "222222222222", ry: 180 }), layerOf({ sprite: "333333333333", ry: 181 })];
    const { layers, moved, dropped } = shapeLayers("cube", old, 2.4);
    expect(layers.find((l) => l.sprite === "111111111111")).toMatchObject({ flipX: true, z: 1.2 });
    expect(near(normalOf(layers.find((l) => l.sprite === "222222222222")!), [0, 0, -1])).toBe(true);
    expect([moved, dropped]).toEqual([2, 1]);
    expect(layers.filter((l) => !l.sprite)).toHaveLength(4);
  });

  it("от середины: тянется по своему направлению, из середины — по лицу", () => {
    expect(atDist(layerOf({ x: 3, y: 4 }), 10)).toEqual({ x: 6, y: 8, z: 0 });
    expect(atDist(layerOf({ ry: 90 }), 2)).toEqual({ x: 2, y: 0, z: 0 });
  });

  it("нарисованное agy — в пустые места, что смотрят в ту же сторону; заданное не трогается; левый бок — отражение правого", () => {
    const { layers } = shapeLayers("cube", [layerOf({ sprite: "aaaaaaaaaaaa" })], 2.4);
    const got = fillLayers(layers, [["front", "111111111111"], ["back", "222222222222"], ["right", "333333333333"], ["top", "444444444444"]], 2.4);
    expect(got).toHaveLength(6);
    const by = (n: V3) => got.find((l) => near(normalOf(l), n))!;
    expect(by([0, 0, 1]).sprite).toBe("aaaaaaaaaaaa");
    expect(by([0, 0, -1]).sprite).toBe("222222222222");
    expect(by([-1, 0, 0]).sprite).toBe("333333333333");
    expect(by([1, 0, 0])).toMatchObject({ sprite: "333333333333", flipX: true });
    expect(by([0, 1, 0]).sprite).toBe("444444444444");
    const bare = fillLayers([], [["front", "111111111111"], ["right", "333333333333"]], 2.4);
    expect(bare.map((l) => [l.sprite, l.flipX])).toEqual([["111111111111", false], ["333333333333", false], ["333333333333", true]]);
  });
});
