import { describe, expect, it } from "vitest";
import { INKS } from "../profileInks.js";
import { MAIN_PALETTES, PALETTES } from "./dolls.js";

describe("расцветки кукол", () => {
  it("у каждой расцветки есть предпочитаемый свой цвет — один из восьми, которые профиль принимает", () => {
    for (const pal of PALETTES) expect(INKS as readonly string[]).toContain(pal.ink);
  });

  it("у основных расцветок предпочитаемые цвета разные — пятеро с основными не сливаются обводкой", () => {
    const main = PALETTES.slice(0, MAIN_PALETTES).map((p) => p.ink);
    expect(new Set(main).size).toBe(MAIN_PALETTES);
  });
});
