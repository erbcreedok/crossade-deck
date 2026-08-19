// The pointer seam, held down without a canvas. `glassOf` is arithmetic on an event, and `toUnits`
// and `pick` read the same plan `scenePlan.test.ts` already exercises — so a stub host with a unit,
// a viewport and a viewer is the whole fixture, and no WebGL, no jsdom, is needed to prove them.

import { beforeEach, describe, expect, it } from "vitest";
import { Container, registerLayout, resetLayouts } from "../core/atoms/container.js";
import { freeLayout } from "../core/atoms/layouts.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Transformable } from "../core/atoms/transformable.js";
import { Bounded } from "../core/atoms/bounded.js";
import { add, caps, node } from "../core/node.js";
import { DEFAULT_VIEWER } from "../core/viewer.js";
import { apply } from "../core/transform.js";
import { rect } from "../presets/shapes.js";
import { resetSurfaces } from "./surfaces.js";
import { installStockSurfaces } from "../presets/surfaces.js";
import { viewTransform } from "./scenePlan.js";
import { type Host } from "./host.js";
import { glassOf, pick, toUnits } from "./pointer.js";
import { Camera } from "./camera.js";

const box = (w: number, h: number) => Bounded({ bounds: rect(w, h) });

/** A host is asked only three things by `toUnits`/`pick`; a stub of those three is the fixture. */
const host = (unit: number, width = 800, height = 600): Host =>
  ({
    unit: () => unit,
    viewport: () => ({ width, height, dpr: 1 }),
    viewer: () => DEFAULT_VIEWER,
  }) as unknown as Host;

/** The view is asked only for its origin; the event, only for its client point. */
const view = (left: number, top: number): HTMLCanvasElement =>
  ({ getBoundingClientRect: () => ({ left, top }) }) as unknown as HTMLCanvasElement;
const at = (clientX: number, clientY: number): PointerEvent =>
  ({ clientX, clientY }) as unknown as PointerEvent;

beforeEach(() => {
  resetLayouts();
  registerLayout("free", freeLayout);
  resetSurfaces();
  installStockSurfaces();
});

describe("the pointer seam", () => {
  it("pointer.glass-subtracts-the-view-origin — the point is relative to the view, not the page", () => {
    expect(glassOf(view(30, 12), at(200, 150))).toEqual({ x: 170, y: 138 });
  });

  it("pointer.units-invert-the-view-matrix — the exact inverse of what the plan applies", () => {
    const h = host(100, 800, 600);
    // The root sits in the middle of an 800×600 view at 100px per unit, so the centre glass point
    // is the origin, and one unit right of it is 100px right of centre.
    expect(toUnits(h, { x: 400, y: 300 })).toEqual({ x: 0, y: 0 });
    expect(toUnits(h, { x: 500, y: 300 })).toEqual({ x: 1, y: 0 });
    // And it round-trips: whatever the plan maps a unit point to, `toUnits` maps back.
    const p = { x: 1.5, y: -0.5 };
    const glass = apply(viewTransform(100, 800, 600), p);
    const back = toUnits(h, glass);
    expect(back.x).toBeCloseTo(p.x, 9);
    expect(back.y).toBeCloseTo(p.y, 9);
  });

  it("pointer.units-fall-back-when-the-matrix-is-singular — a sizeless view is not a division", () => {
    // Before layout a container reports a unit of zero; the view matrix cannot be inverted, and
    // rather than put NaN through every hit-test the glass point is handed back untouched.
    expect(toUnits(host(0, 800, 600), { x: 400, y: 300 })).toEqual({ x: 400, y: 300 });
  });

  it("pointer.picks-the-topmost-under-the-point — what the finger hits is what the eye sees", () => {
    const root = node("root", Container({ layout: "free" }));
    add(root, node("under", box(1, 1), Surfaced(), Transformable({ z: 1 })));
    add(root, node("over", box(1, 1), Surfaced(), Transformable({ z: 5 })));
    // Both quads cover the centre; the higher z is drawn last and so is tested first.
    expect(pick(host(100), root, { x: 400, y: 300 }, () => true)?.id).toBe("over");
  });

  it("pointer.picks-what-the-filter-admits — the topmost is skipped when the filter rejects it", () => {
    const root = node("desk", box(3, 3), Container({ layout: "free" }), Surfaced());
    add(root, node("card", box(1, 1), Surfaced(), Transformable({ z: 5 })));
    // The card is on top but is no container; the pick falls through to the desk beneath it.
    expect(pick(host(100), root, { x: 400, y: 300 }, (n) => caps(n).has("Container"))?.id).toBe("desk");
  });

  it("pointer.follows-the-camera — the finger and the eye go through one door", () => {
    // A pick that rebuilt the plan WITHOUT the camera agrees with the eye exactly as long as the
    // desk sits unpanned, and then quietly stops: the card is drawn over there and answers over
    // here. `docs/design/camera.md` — into coordinates there is ONE door.
    const root = node("desk", Container({ layout: "free" }));
    add(root, node("card", box(1, 1), Surfaced()));
    const h = host(100, 800, 600);
    const c = new Camera({ minZoom: 0.25, maxZoom: 4 });
    c.setScreen(800, 600);
    c.setContent({ x: -8, y: -6, w: 16, h: 12 }, 100); // twice the glass, so there is room to pan
    c.lookAt({ x: 0, y: 0 });
    const view = (): ReturnType<Camera["transform"]> => c.transform();
    // Centred, the two views agree — which is what makes the difference below the camera's doing.
    expect(pick(h, root, { x: 400, y: 300 }, () => true, view())?.id).toBe("card");
    c.panBy(-150, 0); // the desk slides left, and so does the card
    expect(pick(h, root, { x: 400, y: 300 }, () => true, view())).toBeUndefined();
    expect(pick(h, root, { x: 250, y: 300 }, () => true, view())?.id).toBe("card");
    // And units come back through the same matrix.
    expect(toUnits(h, { x: 250, y: 300 }, view()).x).toBeCloseTo(0, 6);
  });

  it("pointer.misses-outside-every-quad — empty glass hits nothing", () => {
    const root = node("solo", box(1, 1), Surfaced());
    expect(pick(host(100), root, { x: 10, y: 10 }, () => true)).toBeUndefined();
  });
});
