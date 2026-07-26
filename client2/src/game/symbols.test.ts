import { describe, it, expect } from "vitest";
import { SUIT_PATH, SVG_VIEWBOX, suitSvg, symbolSvg, symbolCanvasSvg, hexColor } from "./symbols";
import { SUITS } from "./card";

describe("symbols — SVG-символы (единый источник для html+канваса)", () => {
  it("у всех 4 мастей есть непустой замкнутый SVG-путь", () => {
    for (const s of SUITS) {
      expect(SUIT_PATH[s], `путь масти ${s}`).toBeTruthy();
      expect(SUIT_PATH[s]).toMatch(/^M/); // moveto в начале
      expect(SUIT_PATH[s]).toMatch(/z$/i); // замкнут
    }
  });

  it("hexColor — #RRGGBB с ведущими нулями", () => {
    expect(hexColor(0xd83a3a)).toBe("#d83a3a");
    expect(hexColor(0x1a1a1a)).toBe("#1a1a1a");
    expect(hexColor(0x00ff00)).toBe("#00ff00");
  });

  it("suitSvg (HTML) — валидный <svg> с viewBox, путём масти и цветом", () => {
    const svg = suitSvg("♥", 0xd83a3a, 24);
    expect(svg).toContain(`viewBox="0 0 ${SVG_VIEWBOX} ${SVG_VIEWBOX}"`);
    expect(svg).toContain(SUIT_PATH["♥"]);
    expect(svg).toContain('fill="#d83a3a"');
    expect(svg).toContain('width="24"');
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("symbolCanvasSvg (канвас/Pixi) — БЕЗ viewBox (сырые координаты 0..24)", () => {
    const svg = symbolCanvasSvg(SUIT_PATH["♠"], 0x1a1a1a);
    expect(svg).not.toContain("viewBox");
    expect(svg).toContain(SUIT_PATH["♠"]);
    expect(svg).toContain('fill="#1a1a1a"');
  });

  it("symbolSvg работает для ЛЮБОГО пути (не только мастей) — общий примитив", () => {
    const svg = symbolSvg("M0 0h24v24h-24z", 0x123456);
    expect(svg).toContain('d="M0 0h24v24h-24z"');
    expect(svg).toContain('fill="#123456"');
  });
});
