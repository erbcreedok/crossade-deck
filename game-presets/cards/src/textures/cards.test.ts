import { describe, expect, it } from "vitest";
import { crossade } from "../crossade.js";
import { faceSvg } from "./cards.js";

// The faces ship as encoded data URIs; decode back to the SVG source to read its shape.
const face = (id: string): string => decodeURIComponent(faceSvg(crossade().find((s) => s.id === id)!));
const count = (svg: string, re: RegExp): number => (svg.match(re) ?? []).length;

describe("classic card faces", () => {
  it("classic.a-number-shows-that-many-pips — 2..10 carry exactly their rank in suit marks", () => {
    // Each number card is its rank in pips plus the two corner marks. The layout table is complete
    // for every rank, so a dropped pip fails HERE rather than being noticed at a table.
    for (let n = 2; n <= 10; n++) {
      expect(count(face(`spade-${n}`), /<path/g), `${n}`).toBe(n + 2); // n pips + 2 corner marks
    }
  });

  it("classic.a-court-is-framed — J/Q/K wear a centre panel a number card does not", () => {
    const plain = count(face("spade-7"), /<rect/g); // the ground and its inner frame
    for (const r of ["J", "Q", "K"]) {
      expect(count(face(`spade-${r}`), /<rect/g), `${r}`).toBe(plain + 1); // and the court's own panel
    }
  });
});
