// THE LAW THIS FILE EXISTS FOR: the sparkle rides in both trees the hub ever shows, under the
// SAME id (so `shell.ts`'s shimmer can find it either way), but wearing a DIFFERENT surface —
// bright in the lobby, muted on the table — which is the one thing client1's `.pixel-bg--game`
// changes about it.

import { byId, fieldsOf, type SurfacedFields } from "game-kit";
import { describe, expect, it } from "vitest";
import { barTree, hubTree, SPARKLE_ID } from "./grid.js";
import { SPARKLE, SPARKLE_DIM } from "@crossade/look";

describe("the sparkle layer", () => {
  it("grid.lobby-sparkle-is-bright", () => {
    const sparkle = byId(hubTree(), SPARKLE_ID);
    expect(sparkle).toBeDefined();
    expect(fieldsOf<SurfacedFields>(sparkle!, "Surfaced")?.surface).toBe(SPARKLE);
  });

  it("grid.table-sparkle-is-muted — a different surface than the lobby's", () => {
    const sparkle = byId(barTree({ topY: 0, height: 1 }), SPARKLE_ID);
    expect(sparkle).toBeDefined();
    expect(fieldsOf<SurfacedFields>(sparkle!, "Surfaced")?.surface).toBe(SPARKLE_DIM);
  });
});
