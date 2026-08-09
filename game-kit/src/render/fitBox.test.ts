import { describe, expect, it } from "vitest";
import { fitBox, DEFAULT_ALIGN, DEFAULT_FIT } from "./fitBox.js";

const area = { w: 4, h: 2 };
const wide = { w: 2, h: 1 }; // same proportions as the area
const tall = { w: 1, h: 2 }; // deliberately not

describe("fitBox", () => {
  it("fit.contain-is-the-default — a mismatch shows as bars, not as a crop", () => {
    // The choice is not aesthetic. `cover` always looks tidy and quietly eats the edges, so a
    // picture with the wrong proportions ships and nobody notices; `contain` makes a wrong
    // result LOOK wrong, which is the only kind of wrong that gets fixed.
    expect(DEFAULT_FIT).toBe("contain");
    expect(DEFAULT_ALIGN).toBe("center");
    const box = fitBox(area, tall);
    expect(box.h).toBe(2); // limited by the short side
    expect(box.w).toBe(1);
    expect(box.w).toBeLessThan(area.w); // and the bars are real
  });

  it("fit.cover-fills-and-overflows — the other half of the same trade", () => {
    const box = fitBox(area, tall, "cover");
    expect(box.w).toBe(4);
    expect(box.h).toBe(8);
    expect(box.h).toBeGreaterThan(area.h);
  });

  it("fit.matching-proportions-make-contain-and-cover-agree", () => {
    // The case an author aims for: art drawn to the shape it goes in. Any fit is the same fit,
    // and a disagreement here means the asset declared the wrong size.
    expect(fitBox(area, wide, "contain")).toEqual(fitBox(area, wide, "cover"));
  });

  it("fit.fill-ignores-proportions — the only fit that distorts, and it says so", () => {
    expect(fitBox(area, tall, "fill")).toMatchObject({ w: 4, h: 2 });
  });

  it("fit.original-draws-the-declared-size — units, not pixels", () => {
    expect(fitBox(area, tall, "original")).toMatchObject({ w: 1, h: 2, repeat: false });
  });

  it("fit.repeat-is-original-over-and-over — one tile, and a flag", () => {
    // That the two share a size is the whole difference between them: one picture at the
    // declared size, or that same picture endlessly.
    const once = fitBox(area, tall, "original");
    const tiled = fitBox(area, tall, "repeat");
    expect([tiled.w, tiled.h]).toEqual([once.w, once.h]);
    expect(tiled.repeat).toBe(true);
    expect(once.repeat).toBe(false);
  });

  it("fit.fitX-and-fitY-follow-one-axis-and-keep-the-proportions", () => {
    expect(fitBox(area, tall, "fitX")).toMatchObject({ w: 4, h: 8 });
    expect(fitBox(area, tall, "fitY")).toMatchObject({ w: 1, h: 2 });
  });

  it("fit.a-picture-with-no-size-is-not-placed — zero is not a proportion", () => {
    expect(fitBox(area, { w: 0, h: 3 })).toMatchObject({ w: 0, h: 0 });
  });
});

describe("align", () => {
  it("align.centre-is-the-origin — the same origin as everything else", () => {
    expect(fitBox(area, tall, "contain", "center")).toMatchObject({ x: 0, y: 0 });
  });

  it("align.corners-push-the-picture-into-them — by the slack, and no further", () => {
    // Slack is half the difference, because both boxes are centred on the origin.
    const box = fitBox(area, tall, "contain", "topLeft");
    expect(box.x).toBe(-1.5); // (4 − 1) / 2
    expect(box.y).toBe(0); // the picture already fills the height
  });

  it("align.opposite-corners-are-opposite — and the sides are half of each", () => {
    const left = fitBox(area, tall, "original", "left");
    const right = fitBox(area, tall, "original", "right");
    expect(left.x).toBe(-right.x);
    expect(fitBox(area, tall, "original", "bottomRight")).toMatchObject({ x: right.x, y: 0 });
  });

  it("align.does-nothing-when-there-is-no-slack — fill leaves none", () => {
    for (const at of ["topLeft", "bottomRight", "center"] as const) {
      expect(fitBox(area, tall, "fill", at)).toMatchObject({ x: 0, y: 0 });
    }
  });
});
