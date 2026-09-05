// @vitest-environment jsdom

// PRESENCE — the four things a shared desk gets wrong when nobody holds them down.
//
// Where somebody else's picture stands is arithmetic on THEIR view, so it is checkable without a
// glass, without a socket and without a second tab — which is the whole reason the message carries a
// view rather than a screen position: a position would be true on one screen and nowhere else.

import { describe, expect, it } from "vitest";
import { Camera } from "./camera/index.js";
import {
  avatarAt,
  avatarId,
  deskPoint,
  leash,
  placeAvatars,
  presenceTransform,
  repin,
  watchPresence,
  type Presence,
  type PresenceDoc,
} from "./presence.js";
import { byId, caps, fieldsOf, node } from "../core/node.js";
import { Container, registerLayout } from "../core/atoms/container.js";
import { Grabber } from "../core/atoms/grab.js";
import { freeLayout } from "../core/atoms/layouts.js";
import { type TransformableFields } from "../core/atoms/transformable.js";
import { apply, type Vec } from "../core/transform.js";
import { attachMotion } from "./animator/index.js";
import { mount } from "./host.js";
import { wireDrag } from "./drag.js";
import { type Painter } from "./painter.js";

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


  it("presence.a-dragged-avatar-lands-where-the-finger-left-it — the pin is written in its own units", () => {
    // THE PROPERTY THE WHOLE DRAG STANDS ON: put the picture down at a desk point, and the pin that
    // comes back puts it at that very point again. Checked at two zooms, because that is where the
    // bug lived — a screen pin is FRACTIONS OF THE GLASS and a carry speaks the desk's units, so a
    // point written in raw was read back multiplied by the whole width of the screen.
    for (const zoom of [0.5, 2]) {
      const view = { target: { x: 0, y: 0 }, zoom, rotation: 0, glass: GLASS };
      for (const pin of [
        { mode: "screen", at: { x: 0.5, y: 0.5 } } as const,
        { mode: "desk", at: { x: 0, y: 0 }, leash: "lock" } as const,
      ]) {
        const who = person("south", { view, pin });
        const was = apply(presenceTransform(view), avatarAt(who));
        // A HUNDRED AND TWENTY PIXELS OF FINGER, which is what a hand does — not units, which is
        // what nobody's hand does.
        const wanted = deskPoint(view, { x: was.x + 120, y: was.y });
        const moved = { ...who, pin: repin(who, wanted) };
        expect(avatarAt(moved).x).toBeCloseTo(wanted.x, 6);
        expect(avatarAt(moved).y).toBeCloseTo(wanted.y, 6);
        const now = apply(presenceTransform(view), avatarAt(moved));
        expect(now.x - was.x, `${pin.mode} at zoom ${zoom}`).toBeCloseTo(120, 6);
        expect(now.y - was.y).toBeCloseTo(0, 6);
      }
    }
    // ...and a desk pin keeps the leash it was standing on: a hand said WHERE, not what happens
    // when the view walks off it.
    const desked = person("south", { pin: { mode: "desk", at: { x: 0, y: 0 }, leash: "chase" } });
    expect(repin(desked, { x: 1, y: 2 })).toEqual({ mode: "desk", at: { x: 1, y: 2 }, leash: "chase" });
  });

  it("presence.ones-own-avatar-follows-the-finger-one-to-one — and a tap does not move it", () => {
    for (const zoom of [0.5, 2]) {
      const hand = avatarHand(zoom);
      const before = hand.at();

      hand.down(200, 150);
      for (let i = 1; i <= 12; i++) hand.move(200 + i * 10, 150);
      const carried = hand.carried!;
      // ON THE GLASS, which is where the finger is: 120 pixels of hand, 120 pixels of picture, at
      // either end of the zoom. In units that is a different number each time, and that difference
      // is exactly what a desk gets wrong when it moves a picture by the finger's units.
      const went = apply(hand.view(), carried);
      const from = apply(hand.view(), before);
      expect(went.x - from.x, `zoom ${zoom}`).toBeCloseTo(120, 3);
      expect(went.y - from.y).toBeCloseTo(0, 3);
      // ...AND THE PIN IS UPDATED, so the far screen reads the same place off the message alone.
      const pin = repin(hand.who(), carried);
      expect(avatarAt({ ...hand.who(), pin }).x).toBeCloseTo(carried.x, 6);
      hand.up(320, 150);

      // A TAP IS NOT A CARRY. The finger landed on the picture and left again without going
      // anywhere, so nothing was moved and nothing was reported to move. Its own hand, because a
      // tap is a gesture that starts on an avatar standing still — this one has just been dragged.
      const tap = avatarHand(zoom);
      const stood = tap.at();
      tap.down(200, 150);
      tap.up(200, 150, 40);
      expect(tap.carried, "a tap reports no carry").toBeUndefined();
      expect(tap.at()).toEqual(stood);
    }
  });

  it("presence.only-ones-own-avatar-can-be-picked-up — somebody else's picture is not a thing to move", () => {
    const desk = node("desk", Container({}));
    placeAvatars(desk, [person("south"), person("north")], "south");
    expect(caps(byId(desk, avatarId("south"))!).has("Draggable")).toBe(true);
    expect(caps(byId(desk, avatarId("north"))!).has("Draggable")).toBe(false);
  });
});

function stubPainter(): Painter {
  return { ready: Promise.resolve(), draw: () => {}, resize: () => {}, destroy: () => {} };
}

const finger = (type: string, x: number, y: number, ms: number): MouseEvent => {
  const e = Object.assign(new MouseEvent(type, { clientX: x, clientY: y }), { pointerId: 1 });
  Object.defineProperty(e, "timeStamp", { value: ms, configurable: true });
  return e;
};

/**
 * ONE'S OWN AVATAR ON A REAL DESK, under a real finger — the wiring, the clock and the camera, so
 * what is measured is the gesture rather than the arithmetic under it.
 *
 * The camera is handed in at a zoom, because a picture that follows the hand at one zoom and runs
 * away at another is the whole of the fault this exists for.
 */
function avatarHand(zoom: number) {
  registerLayout("presence.free", freeLayout);
  const desk = node("desk", Container({ layout: "presence.free" }), Grabber());
  const who = (): Presence =>
    person("south", { view: { target: { x: 0, y: 0 }, zoom: camera.pixelsPerUnit, rotation: 0, glass: GLASS }, pin: { mode: "screen", at: { x: 0.5, y: 0.5 } } });

  const div = document.createElement("div");
  const box = { left: 0, top: 0, width: GLASS.w, height: GLASS.h, x: 0, y: 0, toJSON: () => {} };
  Object.defineProperty(div, "getBoundingClientRect", { value: () => box });
  document.body.appendChild(div);

  const camera = new Camera({ minZoom: 0.2, maxZoom: 4 });
  camera.setScreen(GLASS.w, GLASS.h);
  camera.setContent({ x: -50, y: -50, w: 100, h: 100 }, 50);
  camera.setZoom(zoom);
  camera.lookAt({ x: 0, y: 0 });

  placeAvatars(desk, [who()], "south");
  const host = mount(div, desk, { hudUnit: 64, theme: "dark" });
  Object.defineProperty(host.view, "getBoundingClientRect", { value: () => box });
  const motions = attachMotion(host, stubPainter());

  const state: { carried: Vec | undefined } = { carried: undefined };
  wireDrag(
    { host, motions, el: host.view },
    {
      view: () => camera.transform(),
      onCarry: ({ at, done }) => {
        if (!done) state.carried = at;
      },
    },
  );
  let ms = 0;
  const fire = (type: string, x: number, y: number, step = 16): void => {
    ms += step;
    host.view.dispatchEvent(finger(type, x, y, ms));
  };
  return {
    get carried(): Vec | undefined {
      return state.carried;
    },
    set carried(v: Vec | undefined) {
      state.carried = v;
    },
    who,
    view: () => camera.transform(),
    at: (): Vec => fieldsOf<TransformableFields>(byId(desk, avatarId("south"))!, "Transformable")!.at,
    down: (x: number, y: number) => fire("pointerdown", x, y),
    move: (x: number, y: number) => fire("pointermove", x, y),
    up: (x: number, y: number, step = 16) => fire("pointerup", x, y, step),
  };
}
