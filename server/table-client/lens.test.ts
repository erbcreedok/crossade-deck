// ЛИНЗА СТОЛА — наклон с перспективой, и палец попадает туда же, куда легла кисть.

import { describe, expect, it } from "vitest";
import { Camera } from "../../game-kit/src/render/camera/index.js";
import { apply } from "../../game-kit/src/core/transform.js";
import { lens } from "./lens.js";

const frame = { w: 390, h: 760 };
const K = 24;
const TABLE = { r: 7, depth: 0.9 };

/** Камера кита на этом кадре и с этим наклоном — такой её держит стол. */
function камера(pitch: number) {
  const c = new Camera({ minZoom: 0.5, maxZoom: 2.5, maxPitch: 60 });
  c.setScreen(frame.w, frame.h);
  c.setContent({ x: -16, y: -16, w: 32, h: 32 }, K);
  c.tiltTo(pitch);
  return lens(c.transform(), c.pitch, c.pixelsPerUnit, frame, TABLE);
}

describe("lens.flat-is-the-kit-camera", () => {
  it("сверху линза — ровно камера кита: ни одна точка не сдвинулась", () => {
    const c = new Camera({ minZoom: 0.5, maxZoom: 2.5, maxPitch: 60 });
    c.setScreen(frame.w, frame.h);
    c.setContent({ x: -16, y: -16, w: 32, h: 32 }, K);
    const l = lens(c.transform(), 0, c.pixelsPerUnit, frame, TABLE);
    for (const p of [{ x: 0, y: 0 }, { x: 5, y: -3 }, { x: -6, y: 6 }]) {
      const want = apply(c.transform(), p);
      const got = l.toGlass(p);
      expect(got.x).toBeCloseTo(want.x, 6);
      expect(got.y).toBeCloseTo(want.y, 6);
    }
  });
});

describe("lens.the-far-edge-goes-away", () => {
  it("наклонён — дальний край уже ближнего, и карта вдали мельче", () => {
    const l = камера(45);
    const far = l.toGlass({ x: 6, y: -6 }).x - l.toGlass({ x: -6, y: -6 }).x;
    const nearW = l.toGlass({ x: 6, y: 6 }).x - l.toGlass({ x: -6, y: 6 }).x;
    expect(far / nearW, "дальний край заметно уже").toBeLessThan(0.85);
    expect(l.kAt({ x: 0, y: -6 })).toBeLessThan(l.kAt({ x: 0, y: 6 }));
  });

  it("стол с торцом не шире экрана", () => {
    const l = камера(60);
    let x0 = Infinity, x1 = -Infinity;
    for (let i = 0; i < 72; i += 1) {
      const t = (i / 72) * Math.PI * 2;
      for (const h of [0, -TABLE.depth]) {
        const q = l.toGlass({ x: Math.cos(t) * TABLE.r, y: Math.sin(t) * TABLE.r }, h);
        x0 = Math.min(x0, q.x);
        x1 = Math.max(x1, q.x);
      }
    }
    expect(x1 - x0).toBeLessThanOrEqual(2 * TABLE.r * K + 0.5);
  });
});

describe("lens.the-finger-lands-where-the-brush-drew", () => {
  it("туда и обратно — та же точка стола, при любом наклоне", () => {
    for (const pitch of [0, 20, 45, 60]) {
      const l = камера(pitch);
      for (const p of [{ x: 0, y: 0 }, { x: 4, y: -5 }, { x: -6, y: 5 }, { x: 3, y: 6.5 }]) {
        const back = l.toDesk(l.toGlass(p));
        expect(back.x, `${pitch}° x`).toBeCloseTo(p.x, 6);
        expect(back.y, `${pitch}° y`).toBeCloseTo(p.y, 6);
      }
    }
  });

  it("локальная матрица рядом с точкой рисует туда же, куда линза", () => {
    const l = камера(45);
    const p = { x: 2, y: -4 };
    const m = l.near(p);
    const q = { x: p.x + 0.3, y: p.y - 0.2 };
    const want = l.toGlass(q);
    const got = apply(m, q);
    expect(Math.hypot(got.x - want.x, got.y - want.y), "на размере карты — меньше пикселя").toBeLessThan(1);
  });
});
