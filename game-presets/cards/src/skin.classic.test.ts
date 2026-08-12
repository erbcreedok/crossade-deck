import { describe, expect, it } from "vitest";
import { assetNames, assetRecord, surfaceRecord } from "game-kit";
import { crossade } from "./crossade.js";
import { BACK_SURFACE, faceSurface, installClassicSkin } from "./skin.classic.js";

installClassicSkin();

describe("classic skin — a face per card and one shared back", () => {
  it("classic.every-spec-face-resolves — all 55 faces and the back register a surface and an asset", () => {
    expect(surfaceRecord(BACK_SURFACE)).toBeTruthy();
    expect(assetRecord(BACK_SURFACE)).toBeTruthy();
    for (const spec of crossade()) {
      const name = faceSurface(spec);
      expect(surfaceRecord(name), `${spec.id}: no face surface`).toBeTruthy();
      expect(assetRecord(name), `${spec.id}: no face asset`).toBeTruthy();
    }
  });

  it("classic.assets-declare-unit-size — every card texture is 1×1.4 units, never zero", () => {
    const cardAssets = assetNames().filter((n) => n.startsWith("cards/"));
    expect(cardAssets.length).toBe(56); // 55 faces + 1 back
    for (const name of cardAssets) {
      const rec = assetRecord(name)!;
      expect(rec.w, `${name}.w`).toBe(1);
      expect(rec.h, `${name}.h`).toBe(1.4);
    }
  });

  it("classic.textures-are-sourced — the art is the add-on's own, shipped as self-contained data URIs", () => {
    // Provenance: the engine ships no image. Every card picture is an SVG data URI penned in this
    // package — not a path into the engine, not a remote file.
    for (const name of assetNames().filter((n) => n.startsWith("cards/"))) {
      expect(assetRecord(name)!.src.startsWith("data:image/svg+xml,"), `${name}`).toBe(true);
    }
  });
});
