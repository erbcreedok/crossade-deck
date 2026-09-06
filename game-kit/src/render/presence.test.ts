// @vitest-environment jsdom

// PRESENCE — the things a shared desk gets wrong when nobody holds them down.
//
// Where somebody else's picture stands is arithmetic on THEIR view, so it is checkable without a
// glass, without a socket and without a second tab — which is the whole reason the message carries a
// view rather than a screen position: a position would be true on one screen and nowhere else.

import { describe, expect, it } from "vitest";
import { Camera } from "./camera/index.js";
import {
  AVATAR_LAYER,
  avatarAt,
  avatarId,
  placeAvatars,
  watchPresence,
  type Presence,
  type PresenceDoc,
} from "./presence.js";
import { add, byId, caps, fieldsOf, node, type Node } from "../core/node.js";
import { Acceptor } from "../core/atoms/acceptor.js";
import { Bounded } from "../core/atoms/bounded.js";
import { Container, registerLayout } from "../core/atoms/container.js";
import { rect } from "../presets/shapes.js";
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
    ...over,
  };
}

describe("presence", () => {
  it("presence.a-far-avatar-stands-in-the-middle-of-their-own-view — the disc IS where they look", () => {
    // A PERSON IS WHERE THEY ARE LOOKING, and the felt under the middle of their glass is the whole
    // of that sentence. Panned, the disc goes exactly as far as the view went — anything else would
    // be a second place for the same person, and the desk would have to say which of the two is
    // them.
    const still = avatarAt(person("south"));
    expect(still).toEqual({ x: 0, y: 0 });

    const panned = person("south", { view: { target: { x: 3, y: -1.5 }, zoom: 50, rotation: 0, glass: GLASS } });
    expect(avatarAt(panned)).toEqual({ x: 3, y: -1.5 });

    // A TURN MOVES NOBODY. Their head is tipped, their seat is not: the disc is drawn the reader's
    // way up (`Oriented: "viewer"`) and stands on the same felt.
    const turned = person("north", { view: { target: { x: 3, y: -1.5 }, zoom: 50, rotation: 180, glass: GLASS } });
    expect(avatarAt(turned)).toEqual({ x: 3, y: -1.5 });

    // ...and a zoom is not a move either — a reader who leaned in did not get up.
    const near = person("north", { view: { target: { x: 3, y: -1.5 }, zoom: 200, rotation: 0, glass: GLASS } });
    expect(avatarAt(near)).toEqual({ x: 3, y: -1.5 });
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
    const layer = (): Node => byId(desk, AVATAR_LAYER)!;
    placeAvatars(desk, [person("south"), person("north")]);
    expect(layer().children.length).toBe(2);

    // Fed again, the same two people are still two people — not four.
    placeAvatars(desk, [person("south"), person("north")]);
    expect(layer().children.length).toBe(2);

    placeAvatars(desk, [person("south")]);
    expect(layer().children.map((n) => n.id)).toEqual([avatarId("south")]);
  });

  it("presence.a-disc-is-not-a-piece — the people stand in a layer of the desk, never in its own list", () => {
    // WHERE A DISC IS PUT decides what the rest of the desk thinks it is. Among the desk's own
    // children it is a piece to everything that reads them — a container arranges it like a card,
    // a square's `Displacer` sends whoever stands there away, an `Acceptor` counts it as what is
    // now in the place — and on a board that reads as an avatar standing on a square instead of a
    // man. So the disc goes in a layer that holds nothing else, and that layer holds no `Container`
    // and no `Acceptor` at all.
    registerLayout("presence.grid", freeLayout);
    const desk = node("desk", Container({ layout: "presence.grid" }), Acceptor({}));
    const piece = node("man", Bounded({ bounds: rect(1, 1) }));
    add(desk, piece);
    placeAvatars(desk, [person("south"), person("north")]);

    // The desk's own list is what it was, plus ONE node that is not a person.
    expect(desk.children.map((n) => n.id)).toEqual(["man", AVATAR_LAYER]);
    const layer = byId(desk, AVATAR_LAYER)!;
    for (const atom of ["Container", "Acceptor", "Displacer", "Grabber", "Keeper"]) {
      expect(caps(layer).has(atom), `the layer has no ${atom}`).toBe(false);
    }
    // ...and it is the LAST child, so the discs are painted over everything: equals in the plan are
    // ranked by document order, and a desk grows furniture after the people arrived.
    add(desk, node("late furniture"));
    placeAvatars(desk, [person("south"), person("north")]);
    expect(desk.children[desk.children.length - 1]!.id).toBe(AVATAR_LAYER);
    expect(byId(desk, avatarId("south"))!.parent!.id).toBe(AVATAR_LAYER);
  });


  it("presence.no-finger-reaches-the-disc — a drag on an avatar carries nothing and moves nothing", () => {
    // AN AVATAR IS A READING, not a thing. It says where its owner is looking, and a finger that
    // could move it would be a finger moving a measurement — the far screen would then be told
    // this person is sitting somewhere their camera says they are not.
    //
    // WHAT A PERSON MOVES INSTEAD is their PLACE (`seatChair`), which is a thing on the felt and
    // carries the hand with it. Checked at two zooms, because a picture that refuses the finger at
    // one zoom and follows it at another is the same fault wearing a different number.
    for (const zoom of [0.5, 2]) {
      const hand = avatarHand(zoom);
      const before = hand.at();
      hand.down(200, 150);
      for (let i = 1; i <= 12; i++) hand.move(200 + i * 10, 150);
      expect(hand.carried, `zoom ${zoom}: a drag on a disc reports no carry`).toBeUndefined();
      hand.up(320, 150);
      expect(hand.at(), `zoom ${zoom}: the disc did not move`).toEqual(before);
    }
  });

  it("presence.no-avatar-can-be-picked-up — one's own is no more a thing to move than anybody else's", () => {
    const desk = node("desk", Container({}));
    placeAvatars(desk, [person("south"), person("north")]);
    for (const seat of ["south", "north"]) {
      expect(caps(byId(desk, avatarId(seat))!).has("Draggable"), seat).toBe(false);
    }
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
    person("south", { view: { target: { x: 0, y: 0 }, zoom: camera.pixelsPerUnit, rotation: 0, glass: GLASS } });

  const div = document.createElement("div");
  const box = { left: 0, top: 0, width: GLASS.w, height: GLASS.h, x: 0, y: 0, toJSON: () => {} };
  Object.defineProperty(div, "getBoundingClientRect", { value: () => box });
  document.body.appendChild(div);

  const camera = new Camera({ minZoom: 0.2, maxZoom: 4 });
  camera.setScreen(GLASS.w, GLASS.h);
  camera.setContent({ x: -50, y: -50, w: 100, h: 100 }, 50);
  camera.setZoom(zoom);
  camera.lookAt({ x: 0, y: 0 });

  placeAvatars(desk, [who()]);
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
