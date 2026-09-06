import { describe, expect, it } from "vitest";
import { HOME_ANCHOR } from "./presence.js";
import { homeZoom, HOME_MARGIN, type HomeRoom } from "./homeView.js";

/** The round felt as the hub measures it: the ask, and a diameter to measure it across. */
const ROUND = { span: 1.5, width: 20 };

/** Where the top of the felt lands on the glass, in screen pixels, at a given span. */
function topOfDesk(glass: { w: number; h: number }, span: number, room: HomeRoom = ROUND): number {
  const perUnit = (glass.w * span) / (room.width ?? 1);
  return glass.h * HOME_ANCHOR.y - (room.reach ?? room.width ?? 1) * perUnit;
}

describe("homeZoom", () => {
  it("homeZoom.the-ask-stands-when-it-fits — gives the desk its own ask when the whole of it fits above the anchor", () => {
    expect(homeZoom({ w: 393, h: 1200 }, ROUND)).toBe(ROUND.span);
  });

  it("homeZoom.the-far-rim-clears-a-top-inset — a short glass under a consumer's own bar", () => {
    const glass = { w: 393, h: 740 };
    const span = homeZoom(glass, ROUND, { top: 70 });
    expect(span, "smaller than asked for, because the ask would not fit").toBeLessThan(ROUND.span);
    expect(topOfDesk(glass, span), "the top of the felt clears the inset").toBeGreaterThanOrEqual(70);
    expect(topOfDesk(glass, span)).toBeCloseTo(70 + HOME_MARGIN, 5);
  });

  it("homeZoom.a-short-glass-is-enough-on-its-own — cut by the height even with nothing covering it", () => {
    const glass = { w: 393, h: 684 };
    expect(homeZoom(glass, ROUND)).toBeLessThan(ROUND.span);
    expect(topOfDesk(glass, homeZoom(glass, ROUND))).toBeCloseTo(HOME_MARGIN, 5);
  });

  it("homeZoom.the-reach-decides-the-fit — the ask is measured across the width, the fit across the reach", () => {
    const glass = { w: 393, h: 740 };
    const deep = { span: 1.5, width: 20, reach: 40 };
    expect(topOfDesk(glass, homeZoom(glass, deep, {}), deep)).toBeCloseTo(HOME_MARGIN, 5);
  });

  it("homeZoom.a-glass-with-no-room-is-not-an-answer — falls back to the ask", () => {
    expect(homeZoom({ w: 393, h: 40 }, ROUND, { top: 70 })).toBe(ROUND.span);
    expect(homeZoom({ w: 0, h: 0 }, ROUND)).toBe(ROUND.span);
  });
});
