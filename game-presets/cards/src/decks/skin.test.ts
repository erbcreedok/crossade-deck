import { existsSync } from "node:fs";
import { assetRecord, resetAssets, resetSurfaces, surfaceRecord } from "game-kit";
import { beforeEach, describe, expect, it } from "vitest";
import { crossade } from "../crossade.js";
import { BACK_NAMES } from "./backs.js";
import { isCourt } from "./face.js";
import { deckBackSurface, deckFaceSurface, installDeckBacks, installDeckSkin } from "./skin.js";
import { deckStyleId, DECK_STYLES } from "./style.js";

const BAKED = new URL("./baked/", import.meta.url).pathname;
const CLASSIC = DECK_STYLES[0]!;

describe("decks/skin", () => {
  beforeEach(() => {
    resetAssets();
    resetSurfaces();
  });

  it("skin.every-style-registers-every-face — 55 surfaces and assets per style, 1×1.4 units, through either door", () => {
    for (const source of ["raster", "vector"] as const) {
      for (const style of DECK_STYLES) {
        installDeckSkin(style, source);
        for (const spec of crossade()) {
          const name = deckFaceSurface(spec, style);
          expect(surfaceRecord(name), `${source} ${name}`).toBeTruthy();
          const asset = assetRecord(name)!;
          expect(asset, `${source} ${name}`).toBeTruthy();
          expect(asset.w).toBe(1);
          expect(asset.h).toBe(1.4);
        }
      }
    }
  });

  it("skin.raster-is-baked — every face of every style and every back has its WebP; the bake was run", () => {
    const missing: string[] = [];
    for (const style of DECK_STYLES) {
      for (const spec of crossade()) {
        const file = `${BAKED}${deckStyleId(style)}/${spec.id}.webp`;
        if (!existsSync(file)) missing.push(file.slice(BAKED.length));
      }
    }
    for (const back of BACK_NAMES) if (!existsSync(`${BAKED}backs/${back}.webp`)) missing.push(`backs/${back}.webp`);
    expect(missing).toEqual([]);
    installDeckSkin(CLASSIC, "raster");
    expect(assetRecord(deckFaceSurface(crossade()[0]!, CLASSIC))!.src).toMatch(/\/baked\/classic\/spade-A\.webp$/);
  });

  it("skin.vector-courts-are-two-layers — the paper, then the figure file fitted whole; numbers are one", () => {
    installDeckSkin(CLASSIC, "vector");
    const king = crossade().find((c) => c.id === "diamond-K")!;
    const layers = surfaceRecord(deckFaceSurface(king, CLASSIC))!.layers;
    expect(layers).toHaveLength(2);
    expect(layers[1]!.fit).toBe("contain");
    const figure = assetRecord(layers[1]!.image!)!;
    expect(figure.src).toMatch(/\/figures\/red\/diamond-K\.svg$/);
    expect(existsSync(new URL(figure.src).pathname)).toBe(true);
    // Under four colours the diamonds take the orange file; the spades keep the red one.
    const four = { ...CLASSIC, fourColour: true };
    installDeckSkin(four, "vector");
    expect(assetRecord(surfaceRecord(deckFaceSurface(king, four))!.layers[1]!.image!)!.src).toMatch(/\/orange\/diamond-K\.svg$/);
    const spade = crossade().find((c) => c.id === "spade-K")!;
    expect(assetRecord(surfaceRecord(deckFaceSurface(spade, four))!.layers[1]!.image!)!.src).toMatch(/\/red\/spade-K\.svg$/);
    const seven = crossade().find((c) => c.id === "diamond-7")!;
    expect(surfaceRecord(deckFaceSurface(seven, CLASSIC))!.layers).toHaveLength(1);
    expect(assetRecord(deckFaceSurface(seven, CLASSIC))!.src.startsWith("data:image/svg+xml,")).toBe(true);
    // Minimal never layers a figure: a court there is a letter and a mark.
    const minimal = { ...CLASSIC, layout: "minimal" as const };
    installDeckSkin(minimal, "vector");
    expect(surfaceRecord(deckFaceSurface(king, minimal))!.layers).toHaveLength(1);
    expect(crossade().filter(isCourt)).toHaveLength(12);
  });

  it("skin.backs-are-their-own-slot — six surfaces, no style in the name, through either door", () => {
    for (const source of ["raster", "vector"] as const) {
      installDeckBacks(source);
      for (const name of BACK_NAMES) {
        const surface = deckBackSurface(name);
        expect(surface).not.toContain("classic");
        expect(surfaceRecord(surface), `${source} ${name}`).toBeTruthy();
        expect(assetRecord(surface)!.h).toBe(1.4);
      }
    }
  });
});
