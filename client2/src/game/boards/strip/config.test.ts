import { describe, it, expect } from "vitest";
import { flowAlong, stripConfig, stripKey, stripLocks, stripOf, stripZones } from "./config";
import type { ZoneSpec } from "../core/spec";

// Сторож: дефолты ЛЕНТЫ живут в ОДНОМ месте — иначе потребители разъедутся. Дефолты —
// владельческие: приватность (hidden/locked true), живость (preview true), реордер вставкой,
// ось вдоль края дока. «Рука» — не спецпонятие: обычная strip-зона с id «hand».

const strip = (over: Partial<ZoneSpec> = {}): ZoneSpec =>
  ({ id: "hand", title: "", layout: { kind: "strip" }, policy: { onOccupied: "merge" }, ...over }) as ZoneSpec;

describe("stripConfig — нормализатор ленты-данных", () => {
  it("дефолты: вставка, вдоль края (flow null — решает док), адаптив fit 5, приватная, живая", () => {
    expect(stripConfig(strip())).toEqual({
      reorder: "insert",
      flow: null,
      size: { fit: 5 },
      cell: { w: 100, h: 143 },
      hidden: true,
      locked: true,
      preview: true,
    });
  });

  it("ось вдоль края (для дока): left/right → vertical, top/bottom → horizontal", () => {
    expect(flowAlong("left")).toBe("vertical");
    expect(flowAlong("right")).toBe("vertical");
    expect(flowAlong("top")).toBe("horizontal");
    expect(flowAlong("bottom")).toBe("horizontal");
  });

  it("явные значения пробрасываются; cell побеждает fit; reorder:none гасит реордер", () => {
    const cfg = stripConfig(strip({ flow: "grid", fit: 7, hidden: false, locked: false, reorder: "none" }));
    expect(cfg).toMatchObject({ reorder: null, flow: "grid", size: { fit: 7 }, hidden: false, locked: false });
    expect(stripConfig(strip({ cell: { w: 44, h: 44 } })).size).toEqual({ cell: { w: 44, h: 44 } });
  });
});

describe("stripOf/stripZones/stripKey — адресация лент", () => {
  const zones = [strip(), strip({ id: "pouch" }), { id: "deck", title: "", layout: { kind: "pile" }, policy: { onOccupied: "merge" } } as ZoneSpec];

  it("контейнер ленты у места — `зона:место`; спека находится по ключу", () => {
    expect(stripKey("pouch", "p2")).toBe("pouch:p2");
    expect(stripOf({ zones }, "pouch:p2")?.id).toBe("pouch");
    expect(stripOf({ zones }, "deck:0")).toBeNull();
  });

  it("stripZones отдаёт ленты в порядке объявления", () => {
    expect(stripZones({ zones }).map((z) => z.id)).toEqual(["hand", "pouch"]);
  });
});

describe("stripLocks — чужая лента заперта по умолчанию", () => {
  const zones = (locked?: boolean) => [strip(locked === undefined ? {} : { locked })];

  it("чужой экземпляр при locked — заперт; свой — никогда", () => {
    expect(stripLocks({ zones: zones() }, "hand:p2", "p1")).toBe(true);
    expect(stripLocks({ zones: zones() }, "hand:p1", "p1")).toBe(false);
  });

  it("отпертая лента (locked:false) — общая: чужой экземпляр не заперт", () => {
    expect(stripLocks({ zones: zones(false) }, "hand:p2", "p1")).toBe(false);
  });

  it("не-ленты не запираются", () => {
    expect(stripLocks({ zones: zones() }, "board:0", "p1")).toBe(false);
  });
});
