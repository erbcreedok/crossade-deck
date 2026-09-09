import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { H, W } from "./card.js";
import { figureBox, figurePlacement, inlineFigure, paddedViewBox, standaloneFigure, viewBoxOf } from "./figures.js";
import { ACCENT_PAINT } from "./style.js";

const COURTS = new URL("../../art/courts/", import.meta.url).pathname;
const files = readdirSync(COURTS).filter((f) => f.endsWith(".svg"));

/** Where a picture of `viewBox` lands when fitted (contain, centred) into a box — CSS's own rule. */
function contain(viewBox: readonly number[], box: { x: number; y: number; w: number; h: number }) {
  const s = Math.min(box.w / viewBox[2]!, box.h / viewBox[3]!);
  const w = viewBox[2]! * s;
  const h = viewBox[3]! * s;
  return { x: box.x + (box.w - w) / 2, y: box.y + (box.h - h) / 2, w, h };
}

describe("decks/figures", () => {
  it("figures.twelve-courts-are-sourced — every J/Q/K of every suit, each with a viewBox and an accent to paint", () => {
    const ids = ["spade", "heart", "diamond", "club"].flatMap((s) => ["J", "Q", "K"].map((r) => `${s}-${r}.svg`));
    expect(files.sort()).toEqual(ids.sort());
    for (const f of files) {
      const svg = readFileSync(COURTS + f, "utf8");
      expect(() => viewBoxOf(svg), f).not.toThrow();
      expect(svg, f).toContain("currentColor");
      expect(svg, f).not.toContain("<metadata>");
    }
  });

  it("figures.the-padded-viewbox-lands-the-ink-where-the-inline-does — one placement, two doors", () => {
    for (const f of files) {
      const vb = viewBoxOf(readFileSync(COURTS + f, "utf8"));
      const inline = figurePlacement(vb);
      // Fit the padded picture to the whole paper; the ORIGINAL box inside it must land at `inline`.
      const padded = paddedViewBox(vb);
      const whole = contain(padded, { x: 0, y: 0, w: W, h: H });
      const s = whole.w / padded[2]!;
      const landed = { x: whole.x + (vb[0] - padded[0]) * s, y: whole.y + (vb[1] - padded[1]) * s, w: vb[2] * s, h: vb[3] * s };
      for (const k of ["x", "y", "w", "h"] as const) expect(landed[k], `${f} ${k}`).toBeCloseTo(inline[k], 6);
    }
  });

  it("figures.the-figure-sits-inside-the-rule — never outside the inset box, and touches it on one axis", () => {
    const box = figureBox();
    for (const f of files) {
      const at = figurePlacement(viewBoxOf(readFileSync(COURTS + f, "utf8")));
      expect(at.x).toBeGreaterThanOrEqual(box.x - 1e-9);
      expect(at.y).toBeGreaterThanOrEqual(box.y - 1e-9);
      expect(at.x + at.w).toBeLessThanOrEqual(box.x + box.w + 1e-9);
      expect(at.y + at.h).toBeLessThanOrEqual(box.y + box.h + 1e-9);
      expect(Math.min(Math.abs(at.w - box.w), Math.abs(at.h - box.h))).toBeLessThan(1e-9);
    }
  });

  it("figures.inline-keeps-the-drawing-and-sets-the-colour — the nested svg is the file with a placement and an accent", () => {
    const svg = readFileSync(COURTS + "heart-Q.svg", "utf8");
    const inline = inlineFigure(svg, ACCENT_PAINT.red);
    expect(inline).toMatch(/^<svg x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" color="#b3221f"/);
    expect(inline).toContain("currentColor");
    expect(inline.length).toBeGreaterThan(svg.length);
  });

  it("figures.a-standalone-file-carries-its-paint — no currentColor left, the viewBox padded to the paper", () => {
    const svg = readFileSync(COURTS + "diamond-J.svg", "utf8");
    const out = standaloneFigure(svg, ACCENT_PAINT.orange);
    expect(out).not.toContain("currentColor");
    expect(out).toContain(ACCENT_PAINT.orange);
    const vb = viewBoxOf(out);
    // Three decimals in the file — a hundredth of a pixel at the baked size.
    expect(vb[2] / vb[3]).toBeCloseTo(W / H, 4);
  });
});
