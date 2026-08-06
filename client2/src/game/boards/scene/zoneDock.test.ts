import { describe, it, expect } from "vitest";
import { SceneZoneDock } from "./zoneDock";

// Сторож ГЭП-ПРЕВЬЮ вставки (владельческое правило + урок playHover): пока груз навис над доком,
// ряд раздвигается, показывая индекс вставки, но ЦЕЛЬ (insertIndexAt) считается по базовому ряду —
// подсказка не смеет двигать цель под неподвижным пальцем, иначе индекс осциллирует.

function hud(members: string[]): { h: SceneZoneDock; retargets: () => number } {
  let n = 0;
  const h = new SceneZoneDock("hand", "hand:p1", {
    config: () => ({ reorder: "insert" as const, flow: "horizontal" as const, size: { fit: 5 }, cell: { w: 100, h: 143 }, hidden: false, access: "open" as const, atSeat: "below" as const, preview: true }),
    members: () => members,
    accent: () => 0xffcc00,
    wake: () => {},
    retarget: () => n++,
  });
  h.setDock("bottom", { from: 0, len: 800 });
  h.layout(800, 600);
  return { h, retargets: () => n };
}

describe("SceneZoneDock — гэп-превью не двигает цель", () => {
  it("hoverAt раздвигает ряд (позы уезжают), а insertIndexAt по той же точке НЕ меняется", () => {
    const { h } = hud(["a", "b", "c"]);
    const sx = h.poseOf("b")!.x + 1; // чуть правее центра b → вставка после b
    const sy = h.poseOf("b")!.y;
    const before = h.insertIndexAt(sx, sy);
    const posesBefore = ["a", "b", "c"].map((id) => h.poseOf(id)!.x);
    h.hoverAt(sx, sy);
    const posesAfter = ["a", "b", "c"].map((id) => h.poseOf(id)!.x);
    expect(posesAfter).not.toEqual(posesBefore); // превью видно: ряд раздвинулся
    expect(h.insertIndexAt(sx, sy)).toBe(before); // цель стоит: индекс по базовому ряду
  });

  it("под гэпом ряд занимает позиции count+1: карты левее индекса уехали влево, правее — вправо", () => {
    const { h } = hud(["a", "b", "c", "d"]);
    const base = ["a", "b", "c", "d"].map((id) => h.poseOf(id)!.x);
    h.hoverAt((base[1]! + base[2]!) / 2, h.poseOf("b")!.y); // между b и c
    expect(h.poseOf("b")!.x).toBeLessThan(base[1]!);
    expect(h.poseOf("c")!.x).toBeGreaterThan(base[2]!);
  });

  it("груз ушёл с руки (armed) — гэп смыкается, позы вернулись; retarget звался на открытие и закрытие", () => {
    const { h, retargets } = hud(["a", "b", "c"]);
    const base = ["a", "b", "c"].map((id) => h.poseOf(id)!.x);
    h.hoverAt(h.poseOf("a")!.x - 1, h.poseOf("a")!.y);
    expect(retargets()).toBe(1);
    h.setBand("armed");
    expect(["a", "b", "c"].map((id) => h.poseOf(id)!.x)).toEqual(base);
    expect(retargets()).toBe(2);
  });

  it("hoverAt в той же точке повторно — retarget НЕ дёргается (перецел только на смене индекса)", () => {
    const { h, retargets } = hud(["a", "b", "c"]);
    const sx = h.poseOf("a")!.x - 1;
    const sy = h.poseOf("a")!.y;
    h.hoverAt(sx, sy);
    h.hoverAt(sx, sy);
    expect(retargets()).toBe(1);
  });

  it("clearDragging смыкает гэп вместе со снятием драга", () => {
    const { h } = hud(["a", "b", "c"]);
    const base = ["a", "b", "c"].map((id) => h.poseOf(id)!.x);
    h.hoverAt(h.poseOf("c")!.x + 1, h.poseOf("c")!.y);
    h.clearDragging();
    expect(["a", "b", "c"].map((id) => h.poseOf(id)!.x)).toEqual(base);
  });
});
