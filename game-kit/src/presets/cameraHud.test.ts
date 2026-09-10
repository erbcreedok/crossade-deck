// @vitest-environment jsdom

// THE LAWS THIS FILE EXISTS FOR: a control that has nowhere to send a reader is NOT DRAWN, the pair
// finds the low corner of whatever glass it is on, and a press reaches the function that was handed
// in — never the other one's.
//
// None of it is checkable by eye at the moment it breaks. A corner worked out once and remembered
// looks right until a phone is turned; a wiring that answers for a meaning it does not own calls the
// wrong function on somebody else's button, which reads as "the desk jumped for no reason".

import { describe, expect, it } from "vitest";
import { Container, registerLayout, resetLayouts } from "../core/atoms/container.js";
import { freeLayout } from "../core/atoms/layouts.js";
import { byId, caps, fieldsOf, node, walk, type Node } from "../core/node.js";
import { type SurfacedFields } from "../core/atoms/surfaced.js";
import { type TransformableFields } from "../core/atoms/transformable.js";
import { installStockControls } from "./controls.js";
import { installStockSurfaces } from "./surfaces.js";
import { resetAssets } from "../render/assets.js";
import { CAMERA_HUD_HOME, CAMERA_HUD_NORTH, CAMERA_HUD_TILT, cameraHud } from "./cameraHud.js";
import { mount } from "../render/host.js";
import { pickTop } from "../render/pointer.js";
import { resetSurfaces } from "../render/surfaces.js";

/** A toggle the tests drive by hand — no camera in this file, just the boolean `tilted` reads. */
function tiltStub(start = false) {
  let on = start;
  return { tilt: () => (on = !on), tilted: () => on };
}

/** The registered surface an icon child currently wears, e.g. `control/icon/hud.tilt`. */
function iconSurfaceOf(host: ReturnType<typeof bench>["host"], id: string): string | undefined {
  const icon = byId(host.hudRoot!, `${id}/icon`);
  return icon && fieldsOf<SurfacedFields>(icon, "Surfaced")?.surface;
}

function bench() {
  resetLayouts();
  registerLayout("free", freeLayout);
  resetSurfaces();
  resetAssets();
  installStockSurfaces();
  installStockControls();

  // A REAL-SIZED PIECE OF GLASS, and a resize observer to change it with. jsdom lays nothing out, so
  // a bare div measures 1×1 — and a corner found on one pixel is the middle of the screen.
  let observed: (() => void) | undefined;
  (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    constructor(cb: () => void) {
      observed = cb;
    }
    observe(): void {}
    disconnect(): void {}
  };
  const container = document.createElement("div");
  const box = (w: number, h: number) => {
    container.getBoundingClientRect = () =>
      ({ width: w, height: h, x: 0, y: 0, top: 0, left: 0, right: w, bottom: h, toJSON: () => "" }) as DOMRect;
  };
  box(393, 800);
  const host = mount(container, node("desk", Container({ layout: "free" })));
  // The glass the pointer is measured against is the CANVAS, and jsdom gives it none of its own.
  host.view.getBoundingClientRect = () =>
    ({ width: 393, height: 800, x: 0, y: 0, top: 0, left: 0, right: 393, bottom: 800, toJSON: () => "" }) as DOMRect;
  return {
    host,
    resize: (w: number, h: number) => {
      box(w, h);
      observed?.();
    },
    ids: (root: Node) => {
      const seen: string[] = [];
      walk(root, (n) => seen.push(n.id));
      return seen;
    },
  };
}

/** Where a control sits on the glass, in pixels from its top-left — what a finger has to find. */
function glassSeat(host: ReturnType<typeof bench>["host"], id: string): { x: number; y: number } {
  const n = byId(host.hudRoot!, id)!;
  const at = fieldsOf<TransformableFields>(n, "Transformable")!.at!;
  const v = host.viewport();
  const u = host.unit();
  return { x: v.width / 2 + at.x * u, y: v.height / 2 + at.y * u };
}

describe("the camera's own two controls", () => {
  it("hudCamera.a-desk-with-no-place-shows-no-place-button", () => {
    // Absence IS the refusal (CANONS §1). A desk that seats nobody has nowhere to send a reader, and
    // a control that said so on being pressed would be a control that lied about existing.
    const b = bench();
    const bare = cameraHud(b.host, { north: () => {}, ...tiltStub() });
    expect(b.ids(bare.root)).toContain(CAMERA_HUD_NORTH);
    expect(b.ids(bare.root)).not.toContain(CAMERA_HUD_HOME);
    bare.stop();

    const seated = cameraHud(b.host, { north: () => {}, home: () => {}, ...tiltStub() });
    expect(b.ids(seated.root)).toContain(CAMERA_HUD_HOME);
    expect(b.ids(seated.root)).toContain(CAMERA_HUD_NORTH);
    seated.stop();
  });

  it("hudCamera.the-pair-stands-in-the-low-corner", () => {
    const b = bench();
    const hud = cameraHud(b.host, { north: () => {}, home: () => {}, ...tiltStub() });
    const v = b.host.viewport();
    const north = glassSeat(b.host, CAMERA_HUD_NORTH);
    const home = glassSeat(b.host, CAMERA_HUD_HOME);
    const tilt = glassSeat(b.host, CAMERA_HUD_TILT);
    // Low and to the right, and inside the glass on both counts.
    expect(north.x).toBeGreaterThan(v.width * 0.6);
    expect(north.x).toBeLessThan(v.width);
    expect(north.y).toBeGreaterThan(v.height * 0.6);
    expect(north.y).toBeLessThan(v.height);
    // A COLUMN, and the one asked for most often is the lower: home stands OVER north, same line.
    expect(home.x).toBeCloseTo(north.x, 6);
    expect(home.y).toBeLessThan(north.y);
    // ...AND TILT TAKES THE TOP: same line, above home.
    expect(tilt.x).toBeCloseTo(north.x, 6);
    expect(tilt.y).toBeLessThan(home.y);
    hud.stop();
  });

  it("hudCamera.a-turned-phone-is-a-different-corner", () => {
    // The corner is re-read and never remembered: worked out once, the pair would sit in the middle
    // of a screen the reader has just turned on its side.
    const b = bench();
    const hud = cameraHud(b.host, { north: () => {}, ...tiltStub() });
    const upright = glassSeat(b.host, CAMERA_HUD_NORTH);
    b.resize(800, 393);
    const sideways = glassSeat(b.host, CAMERA_HUD_NORTH);
    expect(sideways.x).toBeGreaterThan(upright.x);
    expect(sideways.y).toBeLessThan(upright.y);
    expect(sideways.x).toBeLessThan(800);
    expect(sideways.y).toBeLessThan(393);
    hud.stop();
  });

  it("hudCamera.the-column-stands-clear-of-what-is-already-at-the-foot", () => {
    // A HAND ON THE GLASS TAKES THE FOOT OF IT (`handHud`), and a pair of controls laid over that is
    // two things in one place: the cards under a button nobody can reach past. So the pair is told
    // how many pixels of the bottom are already spoken for and stands above them — asked FRESH, like
    // the corner itself, because a hand grows and shrinks with what is dealt into it.
    const b = bench();
    let taken = 0;
    const hud = cameraHud(b.host, { north: () => {}, home: () => {}, floor: () => taken, ...tiltStub() });
    const low = glassSeat(b.host, CAMERA_HUD_NORTH).y;
    taken = 200;
    hud.fit(); // the glass has not changed; what stands at its foot has, and it says so
    const lifted = glassSeat(b.host, CAMERA_HUD_NORTH).y;
    expect(lifted).toBeCloseTo(low - 200, 6);
    // ...AND THE COLUMN KEEPS ITS ORDER: home still stands over north.
    expect(glassSeat(b.host, CAMERA_HUD_HOME).y).toBeLessThan(lifted);
    hud.stop();
  });

  it("hudCamera.a-press-reaches-its-own-function-and-no-other", () => {
    const b = bench();
    const said: string[] = [];
    const hud = cameraHud(b.host, {
      north: () => said.push("north"),
      home: () => said.push("home"),
      tilt: () => said.push("tilt"),
      tilted: () => false,
    });
    const press = (id: string): void => {
      const seat = glassSeat(b.host, id);
      // jsdom knows no `PointerEvent`; the wiring reads three fields off one, so three is what it
      // is given — the same shape `gestures.test.ts` fires.
      const e = (type: string): Event => {
        const ev = new Event(type, { bubbles: true });
        Object.assign(ev, { clientX: seat.x, clientY: seat.y, pointerId: 1 });
        return ev;
      };
      b.host.view.dispatchEvent(e("pointerdown"));
      b.host.view.dispatchEvent(e("pointerup"));
    };
    press(CAMERA_HUD_NORTH);
    expect(said).toEqual(["north"]);
    press(CAMERA_HUD_HOME);
    expect(said).toEqual(["north", "home"]);
    press(CAMERA_HUD_TILT);
    expect(said).toEqual(["north", "home", "tilt"]);
    hud.stop();
  });

  it("hudCamera.the-felt-between-them-is-still-the-desk-s", () => {
    // The pair is over the felt and takes only what it covers: a gesture that landed anywhere else
    // must reach the desk, or two buttons would have cost the reader their whole screen.
    const b = bench();
    const hud = cameraHud(b.host, { north: () => {}, home: () => {}, ...tiltStub() });
    const north = glassSeat(b.host, CAMERA_HUD_NORTH);
    const answers = (n: Node): boolean => caps(n).has("Pressable"); // what the press wiring asks
    expect(pickTop(b.host, north, answers)?.id).toBe(CAMERA_HUD_NORTH);
    expect(pickTop(b.host, { x: 40, y: 60 }, answers)).toBeUndefined();
    hud.stop();
  });

  it("hudCamera.taking-them-down-puts-back-what-was-there", () => {
    const b = bench();
    const before = node("other", Container({ layout: "free" }));
    b.host.setHudRoot(before);
    const hud = cameraHud(b.host, { north: () => {}, ...tiltStub() });
    expect(b.host.hudRoot).toBe(hud.root);
    hud.stop();
    expect(b.host.hudRoot).toBe(before);
  });

  it("hudCamera.the-tilt-glyph-shows-what-the-press-will-do", () => {
    // FLAT NOW → the glyph is the leaned disk, the picture of where a press LANDS. LEANED NOW → the
    // glyph is the flat one. Neither coat nor highlight changes — only the icon (per the owner's
    // ask), so this test reads the icon's own registered surface and nothing else about the node.
    const b = bench();
    const stub = tiltStub(false);
    const hud = cameraHud(b.host, { north: () => {}, tilt: stub.tilt, tilted: stub.tilted });
    expect(iconSurfaceOf(b.host, CAMERA_HUD_TILT)).toBe("control/icon/hud.tilt");

    // A PRESS FLIPS IT IN THE SAME TICK — `tiltTo` is instant, so the glyph does not wait for a
    // resize or an explicit `fit()` to catch up with the press that caused it.
    const seat = glassSeat(b.host, CAMERA_HUD_TILT);
    const e = (type: string): Event => {
      const ev = new Event(type, { bubbles: true });
      Object.assign(ev, { clientX: seat.x, clientY: seat.y, pointerId: 1 });
      return ev;
    };
    b.host.view.dispatchEvent(e("pointerdown"));
    b.host.view.dispatchEvent(e("pointerup"));
    expect(iconSurfaceOf(b.host, CAMERA_HUD_TILT)).toBe("control/icon/hud.flat");

    // ...AND A GESTURE THAT LEANED THE TABLE WITHOUT TOUCHING THIS BUTTON is caught on the next
    // `fit()`, the same bargain `floor` already keeps: `tilted` is asked fresh, never remembered.
    stub.tilt(); // back to flat, from outside the button
    expect(iconSurfaceOf(b.host, CAMERA_HUD_TILT)).toBe("control/icon/hud.flat"); // not yet re-read
    hud.fit();
    expect(iconSurfaceOf(b.host, CAMERA_HUD_TILT)).toBe("control/icon/hud.tilt");
    hud.stop();
  });
});
