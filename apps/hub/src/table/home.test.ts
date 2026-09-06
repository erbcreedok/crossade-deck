// THE OPENING SNAP — a desk opens looking at its own place from frame one, not partway through a
// glide (see `snapHome` in `index.ts`). Checked against the kit's own `isHome` (`presence.ts`),
// which is what `avatars.publish()` reads to decide whether a reader's ring is filled or a disc is
// drawn — the very thing a mid-glide camera failed.

import { describe, it, expect } from "vitest";
import { Camera, isHome, type SeatPlace } from "game-kit";
import { snapHome } from "./index.js";

const PLACE: SeatPlace = { at: { x: 3, y: -2 }, facing: 90 };

function openCamera(): Camera {
  const camera = new Camera({ minZoom: 0.5, maxZoom: 2.5 });
  camera.setScreen(400, 800);
  camera.setContent({ x: -20, y: -20, w: 40, h: 40 }, 40);
  return camera;
}

describe("snapHome: the desk opens at its own place, instantly", () => {
  it("moves the camera straight to the place — no glide left to finish", () => {
    const camera = openCamera();
    camera.lookAt({ x: 0, y: 0 });
    camera.turnTo(0);

    snapHome(camera, PLACE, 1.4);

    expect(camera.target).toEqual(PLACE.at);
    expect(camera.rotation).toBe(PLACE.facing);
    expect(camera.zoom).toBe(1.4);
  });

  it("leaves a view isHome() already reads as home, before any publish", () => {
    const camera = openCamera();
    camera.lookAt({ x: 10, y: 10 });

    snapHome(camera, PLACE, 1.4);

    const view = { target: camera.target, zoom: camera.pixelsPerUnit, rotation: camera.rotation, glass: { w: 400, h: 800 } };
    expect(isHome(view, PLACE)).toBe(true);
  });

  it("still lands on the place when opening at the whole-room fit — `lookAt` centres a box smaller than the glass instead of pinning it, so zooming in AFTER looking would have thrown the place away", () => {
    const camera = openCamera();
    camera.setZoom(camera.fitZoom());
    camera.lookAt({ x: 0, y: 0 });

    snapHome(camera, PLACE, 1.4);

    expect(camera.target).toEqual(PLACE.at);
  });
});
