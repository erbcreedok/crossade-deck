import { describe, expect, it } from "vitest";
import { cleanParts, drawnView, partOf, partsFor, PARTS, pickView, SETS, setMatching, SLOTS, VIEW_DIRS } from "./skins.js";

const part = (id: string) => partOf(id)!;

describe("ракурсы частей — как спрайты в Doom", () => {
  it("у шара ракурс один — его видно одинаково отовсюду", () => {
    for (const d of Object.values(VIEW_DIRS)) expect(pickView(part("ball:head"), d)).toBe("front");
  });

  it("король — лицом, если смотрят спереди, и спиной, если сзади; сбоку — что ближе", () => {
    expect(pickView(part("king:body"), [0, 1, 0.3])).toBe("front");
    expect(pickView(part("king:body"), [0, -1, 0.3])).toBe("back");
    expect(pickView(part("king:body"), [1, 0.2, 0])).toBe("front");
    expect(pickView(part("king:body"), [1, -0.2, 0])).toBe("back");
  });

  it("пёс сбоку — в профиль; левый бок — отражённый правый", () => {
    expect(pickView(part("dog:body"), [1, 0.1, 0.2])).toBe("right");
    expect(pickView(part("dog:body"), [-1, 0.1, 0.2])).toBe("left");
    expect(drawnView(part("dog:body"), "left")).toEqual({ view: "right", mirror: true });
  });

  it("крестоносец — все шесть сторон; кубик сверху — верхней гранью", () => {
    expect(pickView(part("crusader:head"), [0.1, 0.1, 1])).toBe("top");
    expect(pickView(part("crusader:head"), [0.1, 0.1, -1])).toBe("bottom");
    expect(pickView(part("cube:head"), [0.1, 0.2, 1])).toBe("top");
  });

  it("верх — только почти отвесно сверху; в изометрии — бок; между — держится прежний (зона толерантности)", () => {
    const at = (deg: number): [number, number, number] => { const e = (deg * Math.PI) / 180; return [Math.cos(e), 0, Math.sin(e)]; };
    const bot = part("crusader:body");
    expect(pickView(bot, at(45)), "изометрия — бок, не верх").toBe("right");
    expect(pickView(bot, at(65), "right"), "поднялся по диагонали — всё ещё бок").toBe("right");
    expect(pickView(bot, at(80), "right"), "встал почти отвесно — верх").toBe("top");
    expect(pickView(bot, at(50), "top"), "вернулся в диагональ — верх держится").toBe("top");
    expect(pickView(bot, at(25), "top"), "опустился в бок — бок").toBe("right");
    expect(pickView(bot, at(-80), "right"), "снизу — так же").toBe("bottom");
  });

  it("бочонок — 18 ракурсов по кругу: повёрнут на 140° — показан 140°", () => {
    expect(part("barrel:body").views).toHaveLength(18);
    const a = (140 * Math.PI) / 180;
    expect(pickView(part("barrel:body"), [Math.sin(a), Math.cos(a), 0])).toBe("a140");
  });

  it("на стыке двух ракурсов прежний держится — картинка не мигает", () => {
    const edge = [1, 0.97, 0] as const;
    expect(pickView(part("dog:body"), edge)).toBe("right");
    expect(pickView(part("dog:body"), edge, "front")).toBe("front");
    expect(pickView(part("dog:body"), [1, 0.5, 0], "front")).toBe("right");
  });

  it("все ракурсы каталога — известные направления, отражения — из нарисованных", () => {
    for (const p of PARTS) {
      for (const v of p.views) expect(VIEW_DIRS[v], `${p.id}: ${v}`).toBeDefined();
      for (const [shown, from] of Object.entries(p.mirror ?? {})) {
        expect(VIEW_DIRS[shown]).toBeDefined();
        expect(p.views).toContain(from);
      }
    }
  });
});

describe("скин — набор частей", () => {
  it("у каждого набора все пять частей, и каждая стоит в своём слоте", () => {
    for (const s of SETS) for (const slot of SLOTS) expect(partOf(s.parts[slot])?.slot, `${s.id}.${slot}`).toBe(slot);
  });

  it("старый профиль с одной куклой — её набор; своя часть поверх — только в своём слоте", () => {
    expect(partsFor("dog").head).toBe("dog:head");
    const mine = partsFor("dog", { head: "ball:head", body: "ball:head" as never });
    expect(mine.head).toBe("ball:head");
    expect(mine.body).toBe("dog:body");
    expect(setMatching(partsFor("dog"))?.id).toBe("dog");
    expect(setMatching(mine)).toBeUndefined();
  });

  it("из сети — только известные части в своих слотах", () => {
    expect(cleanParts({ head: "cube:head", body: "cube:head", legs: "nope", hair: 5 })).toEqual({ head: "cube:head" });
  });
});
