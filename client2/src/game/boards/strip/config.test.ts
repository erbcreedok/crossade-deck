import { describe, it, expect } from "vitest";
import { flowAlong, STRIP_FOREIGN_SCALE, STRIP_MINI_SCALE, stripBlocked, stripConfig, stripKey, stripOf, stripScale, stripZones } from "./config";
import type { ZoneSpec } from "../core/spec";

// Сторож: дефолты ЛЕНТЫ живут в ОДНОМ месте — иначе потребители разъедутся. Дефолты —
// владельческие: значения скрыты (hidden true), но ДОСТУП открыт (access open — «в чужие руки
// должен быть включён дроп», владелец сам запирает/ставит request), живость (preview true),
// реордер вставкой, ось вдоль края дока, мини-визави below.

const strip = (over: Partial<ZoneSpec> = {}): ZoneSpec =>
  ({ id: "hand", title: "", layout: { kind: "strip" }, policy: { onOccupied: "merge" }, ...over }) as ZoneSpec;

describe("stripConfig — нормализатор ленты-данных", () => {
  it("дефолты: вставка, вдоль края (flow null — решает док), адаптив fit 5, скрыта, но открыта", () => {
    expect(stripConfig(strip())).toEqual({
      reorder: "insert",
      flow: null,
      size: { fit: 5 },
      cell: { w: 100, h: 143 },
      hidden: true,
      access: "open",
      atSeat: "below",
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
    const cfg = stripConfig(strip({ flow: "grid", fit: 7, hidden: false, access: "request", atSeat: "above", reorder: "none" }));
    expect(cfg).toMatchObject({ reorder: null, flow: "grid", size: { fit: 7 }, hidden: false, access: "request", atSeat: "above" });
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

describe("stripBlocked — доступ чужих: open (дефолт) / request / locked", () => {
  const zones = (access?: "open" | "request" | "locked") => [strip(access === undefined ? {} : { access })];

  it("дефолт open: чужой экземпляр НЕ блокируется (дроп/взятие включены); свой — никогда", () => {
    expect(stripBlocked({ zones: zones() }, "hand:p2", "p1")).toBe(false);
    expect(stripBlocked({ zones: zones() }, "hand:p1", "p1")).toBe(false);
  });

  it("locked запирает чужой экземпляр; request пока ведёт себя так же (флоу — отдельный шаг)", () => {
    expect(stripBlocked({ zones: zones("locked") }, "hand:p2", "p1")).toBe(true);
    expect(stripBlocked({ zones: zones("request") }, "hand:p2", "p1")).toBe(true);
    expect(stripBlocked({ zones: zones("locked") }, "hand:p1", "p1")).toBe(false);
  });

  it("не-ленты не блокируются", () => {
    expect(stripBlocked({ zones: zones() }, "board:0", "p1")).toBe(false);
  });
});

describe("stripScale — единый масштаб жителей лент (band и ноды обязаны совпадать)", () => {
  const zones: ZoneSpec[] = [
    { id: "hand", title: "", layout: { kind: "strip" }, policy: { onOccupied: "merge" } },
    { id: "deck", title: "", layout: { kind: "pile" }, policy: { onOccupied: "merge" } },
  ];
  it("свой экземпляр и не-ленты — 1; чужая на борде — ужата; чужая при HUD владельца — мини", () => {
    expect(stripScale({ zones }, "hand:p1", "p1")).toBe(1);
    expect(stripScale({ zones }, "deck:0", "p1")).toBe(1);
    expect(stripScale({ zones }, "hand:p2", "p1")).toBe(STRIP_FOREIGN_SCALE);
    const hud = { areas: [{ place: { region: { side: "bottom" as const, slot: "start" as const } }, widgets: [{ kind: "zone" as const, zone: "hand" }] }] };
    expect(stripScale({ zones, hud }, "hand:p2", "p1")).toBe(STRIP_MINI_SCALE);
  });
});
