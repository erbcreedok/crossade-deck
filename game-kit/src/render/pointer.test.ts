// The pointer seam, held down without a canvas. `glassOf` is arithmetic on an event, and `toUnits`
// and `pick` read the same plan `scenePlan.test.ts` already exercises — so a stub host with a unit,
// a viewport and a viewer is the whole fixture, and no WebGL, no jsdom, is needed to prove them.

import { beforeEach, describe, expect, it } from "vitest";
import { Container, registerLayout, resetLayouts } from "../core/atoms/container.js";
import { freeLayout } from "../core/atoms/layouts.js";
import { Surfaced } from "../core/atoms/surfaced.js";
import { Transformable } from "../core/atoms/transformable.js";
import { Bounded } from "../core/atoms/bounded.js";
import { Forgiving } from "../core/atoms/forgiving.js";
import { add, caps, node } from "../core/node.js";
import { DEFAULT_VIEWER } from "../core/viewer.js";
import { apply } from "../core/transform.js";
import { rect } from "../presets/shapes.js";
import { resetSurfaces } from "./surfaces.js";
import { installStockSurfaces } from "../presets/surfaces.js";
import { viewTransform } from "./scenePlan/index.js";
import { type Host } from "./host.js";
import { glassOf, pick, toUnits } from "./pointer.js";
import { Camera } from "./camera/index.js";

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

  it("pointer.picks-where-the-clock-drew-it — a flying piece answers to a touch on the piece, not on its seat", () => {
    // The plan the painter drew is the CLOCK's plan too. Without the poses the finger tests where
    // everything RESTS — so a die halfway across a tray ignores a touch on the die and answers one
    // on the seat it left, which is exactly the "the animation is blocking my hand" feeling.
    const desk = node("desk", Container({ layout: "free" }));
    add(desk, node("die", box(1, 1), Surfaced(), Transformable({ at: { x: 0, y: 0 } })));
    const h = host(100);
    const seat = { x: 400, y: 300 }; // the origin of an 800×600 glass at 100 px/unit
    const away = { x: 700, y: 300 }; // three units to the right
    const flying = new Map([["die", { a: 1, b: 0, c: 0, d: 1, e: 3, f: 0 }]]);
    // At rest, the seat is where it is and three units on is empty glass.
    expect(pick(h, desk, seat, () => true)?.id).toBe("die");
    expect(pick(h, desk, away, () => true)).toBeUndefined();
    // Handed the clock's poses, the answers swap — the finger follows the picture.
    expect(pick(h, desk, away, () => true, undefined, flying)?.id).toBe("die");
    expect(pick(h, desk, seat, () => true, undefined, flying)).toBeUndefined();
  });

  it("pointer.misses-outside-every-quad — empty glass hits nothing", () => {
    const root = node("solo", box(1, 1), Surfaced());
    expect(pick(host(100), root, { x: 10, y: 10 }, () => true)).toBeUndefined();
  });
  it("pointer.a-sliver-hands-the-finger-upwards — a piece must show enough of itself to answer", () => {
    // On a desk where things lie on top of each other, most of what is under the top of a pile is a
    // sliver of edge a few pixels wide. A finger landing on one gets a piece nobody was aiming at —
    // on a stack of thirty that is nearly every touch near the border. Below the threshold a piece
    // does not answer at all and the touch goes to whatever covers it, and so on up the pile.
    const h = host(100, 800, 600);
    const desk = node("desk", Container({ layout: "free" }));
    // Three cards a hundredth of a card apart: the lower two show a two-pixel edge and nothing else.
    for (let i = 0; i < 3; i++) {
      add(desk, node(`c${i}`, box(1, 1.4), Surfaced(), Transformable({ at: { x: i * 0.02, y: -i * 0.02 } })));
    }
    const any = (): boolean => true;
    // The point is on the LOWEST card's own sliver, down its left edge — a corner would land in the
    // stock surface's rounding and belong to nobody.
    const g = apply(viewTransform(100, 800, 600), { x: -0.495, y: 0.4 });
    // Plainly, the topmost thing under the point answers — which here is the sliver's own card.
    expect(pick(h, desk, g, any)?.id).toBe("c0");
    // Asked for a quarter of a card showing, the sliver hands the finger up the pile to the top.
    expect(pick(h, desk, g, any, undefined, undefined, 0.25)?.id).toBe("c2");
    // And a piece that is properly visible still answers for itself: the top card is nobody's sliver.
    const own = apply(viewTransform(100, 800, 600), { x: 0.04, y: -0.04 });
    expect(pick(h, desk, own, any, undefined, undefined, 0.25)?.id).toBe("c2");
    // A lone piece shows all of itself, so a threshold changes nothing about it.
    const solo = node("solo", Container({ layout: "free" }));
    add(solo, node("one", box(1, 1.4), Surfaced(), Transformable({ at: { x: 0, y: 0 } })));
    const mid = apply(viewTransform(100, 800, 600), { x: 0, y: 0 });
    expect(pick(h, solo, mid, any, undefined, undefined, 0.9)?.id).toBe("one");
  });

  it("pick.a-forgiving-node-catches-a-miss-and-never-steals — the touch area is not the picture", () => {
    // A control is aimed at with a fingertip and drawn for an eye. A drag handle is a few pixels
    // tall on purpose — one drawn as a slab would be a slab — and a fingertip covers forty-odd
    // pixels of glass while hiding the target on the way down. So the honest answer is not to draw
    // it bigger; it is to catch the misses.
    const desk = node("desk", Container({ layout: "free" }));
    const tab = node("tab", box(1, 0.25), Surfaced(), Transformable({ at: { x: 0, y: 2 } }), Forgiving({ miss: 0.5 }));
    const card = node("card", box(2, 2.8), Surfaced(), Transformable({ at: { x: 0, y: 0 } }));
    add(desk, tab);
    add(desk, card);
    const h = host(100, 800, 600);
    // The plan builds this very view from the host's own unit and viewport, so the point is put
    // through it here and `pick` is left to make its own — as every other case in this file does.
    const glass = (x: number, y: number) => apply(viewTransform(100, 800, 600), { x, y });
    const any = (): boolean => true;

    // Squarely on it, as always.
    expect(pick(h, desk, glass(0, 2), any)?.id, "dead centre").toBe("tab");
    // A finger a quarter of a unit BELOW its bottom edge: past the picture, inside the forgiveness.
    expect(pick(h, desk, glass(0, 2.4), any)?.id, "a miss it forgives").toBe("tab");
    // ...and past the forgiveness, nothing. A slop is a THRESHOLD and the pick keeps to it.
    expect(pick(h, desk, glass(0, 3.2), any), "a miss it does not").toBeUndefined();

    // IT NEVER STEALS. The card is drawn well clear of the tab but within the tab's forgiveness at
    // its nearest corner; a finger squarely on the card must still get the card. What the second
    // pass catches is only the touches that were going to be answered by nothing at all.
    expect(pick(h, desk, glass(0, 0), any)?.id, "squarely on the card").toBe("card");
    // The card's bottom edge is at 1.4 and the tab forgives down to 1.375, so this point is inside
    // BOTH — which is the only kind of point that can tell "never steals" from "was never asked".
    expect(pick(h, desk, glass(0, 1.39), any)?.id, "inside both: the drawn one wins").toBe("card");

    // ...AND A NODE THAT FORGIVES NOTHING IS HIT EXACTLY AS IT IS DRAWN, which is every other node
    // in the kit and the desk this page was before the atom existed.
    const strict = node("desk2", Container({ layout: "free" }));
    add(strict, node("tab", box(1, 0.25), Surfaced(), Transformable({ at: { x: 0, y: 2 } })));
    expect(pick(h, strict, glass(0, 2), any)?.id, "dead centre still").toBe("tab");
    expect(pick(h, strict, glass(0, 2.4), any), "and a miss is a miss").toBeUndefined();
  });

});
