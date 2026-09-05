// PRESENCE — the four things a shared desk gets wrong when nobody holds them down.
//
// Where somebody else's picture stands is arithmetic on THEIR view, so it is checkable without a
// glass, without a socket and without a second tab — which is the whole reason the message carries a
// view rather than a screen position: a position would be true on one screen and nowhere else.

import { describe, expect, it } from "vitest";
import { Camera } from "./camera/index.js";
import { avatarAt, avatarId, leash, placeAvatars, watchPresence, type Presence, type PresenceDoc } from "./presence.js";
import { byId, caps, node } from "../core/node.js";
import { Container } from "../core/atoms/container.js";

const GLASS = { w: 400, h: 300 };

function person(seat: string, over: Partial<Presence> = {}): Presence {
  return {
    seat,
    name: "Ann Lee",
    ink: "accent",
    state: "online",
    holding: false,
    view: { target: { x: 0, y: 0 }, zoom: 50, rotation: 0, glass: GLASS },
    pin: { mode: "screen", at: { x: 0.1, y: 0.9 } },
    ...over,
  };
}

describe("presence", () => {
  it("presence.a-far-avatar-stands-where-their-own-camera-put-it — a turned view puts them the other way about", () => {
    // The bottom-left corner of a view is the bottom-left corner of THAT view. Turned 180°, their
    // own lower left is up and to the right of the desk's middle — and a screen that read the pin
    // against its own axes instead of theirs would seat them across the desk from where they are.
    const square = avatarAt(person("south"));
    expect(square.x).toBeLessThan(0);
    expect(square.y).toBeGreaterThan(0);

    const turned = avatarAt(person("north", { view: { ...person("north").view, rotation: 180 } }));
    expect(turned.x).toBeGreaterThan(0);
    expect(turned.y).toBeLessThan(0);
    // The same distance from the middle, only the other way round: a turn moves nobody on the desk.
    expect(Math.hypot(turned.x, turned.y)).toBeCloseTo(Math.hypot(square.x, square.y), 6);
  });

  it("presence.a-lock-will-not-let-the-view-leave-its-own-avatar — the camera gives, not the picture", () => {
    const camera = new Camera({ minZoom: 0.2, maxZoom: 4 });
    camera.setScreen(GLASS.w, GLASS.h);
    camera.setContent({ x: -50, y: -50, w: 100, h: 100 }, 50);
    const spot = { x: 0, y: 0 };
    camera.lookAt({ x: 8, y: 0 });
    const drawn = leash(camera, spot, "lock");
    // The picture did not move — a desk pin means a spot on the felt, and a lock is about the VIEW.
    expect(drawn).toEqual(spot);
    const onGlass = { x: camera.transform().e, y: camera.transform().f };
    expect(onGlass.x).toBeGreaterThan(0);
    expect(onGlass.x).toBeLessThanOrEqual(GLASS.w);
  });

  it("presence.a-chase-presses-the-avatar-against-the-edge-it-left-by — and along it, not into a corner", () => {
    // Panned far to the right, the spot goes off the LEFT of the glass, so the picture is pressed
    // against the left border — and stays at the height it had, because only one axis was left by.
    const far = person("south", {
      view: { target: { x: 20, y: 0 }, zoom: 50, rotation: 0, glass: GLASS },
      pin: { mode: "desk", at: { x: 0, y: 0.4 }, leash: "chase" },
    });
    const chased = avatarAt(far);
    expect(chased.x).toBeGreaterThan(0);
    expect(chased.y).toBeCloseTo(0.4, 6);

    // ...and a spot that is on the glass is not touched at all.
    const near = person("south", {
      view: { target: { x: 0, y: 0 }, zoom: 50, rotation: 0, glass: GLASS },
      pin: { mode: "desk", at: { x: 0.4, y: 0.4 }, leash: "chase" },
    });
    expect(avatarAt(near)).toEqual({ x: 0.4, y: 0.4 });
  });

  it("presence.a-hidden-tab-is-away-and-not-gone — the socket is up and the moves still arrive", () => {
    const listeners = new Map<string, Set<() => void>>();
    let hidden = false;
    const doc: PresenceDoc = {
      get hidden() {
        return hidden;
      },
      addEventListener: (type, fn) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
      },
      removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
    };
    const seen: string[] = [];
    const stop = watchPresence(doc, (s) => seen.push(s));
    const fire = (type: string): void => listeners.get(type)?.forEach((fn) => fn());

    hidden = true;
    fire("visibilitychange");
    hidden = false;
    fire("visibilitychange");
    fire("pagehide");
    expect(seen).toEqual(["away", "online", "left"]);

    stop();
    hidden = true;
    fire("visibilitychange");
    expect(seen).toEqual(["away", "online", "left"]);
  });

  it("presence.the-desk-keeps-one-person-per-seat — and drops whoever left the table", () => {
    const desk = node("desk", Container({}));
    placeAvatars(desk, [person("south"), person("north")], "south");
    expect(desk.children.length).toBe(2);

    // Fed again, the same two people are still two people — not four.
    placeAvatars(desk, [person("south"), person("north")], "south");
    expect(desk.children.length).toBe(2);

    placeAvatars(desk, [person("south")], "south");
    expect(desk.children.map((n) => n.id)).toEqual([avatarId("south")]);
  });

  it("presence.only-ones-own-avatar-can-be-picked-up — somebody else's picture is not a thing to move", () => {
    const desk = node("desk", Container({}));
    placeAvatars(desk, [person("south"), person("north")], "south");
    expect(caps(byId(desk, avatarId("south"))!).has("Draggable")).toBe(true);
    expect(caps(byId(desk, avatarId("north"))!).has("Draggable")).toBe(false);
  });
});
