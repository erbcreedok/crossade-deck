import { describe, it, expect } from "vitest";
import { validateHud } from "./validate";
import { pin, placeholderW, region, zoneW } from "../core/hudSpec";
import type { ZoneSpec } from "../core/spec";

// Сторож громкости HUD: битая спека жалуется словами, а не «тихо уезжает на борд»
// (как рука при коллизии ключей старого формата — тот баг больше невозможен и не молчит).

const strip = (id: string): ZoneSpec => ({ id, title: "", layout: { kind: "strip" }, policy: { onOccupied: "merge" } });
const zones = [strip("hand"), strip("pouch")];

describe("validateHud", () => {
  it("честная спека — без претензий", () => {
    const hud = { areas: [region("bottom", "start", [zoneW("hand")]), pin("bottom-right", [zoneW("pouch", 72)])] };
    expect(validateHud({ zones, hud })).toEqual([]);
    expect(validateHud({ zones })).toEqual([]);
  });

  it("ссылка на несуществующую зону — претензия", () => {
    const hud = { areas: [region("bottom", "start", [zoneW("нетакой")])] };
    expect(validateHud({ zones, hud })[0]).toContain("нетакой");
  });

  it("одна зона в двух областях — претензия (кто-то из них молча проиграет)", () => {
    const hud = { areas: [region("bottom", "start", [zoneW("hand")]), region("top", "end", [zoneW("hand")])] };
    expect(validateHud({ zones, hud }).some((e) => e.includes("уже пришвартована"))).toBe(true);
  });

  it("{fr} в пине и пустая область — претензии", () => {
    const hud = { areas: [pin("top-right", [zoneW("hand", { fr: 1 })]), region("bottom", "start", [])] };
    const errs = validateHud({ zones, hud });
    expect(errs.some((e) => e.includes("{fr} в пине"))).toBe(true);
    expect(errs.some((e) => e.includes("без виджетов"))).toBe(true);
  });
});
