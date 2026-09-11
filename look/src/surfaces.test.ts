// THE LAW THIS FILE EXISTS FOR: the sparkle's scatter is client1's OWN, not a redrawn grid — this
// checks the generated tile's rects against client1's `bg-diamonds.svg`, literally, position by
// position and size by size.

import { describe, expect, it } from "vitest";
import { PALETTE } from "./palette.js";
import { DIAMOND_SCATTER, diamondTile } from "./surfaces.js";

/**
 * client1's `public/bg-diamonds.svg`, `<rect x width height>` only — the fill and the per-diamond
 * SMIL clock are not the scatter's shape, and the port keeps only the shape.
 */
const ORIGINAL: ReadonlyArray<readonly [number, number, number]> = [
  [99, 212, 4], [95, 216, 4], [99, 216, 4], [103, 216, 4], [91, 220, 4], [95, 220, 4], [99, 220, 4],
  [103, 220, 4], [107, 220, 4], [87, 224, 4], [91, 224, 4], [95, 224, 4], [99, 224, 4], [103, 224, 4],
  [107, 224, 4], [111, 224, 4], [91, 228, 4], [95, 228, 4], [99, 228, 4], [103, 228, 4], [107, 228, 4],
  [95, 232, 4], [99, 232, 4], [103, 232, 4], [99, 236, 4],
  [49, 47, 5], [44, 52, 5], [49, 52, 5], [54, 52, 5], [39, 57, 5], [44, 57, 5], [49, 57, 5], [54, 57, 5],
  [59, 57, 5], [34, 62, 5], [39, 62, 5], [44, 62, 5], [49, 62, 5], [54, 62, 5], [59, 62, 5], [64, 62, 5],
  [39, 67, 5], [44, 67, 5], [49, 67, 5], [54, 67, 5], [59, 67, 5], [44, 72, 5], [49, 72, 5], [54, 72, 5],
  [49, 77, 5],
  [54, 475, 5], [49, 480, 5], [54, 480, 5], [59, 480, 5], [44, 485, 5], [49, 485, 5], [54, 485, 5],
  [59, 485, 5], [64, 485, 5], [39, 490, 5], [44, 490, 5], [49, 490, 5], [54, 490, 5], [59, 490, 5],
  [64, 490, 5], [69, 490, 5], [44, 495, 5], [49, 495, 5], [54, 495, 5], [59, 495, 5], [64, 495, 5],
  [49, 500, 5], [54, 500, 5], [59, 500, 5], [54, 505, 5],
  [134, 29, 5], [129, 34, 5], [134, 34, 5], [139, 34, 5], [124, 39, 5], [129, 39, 5], [134, 39, 5],
  [139, 39, 5], [144, 39, 5], [119, 44, 5], [124, 44, 5], [129, 44, 5], [134, 44, 5], [139, 44, 5],
  [144, 44, 5], [149, 44, 5], [124, 49, 5], [129, 49, 5], [134, 49, 5], [139, 49, 5], [144, 49, 5],
  [129, 54, 5], [134, 54, 5], [139, 54, 5], [134, 59, 5],
  [241, 224, 3], [238, 227, 3], [241, 227, 3], [244, 227, 3], [235, 230, 3], [238, 230, 3], [241, 230, 3],
  [244, 230, 3], [247, 230, 3], [232, 233, 3], [235, 233, 3], [238, 233, 3], [241, 233, 3], [244, 233, 3],
  [247, 233, 3], [250, 233, 3], [235, 236, 3], [238, 236, 3], [241, 236, 3], [244, 236, 3], [247, 236, 3],
  [238, 239, 3], [241, 239, 3], [244, 239, 3], [241, 242, 3],
];

function rectsOf(svg: string): Array<readonly [number, number, number]> {
  const src = decodeURIComponent(svg.slice("data:image/svg+xml,".length));
  return [...src.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)"/g)].map((m) => [
    Number(m[1]),
    Number(m[2]),
    Number(m[3]),
  ]);
}

const key = (r: readonly [number, number, number]): string => r.join(",");

describe("the sparkle's scatter", () => {
  it("surfaces.five-clusters-125-pixels — client1's own count", () => {
    expect(DIAMOND_SCATTER.length).toBe(5);
    expect(rectsOf(diamondTile(PALETTE.gold)).length).toBe(ORIGINAL.length);
  });

  it("surfaces.matches-client1s-scatter-pixel-for-pixel", () => {
    const got = new Set(rectsOf(diamondTile(PALETTE.gold)).map(key));
    const want = new Set(ORIGINAL.map(key));
    expect(got).toEqual(want);
  });
});
