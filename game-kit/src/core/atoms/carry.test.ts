// The carry styles are pure pose arithmetic — a plain unit test holds the one property that matters:
// on a tilt, does the run stay a coherent body (rigid) or does each card turn in place (loose)? That
// is the owner's solitaire rule, encoded.

import { describe, expect, it } from "vitest";
import { apply } from "../transform.js";
import { carry, installStockCarries, lean, looseCarry, resetCarries, rigidCarry, type CarryContext } from "./carry.js";

const base = (over: Partial<CarryContext> = {}): CarryContext => ({
  anchor: { x: 2, y: 3 },
  offset: { x: 0, y: 0 },
  leanDeg: 0,
  lift: 1,
  i: 0,
  n: 1,
  ...over,
});

/** Where a carried card's own origin lands in root units, given its style + context. */
const originOf = (style: (c: CarryContext) => ReturnType<typeof rigidCarry>, ctx: CarryContext) => apply(style(ctx), { x: 0, y: 0 });

describe("carry", () => {
  it("carry.no-lean-sits-at-anchor-plus-offset — both styles agree when nothing tilts", () => {
    const ctx = base({ offset: { x: 0, y: 0.32 } });
    // With zero lean the two styles are indistinguishable: the card sits at anchor + its offset.
    for (const style of [rigidCarry, looseCarry]) {
      const o = originOf(style, ctx);
      expect(o.x).toBeCloseTo(2);
      expect(o.y).toBeCloseTo(3.32);
    }
  });

  it("carry.rigid-tilts-as-one-body — a lean turns the offset WITH it, so the column stays a plank", () => {
    // A card one step down the run, with the group leaning 20°. Rigid turns the whole body about the
    // pivot, so the offset rotates: the card's x shifts off the pivot's x. That co-rotation is what
    // keeps a vertical solitaire column from tearing into slats.
    const o = originOf(rigidCarry, base({ offset: { x: 0, y: 0.32 }, leanDeg: 20 }));
    expect(o.x).not.toBeCloseTo(2); // moved off the pivot's x — the offset turned
    // Exactly anchor + R(20°)·(0, 0.32): x = 2 − sin20·0.32, y = 3 + cos20·0.32.
    const rad = (20 * Math.PI) / 180;
    expect(o.x).toBeCloseTo(2 - Math.sin(rad) * 0.32);
    expect(o.y).toBeCloseTo(3 + Math.cos(rad) * 0.32);
  });

  it("carry.loose-tilts-each-card-in-place — a lean turns the card, but the offset stays put", () => {
    // Same lean, loose style: the seat does NOT move — only the card's own orientation turns. This is
    // the per-card look the owner does NOT want on the vertical column.
    const o = originOf(looseCarry, base({ offset: { x: 0, y: 0.32 }, leanDeg: 20 }));
    expect(o.x).toBeCloseTo(2); // seat unchanged despite the tilt
    expect(o.y).toBeCloseTo(3.32);
    // The pose still carries the rotation, so the card itself is turned (matrix is not axis-aligned).
    const t = looseCarry(base({ offset: { x: 0, y: 0.32 }, leanDeg: 20 }));
    expect(t.a).toBeCloseTo(Math.cos((20 * Math.PI) / 180));
    expect(t.b).not.toBeCloseTo(0);
  });

  it("carry.single-card-is-the-solo-lean — offset zero, both styles are the same lean about the pivot", () => {
    const ctx = base({ leanDeg: 15 });
    const r = rigidCarry(ctx);
    const l = looseCarry(ctx);
    for (const k of ["a", "b", "c", "d", "e", "f"] as const) expect(r[k]).toBeCloseTo(l[k]);
  });

  it("carry.lift-scales — the whole pose grows by the lift factor", () => {
    const t = rigidCarry(base({ lift: 1.2 }));
    expect(t.a).toBeCloseTo(1.2); // no lean, so scale sits on the diagonal
    expect(t.d).toBeCloseTo(1.2);
  });

  it("carry.lean-from-speed — grows with velocity, saturates at the max, follows the sign", () => {
    expect(lean(0, 0.02, 17)).toBe(0);
    expect(lean(100, 0.02, 17)).toBeCloseTo(2); // 100·0.02
    expect(lean(10000, 0.02, 17)).toBe(17); // clamped
    expect(lean(-10000, 0.02, 17)).toBe(-17); // clamped, other way
  });

  it("carry.registry — names resolve, unknown falls back to rigid, reset clears", () => {
    resetCarries();
    installStockCarries();
    expect(carry("rigid")).toBe(rigidCarry);
    expect(carry("loose")).toBe(looseCarry);
    expect(carry("nope")).toBe(rigidCarry); // unknown → coherent by default, never throws
    resetCarries();
    expect(carry("rigid")).toBe(rigidCarry); // fallback survives an empty registry
  });
});
