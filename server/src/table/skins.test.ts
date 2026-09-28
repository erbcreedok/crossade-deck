import { describe, expect, it } from "vitest";
import { drawnView, pickView, skinOf, SKINS, VIEW_DIRS } from "./skins.js";

const skin = (id: string) => skinOf(id)!;

describe("ракурсы скинов — как спрайты в Doom", () => {
  it("у палки ракурс один — её видно одинаково отовсюду", () => {
    for (const d of Object.values(VIEW_DIRS)) expect(pickView(skin("stick"), d)).toBe("front");
  });

  it("король — лицом, если смотрят спереди, и спиной, если сзади; сбоку — что ближе", () => {
    expect(pickView(skin("king"), [0, 1, 0.3])).toBe("front");
    expect(pickView(skin("king"), [0, -1, 0.3])).toBe("back");
    expect(pickView(skin("king"), [1, 0.2, 0])).toBe("front");
    expect(pickView(skin("king"), [1, -0.2, 0])).toBe("back");
  });

  it("пёс сбоку — в профиль; левый бок — отражённый правый", () => {
    expect(pickView(skin("dog"), [1, 0.1, 0.2])).toBe("right");
    expect(pickView(skin("dog"), [-1, 0.1, 0.2])).toBe("left");
    expect(drawnView(skin("dog"), "left")).toEqual({ view: "right", mirror: true });
    expect(drawnView(skin("dog"), "front")).toEqual({ view: "front", mirror: false });
  });

  it("кубик сверху — верхней гранью", () => {
    expect(pickView(skin("cube"), [0.1, 0.2, 1])).toBe("top");
    expect(pickView(skin("cube"), [0, 0, -1])).toBe("bottom");
  });

  it("крестоносец — все шесть сторон: сверху — макушка, снизу — подбородок, слева — отражённый правый", () => {
    expect(pickView(skin("crusader"), [0.1, 0.1, 1])).toBe("top");
    expect(pickView(skin("crusader"), [0.1, 0.1, -1])).toBe("bottom");
    expect(drawnView(skin("crusader"), pickView(skin("crusader"), [-1, 0, 0.1]))).toEqual({ view: "right", mirror: true });
  });

  it("на стыке двух ракурсов прежний держится — картинка не мигает", () => {
    const edge: [number, number, number] = [1, 0.97, 0];
    expect(pickView(skin("dog"), edge)).toBe("right");
    expect(pickView(skin("dog"), edge, "front")).toBe("front");
    expect(pickView(skin("dog"), [1, 0.5, 0], "front")).toBe("right");
  });

  it("все ракурсы каталога — известные направления, отражения — из нарисованных", () => {
    for (const s of SKINS) {
      for (const v of s.views) expect(VIEW_DIRS[v]).toBeDefined();
      for (const [shown, from] of Object.entries(s.mirror ?? {})) {
        expect(VIEW_DIRS[shown]).toBeDefined();
        expect(s.views).toContain(from);
      }
    }
  });
});
