import { describe, expect, it } from "vitest";
import { idleReturn } from "./idleReturn.js";
import { Camera } from "./camera/index.js";
import { type Presence } from "./presence.js";

describe("idleReturn", () => {
  it("idleReturn.glides-camera-to-seat-place", () => {
    const cam = new Camera({ minZoom: 0.25, maxZoom: 4 });
    cam.setScreen(1000, 1000);
    cam.setContent({ x: -1000, y: -1000, w: 2000, h: 2000 }, 1);
    // Move away
    cam.lookAt({ x: 50, y: 50 });
    cam.setZoom(2);
    cam.turnTo(90);
    
    let p: Presence | undefined = {
      seat: "white",
      place: { at: { x: 0, y: 0 }, facing: 0 },
      name: "Player",
      ink: "white",
      state: "online",
      holding: false,
      view: { target: { x: 0, y: 0 }, zoom: 1, rotation: 0, glass: { w: 1000, h: 1000 } },
      pin: { mode: "screen", at: { x: 0, y: 0 } }
    };
    
    let pinned: any;
    
    const tracker = idleReturn(cam, () => p, { 
      afterMs: 6000, 
      glideMs: 600, 
      setPin: (pin) => pinned = pin 
    });
    
    expect(cam.target.x).toBe(50);
    
    tracker.step(5000);
    expect(cam.target.x).toBe(50);
    
    tracker.step(1100); 
    tracker.step(300);
    
    expect(cam.target.x).toBeLessThan(50);
    expect(cam.target.x).toBeGreaterThan(0);
    
    tracker.step(350);
    expect(cam.target.x).toBeCloseTo(0);
    expect(cam.target.y).toBeCloseTo(0);
    expect(cam.rotation).toBeCloseTo(0);
    
    expect(pinned).toEqual({ mode: "desk", at: { x: 0, y: 0 }, leash: "chase" });
  });

  it("idleReturn.resets-timer", () => {
    const cam = new Camera({ minZoom: 0.25, maxZoom: 4 });
    cam.setScreen(1000, 1000);
    cam.setContent({ x: -1000, y: -1000, w: 2000, h: 2000 }, 1);
    cam.lookAt({ x: 50, y: 50 });
    
    let p: Presence = {
      seat: "white",
      place: { at: { x: 0, y: 0 }, facing: 0 },
      name: "Player",
      ink: "white",
      state: "online",
      holding: false,
      view: { target: { x: 0, y: 0 }, zoom: 1, rotation: 0, glass: { w: 1000, h: 1000 } },
      pin: { mode: "screen", at: { x: 0, y: 0 } }
    };
    
    const tracker = idleReturn(cam, () => p, { afterMs: 6000, glideMs: 600 });
    
    tracker.step(5000);
    tracker.input();
    tracker.step(2000); 
    
    expect(cam.target.x).toBe(50);
  });

  it("idleReturn.returns-to-the-place-as-it-stands-now — a chair that moved moves the way home", () => {
    // A PLACE IS DRAGGABLE (`seatChair`), so "home" is a question asked every step and never a
    // number remembered at build time: a view that glided back to where the chair OPENED would
    // set its owner down on felt they had got up from.
    const cam = new Camera({ minZoom: 0.25, maxZoom: 4 });
    cam.setScreen(1000, 1000);
    cam.setContent({ x: -1000, y: -1000, w: 2000, h: 2000 }, 1);
    cam.lookAt({ x: 50, y: 50 });
    let place = { at: { x: 0, y: 0 }, facing: 0 };
    let landed: unknown;
    const tracker = idleReturn(
      cam,
      (): Presence => ({
        seat: "white",
        place,
        name: "Player",
        ink: "white",
        state: "online",
        holding: false,
        view: { target: { x: 0, y: 0 }, zoom: 1, rotation: 0, glass: { w: 1000, h: 1000 } },
        pin: { mode: "screen", at: { x: 0.5, y: 0.5 } },
      }),
      { afterMs: 6000, glideMs: 600, setPin: (pin) => (landed = pin) },
    );
    // The chair is dragged BEFORE the countdown runs out — which is the whole of the case.
    place = { at: { x: 20, y: -10 }, facing: 0 };
    tracker.step(6100);
    // A fifth of the way in, and headed for the NEW place: aimed at the old one the same fraction
    // of the same journey would have left the eye nearer the middle of the desk than this.
    const toOld = 50 + (0 - 50) * (1 - Math.pow(1 - 100 / 600, 3));
    expect(cam.target.x).toBeGreaterThan(toOld + 1);
    tracker.step(700);
    // ...and the spot it finally sits down on is the place as it stands NOW.
    expect(landed).toEqual({ mode: "desk", at: { x: 20, y: -10 }, leash: "chase" });
  });
});
