import { describe, it, expect } from "vitest";
import { SceneHud } from "./hud";
import type { BoardSpec, ZoneSpec } from "../core/spec";
import { region, zoneW } from "../core/hudSpec";

// Первый сторож SceneHud (раньше жил без тестов): раздача рамок областей докам, снос дока
// ушедшей зоны, резерв краёв и ГЛАВНОЕ — перпендикулярные области НЕ пересекаются в углу
// (углом владеет горизонталь по дефолту: вертикальный док заканчивается выше нижней ленты).

const strip = (id: string): ZoneSpec => ({ id, title: "", layout: { kind: "strip" }, policy: { onOccupied: "merge" } });

function makeSpec(hud: BoardSpec["hud"]): BoardSpec {
  return {
    id: "t",
    title: "",
    elements: [],
    zones: [strip("hand"), strip("pouch")],
    seats: { count: { fixed: 1 }, show: "none", swap: false },
    hud,
    actions: [],
  };
}

function makeHud(spec: () => BoardSpec) {
  const members: Record<string, string[]> = { "hand:p1": ["a", "b", "c"], "pouch:p1": ["x", "y"] };
  return new SceneHud({
    spec,
    accent: () => 0xffcc00,
    wake: () => {},
    selfSeat: "p1",
    safeArea: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    chrome: () => ({ top: 0, bottom: 0 }),
    members: (slot) => members[slot] ?? [],
    retarget: () => {},
  });
}

describe("SceneHud — области и доки", () => {
  it("каждой зоне-виджету — свой док; позы жителей на экране; зона ушла из HUD — док снесён", () => {
    let spec = makeSpec({ areas: [region("bottom", "start", [zoneW("hand", "auto")]), region("right", "start", [zoneW("pouch")])] });
    const hud = makeHud(() => spec);
    hud.layout(800, 600);
    expect(hud.list().map((d) => d.zoneId).sort()).toEqual(["hand", "pouch"]);
    expect(hud.screenPoses().filter((p) => p.zone === "hand").length).toBe(3);
    expect(hud.screenPoses().filter((p) => p.zone === "pouch").length).toBe(2);

    spec = makeSpec({ areas: [region("bottom", "start", [zoneW("hand", "auto")])] });
    hud.layout(800, 600);
    expect(hud.list().map((d) => d.zoneId)).toEqual(["hand"]);
    hud.destroy();
  });

  it("угол без наплыва: вертикальный док заканчивается ВЫШЕ нижней ленты (углом владеет низ)", () => {
    const spec = makeSpec({ areas: [region("bottom", "start", [zoneW("hand", "auto")]), region("right", "start", [zoneW("pouch")])] });
    const hud = makeHud(() => spec);
    hud.layout(800, 600);
    const r = hud.reserved(800, 600);
    const pouchLow = Math.max(...hud.screenPoses().filter((p) => p.zone === "pouch").map((p) => p.y));
    const handHigh = Math.min(...hud.screenPoses().filter((p) => p.zone === "hand").map((p) => p.y));
    expect(pouchLow).toBeLessThan(600 - r.bottom); // мешок не заезжает в резерв низа
    expect(pouchLow).toBeLessThan(handHigh); // и глазами: его жители выше жителей руки
    hud.destroy();
  });

  it("резерв краёв: занятые края > 0, пустые держат safe (тут 0)", () => {
    const spec = makeSpec({ areas: [region("bottom", "start", [zoneW("hand", "auto")])] });
    const hud = makeHud(() => spec);
    const r = hud.reserved(800, 600);
    expect(r.bottom).toBeGreaterThan(0);
    expect(r.top).toBe(0);
    expect(r.left).toBe(0);
    hud.destroy();
  });
});
