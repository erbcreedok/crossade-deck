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
  avatarConeId,
  avatarNameId,
  avatarNode,
  avatarId,
  HOME_ANCHOR,
  homeTarget,
  isHome,
  lookOf,
  placeAvatars,
  watchPresence,
  type Presence,
  type PresenceDoc,
} from "./presence.js";
import { type LabeledFields } from "../core/atoms/labeled.js";
import { add, byId, caps, fieldsOf, node, type Node } from "../core/node.js";
import { outlineOf, type BoundedFields } from "../core/atoms/bounded.js";
import { Acceptor } from "../core/atoms/acceptor.js";
import { Bounded } from "../core/atoms/bounded.js";
import { Container, registerLayout } from "../core/atoms/container.js";
import { rect } from "../presets/shapes.js";
import { Grabber } from "../core/atoms/grab.js";
import { freeLayout } from "../core/atoms/layouts.js";
import { type TransformableFields } from "../core/atoms/transformable.js";
import { type SurfacedFields } from "../core/atoms/surfaced.js";
import { surfaceRecord } from "./surfaces.js";
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
  it("presence.a-far-avatar-stands-under-the-home-anchor — the disc IS where they sit", () => {
    // A PERSON IS WHERE THEY ARE LOOKING FROM, and the felt under the LOW MIDDLE of their glass is
    // the whole of that sentence (`HOME_ANCHOR`): a player at a table is at the near edge of it,
    // not hovering over the middle. Panned, the disc goes exactly as far as the view went —
    // anything else would be a second place for the same person, and the desk would have to say
    // which of the two is them.
    const drop = (GLASS.h * (HOME_ANCHOR.y - 0.5)) / 50;
    const still = avatarAt(person("south"));
    expect(still.x).toBeCloseTo(0);
    expect(still.y).toBeCloseTo(drop);

    const panned = person("south", { view: { target: { x: 3, y: -1.5 }, zoom: 50, rotation: 0, glass: GLASS } });
    expect(avatarAt(panned).x).toBeCloseTo(3);
    expect(avatarAt(panned).y).toBeCloseTo(-1.5 + drop);

    // A TURN MOVES THE ANCHOR ROUND WITH THE SCREEN. Their seat is still the near edge of THEIR
    // glass, and the near edge of a screen held upside down is the other side of the felt.
    const turned = person("north", { view: { target: { x: 3, y: -1.5 }, zoom: 50, rotation: 180, glass: GLASS } });
    expect(avatarAt(turned).x).toBeCloseTo(3);
    expect(avatarAt(turned).y).toBeCloseTo(-1.5 - drop);

    // ...and a zoom moves it less, because a reader who leaned in sees less felt between the
    // middle of their glass and its edge — the anchor is a fraction of the GLASS, not of the desk.
    const near = person("north", { view: { target: { x: 3, y: -1.5 }, zoom: 200, rotation: 0, glass: GLASS } });
    expect(avatarAt(near).y).toBeCloseTo(-1.5 + drop / 4);
  });

  it("presence.the-anchor-is-asked-once — the disc at home lands exactly on its own ring", () => {
    // THE ONE THING THE ANCHOR IS FOR. `isHome` says a view is home and `avatarAt` says where that
    // person stands; read off two numbers they would drift, and a desk would take the disc off the
    // felt at a moment when it was standing a screen's-worth from the ring it is hiding inside.
    const place = { at: { x: 3, y: -2 }, facing: 90 };
    const view = { target: homeTarget(place, { zoom: 40, rotation: 90, glass: GLASS }), zoom: 40, rotation: 90, glass: GLASS };
    expect(isHome(view, place)).toBe(true);
    const standing = avatarAt(person("east", { place, view }));
    expect(standing.x).toBeCloseTo(place.at.x);
    expect(standing.y).toBeCloseTo(place.at.y);
  });

  it("presence.the-disc-wears-the-look-it-is-turned-in — a cone from its centre, under the disc, and only while looking", () => {
    // A DISC SAYS WHERE SOMEBODY IS AND NOT WHICH WAY THEY ARE TURNED, and on a shared desk that is
    // half of "where they are sitting": two readers standing on the same felt looking opposite ways
    // are looking at two different halves of the game. The disc is already turned by its owner's
    // camera, so the cone is a fixed shape drawn straight up its own axis and the angle is free.
    const disc = avatarNode(person("south"));
    const cone = byId(disc, avatarConeId("south"));
    expect(cone, "the disc says which way its owner is looking").toBeDefined();
    const points = outlineOf(fieldsOf<BoundedFields>(cone!, "Bounded")!.bounds);
    // ITS OWN SHAPE IS CENTRED ON ITS OWN ORIGIN — `layerOf` reads a gradient's axis through the
    // shape's bounds around that origin, with no word for an offset — and `at` carries the apex
    // to the disc's centre, so what has to land at (0,0) is the apex PLUS `at`, not the raw point.
    const at = fieldsOf<TransformableFields>(cone!, "Transformable")!.at;
    const landed = points.map((p) => ({ x: p.x + at.x, y: p.y + at.y }));
    // ITS APEX AT THE DISC'S CENTRE — the seat design's own: a cone that starts in the disc cannot
    // come apart from it — and opening UP THE NODE'S OWN AXIS, wider at the far end than a point.
    expect(landed.some((p) => p.x === 0 && p.y === 0), "the apex is the centre of the disc").toBe(true);
    expect(landed.every((p) => p.y <= 0), "the cone points the way the disc is turned").toBe(true);
    expect(Math.max(...landed.map((p) => Math.abs(p.x))), "it opens outwards").toBeGreaterThan(0.5);
    // ...AND THE RAW SHAPE ITSELF STAYS CENTRED, apex included — the fix for a real regression:
    // drawn apex-at-origin instead, `layerOf`'s gradient axis (centred on that same origin, no word
    // for an offset) spanned only the near half of the triangle; the far half fell outside it and
    // was clamped to the near stop's alpha (nothing), and the sliver left inside sat under the disc
    // that draws over it — the cone painted every frame and never once showed on a screen.
    const ys = points.map((p) => p.y);
    expect(Math.min(...ys), "the shape's own bounds are symmetric about its own origin").toBeCloseTo(-Math.max(...ys));
    // ...AND UNDER THE DISC, not over the initials: the first thing drawn, so the face covers it.
    expect(disc.children[0]).toBe(cone);
    // ...AND UNDER EVERYTHING ON THE FELT: a look is a light over the desk, not a thing on it, so
    // it sorts below every piece at rest (z under zero), and no finger meets it — it wears nothing a
    // finger answers to, and every pick falls through it to what it is looking at.
    expect(fieldsOf<TransformableFields>(cone!, "Transformable")?.z).toBeLessThan(0);
    for (const atom of ["Draggable", "Pressable", "Grippable", "Acceptor"]) expect(caps(cone!).has(atom), `no ${atom} on a cone`).toBe(false);
    // ...AND THINNING OUT WITH DISTANCE: solid at the apex, gone at the far edge — a wash of the
    // seat's own ink whose stops carry the solidity, so the ink stays a token.
    const wash = surfaceRecord(fieldsOf<SurfacedFields>(cone!, "Surfaced")!.surface)!.layers[0]!;
    expect(wash.gradient, "a wash, not a flat fill").toBeDefined();
    const stops = [...wash.gradient!.stops].sort((a, b) => a.at - b.at);
    expect(stops[0]!.opacity, "the far end (the top of the node, at 0 on a 90° axis) is gone").toBe(0);
    expect(stops[stops.length - 1]!.opacity ?? 1, "the apex is solid").toBe(1);
    expect(stops.every((st) => st.paint === person("south").ink), "one ink all the way").toBe(true);
    // ...AND NOT AT ALL for somebody who is at the desk but not looking at it — the design's "not
    // looking": the disc stands, the cone is gone. Somebody gone is not drawn at all.
    expect(byId(avatarNode(person("south", { state: "away" })), avatarConeId("south"))).toBeUndefined();
    expect(lookOf("left").drawn).toBe(false);
    expect(lookOf("offline").drawn).toBe(false);
    expect(lookOf("away").drawn).toBe(true);
    // A FULL HAND IS A RING ROUND THE DISC — the one thing on it about the moment, not the person.
    expect(byId(avatarNode(person("south", { holding: true })), `${avatarId("south")} halo`)).toBeDefined();
    expect(byId(disc, `${avatarId("south")} halo`)).toBeUndefined();
    // ...AND THE NAME IS ON A PLATE UNDER IT, upright to whoever is looking.
    const plate = byId(disc, avatarNameId("south"))!;
    expect(fieldsOf<LabeledFields>(plate, "Labeled")?.label).toBe(person("south").name);
    expect(caps(plate).has("Oriented")).toBe(true);
    expect(fieldsOf<TransformableFields>(plate, "Transformable")?.at?.y).toBeGreaterThan(0);
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

describe("who is at their own place", () => {
  const place = { at: { x: 3, y: -2 }, facing: 90 };
  const GLASS_UP = { w: 390, h: 800 };
  // THE VIEW OF SOMEBODY SITTING AT THIS PLACE — aimed so the ring stands on the home anchor, which
  // is what "home" means and is no longer the middle of the glass (`HOME_ANCHOR`).
  const looking = {
    target: homeTarget(place, { zoom: 40, rotation: place.facing, glass: GLASS_UP }),
    zoom: 40,
    rotation: place.facing,
    glass: GLASS_UP,
  };
  const seated = (seat: string, view: typeof looking): Presence => ({
    seat,
    place,
    name: seat,
    ink: "accent",
    state: "online",
    holding: false,
    view,
  });

  it("presence.home-is-the-place-low-on-the-glass — turned or zoomed a little, still home; walked off, away", () => {
    // THE OWNER'S OWN RULE: a reader who spun the view or nudged the pinch but still keeps their
    // chair in the lower part of the glass is on their chair; one who set off across the felt, or
    // to somewhere else, has left. The turn is never the question — it is worn by the disc.
    expect(isHome(looking, place)).toBe(true);
    // A TURN IS ABOUT THE MIDDLE OF THE GLASS, so a place low on it swings up as the view spins: a
    // little turn keeps it low, half a turn puts it at the top — and that is the rule, not the angle.
    expect(isHome({ ...looking, rotation: looking.rotation + 45 }, place), "turned a little, the place still low on the glass").toBe(true);
    expect(isHome({ ...looking, rotation: looking.rotation + 180 }, place), "…but upside down the place is at the TOP").toBe(false);
    // A pan that walks the place up the glass: past the middle it is away.
    const up = (px: number) => ({ ...looking, target: { x: looking.target.x + px / looking.zoom, y: looking.target.y } });
    expect(isHome(up(200), place), "a nudge, the place still low").toBe(true);
    expect(isHome(up(300), place), "walked up past the middle of the glass").toBe(false);
    expect(isHome({ ...looking, target: { x: looking.target.x, y: looking.target.y + 12 } }, place), "walked off the glass sideways").toBe(false);
    // THE ZOOM IS ONLY ASKED WHEN THE READER CAN SAY WHAT HOME IS WORTH IN PIXELS — only the owner's
    // own screen knows its etalon — and it is a wide gate: half to double.
    // A PINCH ZOOMS ABOUT THE FINGER, so the place stays where it was on the glass: each view here
    // is re-aimed for its zoom (`homeTarget`), and only the zoom itself is being judged.
    const zoomed = (zoom: number) => ({ ...looking, zoom, target: homeTarget(place, { zoom, rotation: looking.rotation, glass: GLASS_UP }) });
    expect(isHome(looking, place, 40)).toBe(true);
    expect(isHome(zoomed(70), place, 40), "zoomed in, within double").toBe(true);
    expect(isHome(zoomed(100), place, 40), "zoomed right in").toBe(false);
    expect(isHome(zoomed(15), place, 40), "zoomed right out").toBe(false);
    expect(isHome(zoomed(100), place), "…and a far reader, not knowing the etalon, does not ask").toBe(true);
  });

  it("presence.at-home-the-disc-stands-in-the-arch — at the place, turned as the camera is; away, under the glass", () => {
    // TWO PICTURES, ONE NODE. Somebody looking at their own place IS the disc in their chair — at
    // the place itself, but turned as their CAMERA is turned and with a cone that reaches as far as
    // their glass does: the seat is a fact, the look is a reading. The moment they walk off, the
    // disc is the only thing that says where they went.
    const desk = node("desk");
    const south = seated("south", looking);
    placeAvatars(desk, [south, seated("north", { ...looking, target: { x: -6, y: 6 } })]);
    const home = byId(desk, avatarId("south"))!;
    expect(home, "home").toBeDefined();
    expect(fieldsOf<TransformableFields>(home, "Transformable")?.at).toEqual(south.place!.at);
    expect(fieldsOf<TransformableFields>(home, "Transformable")?.angle).toBeCloseTo(-south.view.rotation);
    const away = byId(desk, avatarId("north"))!;
    expect(away, "away").toBeDefined();
    expect(fieldsOf<TransformableFields>(away, "Transformable")?.at).not.toEqual(south.place!.at);
    // TURNED AT THE SEAT: still in the arch, and the disc turns with the camera.
    placeAvatars(desk, [seated("south", { ...looking, rotation: looking.rotation + 45 })]);
    const spun = byId(desk, avatarId("south"))!;
    expect(fieldsOf<TransformableFields>(spun, "Transformable")?.at).toEqual(south.place!.at);
    expect(fieldsOf<TransformableFields>(spun, "Transformable")?.angle).toBeCloseTo(-(looking.rotation + 45));
    // ...AND THE CONE REACHES AS FAR AS THE GLASS SHOWS: zoomed out, further; zoomed in, less.
    const reachOf = (zoom: number) => Math.max(...outlineOf(fieldsOf<BoundedFields>(byId(avatarNode(seated("south", { ...looking, zoom })), avatarConeId("south"))!, "Bounded")!.bounds).map((q) => -q.y));
    expect(reachOf(20)).toBeGreaterThan(reachOf(40));
    expect(reachOf(80)).toBeLessThan(reachOf(40));

    // ...AND THE PICTURES SWAP when they swap — the sweep has to work both ways, or a disc left
    // standing at the place is a person in two places.
    placeAvatars(desk, [seated("south", { ...looking, target: { x: -6, y: 6 } }), seated("north", looking)]);
    expect(fieldsOf<TransformableFields>(byId(desk, avatarId("south"))!, "Transformable")?.at).not.toEqual(south.place!.at);
    expect(fieldsOf<TransformableFields>(byId(desk, avatarId("north"))!, "Transformable")?.at).toEqual(south.place!.at);
    // ...AND SOMEBODY GONE IS NOT DRAWN AT ALL: their chair says the place is held.
    placeAvatars(desk, [{ ...seated("south", looking), state: "left" }, seated("north", looking)]);
    expect(byId(desk, avatarId("south"))).toBeUndefined();
  });

  it("presence.a-disc-is-turned-the-way-its-owner-is-turned — the angle IS half the message", () => {
    // WHICH WAY UP somebody is holding the desk is part of where they are sitting, and a disc that
    // faced every reader alike would be a person with no direction at all.
    const desk = node("desk");
    placeAvatars(desk, [seated("south", { ...looking, target: { x: 0, y: 0 }, rotation: 35 })]);
    const disc = byId(desk, avatarId("south"))!;
    expect(fieldsOf<TransformableFields>(disc, "Transformable")?.angle).toBeCloseTo(-35);
    // ...and it is NOT a billboard: a node indifferent to every turn cannot report one.
    expect(caps(disc).has("Oriented")).toBe(false);
  });
});
