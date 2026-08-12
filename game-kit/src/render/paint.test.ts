import { describe, expect, it } from "vitest";
import { isParametric, type Paint } from "./paint.js";
import { paint, PALETTES } from "./theme.js";

describe("paint — the colour as data", () => {
  it("paint.flat-token-resolves — a token name becomes the palette's hex, per theme", () => {
    expect(paint("dark", "accent")).toBe(PALETTES.dark.accent);
    expect(paint("light", "accent")).toBe(PALETTES.light.accent);
    // The same token is a DIFFERENT hex in the two themes — the whole reason a token beats a hex.
    expect(paint("dark", "stageBg")).not.toBe(paint("light", "stageBg"));
  });

  it("paint.non-token-passes-through — a literal the renderer already understands is left alone", () => {
    expect(paint("dark", "hotpink")).toBe("hotpink");
  });

  it("paint.parametric-spins-the-hue — {token:spin, param} is one name and N numbers, not N hexes", () => {
    const a = paint("dark", { token: "spin", param: 0 });
    const b = paint("dark", { token: "spin", param: 0.5 });
    expect(a).toMatch(/^hsl\(/);
    // Different numbers, different hues — the infinite palette, from one recipe.
    expect(a).not.toBe(b);
  });

  it("paint.parametric-param-wraps — the hue wheel closes, so any number is a colour", () => {
    // 0 and 1 are the same point on the wheel; a param past 1 or below 0 is still on it.
    expect(paint("dark", { token: "spin", param: 0 })).toBe(paint("dark", { token: "spin", param: 1 }));
    expect(paint("dark", { token: "spin", param: -0.25 })).toBe(paint("dark", { token: "spin", param: 0.75 }));
  });

  it("paint.dangling-recipe-falls-back — an unknown recipe is the accent, never a crash", () => {
    const value: Paint = { token: "nosuch", param: 0.4 };
    expect(paint("dark", value)).toBe(PALETTES.dark.accent);
  });

  it("paint.is-parametric-tells-the-shapes-apart — the one place the two forms are distinguished", () => {
    expect(isParametric("accent")).toBe(false);
    expect(isParametric({ token: "spin", param: 0.2 })).toBe(true);
  });
});
