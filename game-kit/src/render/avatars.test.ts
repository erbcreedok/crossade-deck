// @vitest-environment jsdom
//
// THE PEOPLE AT A LIVE DESK, WITH A FAKE TRANSPORT — the catalog's own screens are not this file's
// concern (`.storybook/stories/avatars.ts` is the thin wrapper that reads them); what is checked
// here is the engine every live page shares once it is handed a `Presence[]` by whatever transport
// it is given. The fake below stands for the catalog's own: every "screen" is already local, so
// `hear` never fires and `say` has nowhere to go — which is exactly what the catalog's own transport
// does too.

import { describe, expect, it } from "vitest";
import {
  add,
  avatarId,
  Bounded,
  byId,
  contextFor,
  DEFAULT_VIEWER,
  facing,
  Flippable,
  flipEffect,
  installStockFlips,
  node,
  rect,
  Surfaced,
  Transformable,
  type CoatedFields,
  homeTarget,
  caps,
  grippableBy,
  fieldsOf,
  surfaceRecord,
  withAvatars,
  type AvatarsTransport,
  type Node,
  type Presence,
  type PresenceView,
  type SurfacedFields,
  type TransformableFields,
} from "../index.js";
import { chairButtonId, chairHome, chairId, chairLidId, chairLidSurface, chairMarkId, chairMarks, chairPinned, chairRingId, handHidden, handLocked, handPose, isHand, ROUND_R, roundMap, roundPlaces, seatBar, SEATS } from "@game-presets/desks";
import { mayTake } from "@game-presets/desks";

/** A camera that has nothing else — the one thing `withAvatars` asks a screen for. */
interface FakeScreen {
  readonly seat: string;
  readonly ink: string;
  camera?: { target: { x: number; y: number }; pixelsPerUnit: number; rotation: number; glass: { w: number; h: number } };
}

function screenOf(seat: string, ink: string, rotation: number): FakeScreen {
  return { seat, ink, camera: { target: { x: 0, y: 0 }, pixelsPerUnit: 40, rotation, glass: { w: 390, h: 400 } } };
}

/** What one screen's camera is worth as a message — see `PresenceView` on why the scale is total. */
const viewOf = (one: FakeScreen): PresenceView | undefined => {
  const camera = one.camera;
  if (!camera) return undefined;
  return { target: camera.target, zoom: camera.pixelsPerUnit, rotation: camera.rotation, glass: camera.glass };
};

/** The catalog's own transport, stood in for: every screen is local, nothing arrives from outside. */
function transportOf(screens: readonly FakeScreen[]): AvatarsTransport {
  return {
    mine: (): Presence[] =>
      screens.flatMap((one) => {
        const view = viewOf(one);
        if (!view) return [];
        return [{ seat: one.seat, name: one.seat, ink: one.ink, state: "online", holding: false, view }];
      }),
    say: () => {},
    hear: () => () => {},
  };
}

function at(n: Node): { x: number; y: number } {
  return fieldsOf<TransformableFields>(n, "Transformable")?.at ?? { x: 0, y: 0 };
}

describe("the people at a live desk", () => {
  const wire = (desk: Node, screens: FakeScreen[]) =>
    withAvatars({
      desk,
      seats: SEATS,
      transport: transportOf(screens),
      hands: ROUND_R,
      wall: document.createElement("div"),
      places: roundPlaces(SEATS.length),
    });

  it("live.a-desk-with-avatars-seats-a-person-and-a-hand-each — and the hand IS that person's place", () => {
    const desk = roundMap(SEATS);
    // AWAY FROM THEIR PLACES, both of them: a reader looking at their own seat has no disc drawn at
    // all (`placeAvatars`), and this page is about there being one per person.
    const screens = [screenOf("south", "accent", 0), screenOf("north", "alert", 180)];
    const people = wire(desk, screens);
    people.publish();

    const discs = SEATS.map(({ seat }) => byId(desk, avatarId(seat)));
    const rings = SEATS.map(({ seat }) => byId(desk, chairId(seat)));
    expect(discs.filter(Boolean)).toHaveLength(2);
    // ONE NODE, NOT TWO. The ring a player sits at is the patch their cards lie in, so there is no
    // second thing to keep beside a first and nothing to be measured against the rim.
    rings.forEach((ring, i) => {
      expect(isHand(ring!), "the place is the hand").toBe(true);
      expect(at(ring!)).toEqual(roundPlaces(SEATS.length)[i]!.at);
    });
  });

  it("live.a-hand-stands-at-the-place-and-not-at-the-camera — panning your own view leaves it alone", () => {
    // THE ONE THING THIS SPLIT IS FOR. A hand fastened to the disc is a patch of table sliding
    // about under the cards lying in it every time its owner looks somewhere else.
    const desk = roundMap(SEATS);
    const screens = [screenOf("south", "accent", 0), screenOf("north", "alert", 180)];
    const people = wire(desk, screens);
    people.publish();
    const seat = SEATS[0]!.seat;
    const wasRing = at(byId(desk, chairId(seat))!);
    const wasDisc = at(byId(desk, avatarId(seat))!);

    // THE VIEW MOVES and nothing on the felt does — only the disc, which IS the view.
    screens[0]!.camera!.target = { x: 2.5, y: -1.5 };
    people.publish();
    expect(at(byId(desk, chairId(seat))!)).toEqual(wasRing);
    expect(at(byId(desk, avatarId(seat))!)).not.toEqual(wasDisc);

    // THE PLACE MOVES and the cards go with it, because they are IN it — one node, one move.
    people.handed(seat, [{ id: chairId(seat) }] as never, { x: 0, y: -(ROUND_R - 1) }, true);
    expect(people.placeOf(seat)?.at).toEqual({ x: 0, y: -(ROUND_R - 1) });
    expect(at(byId(desk, chairId(seat))!)).toEqual({ x: 0, y: -(ROUND_R - 1) });
  });

  it("live.a-dropped-ring-takes-the-holder-s-turn — a place is left facing the way it was carried", () => {
    // A CARD LIES THE WAY ITS HOLDER HELD IT (`holderTurn`), and a place is the one thing on the
    // felt that says which way somebody is sitting. Left at the turn it was built with, a reader
    // who spun their view and dragged their ring across the desk sat at the same seat as before:
    // the tick pointed where nobody was, and coming home glided the view back to the old angle.
    const desk = roundMap(SEATS);
    const screens = [screenOf("south", "accent", 0), screenOf("north", "alert", 180)];
    const people = wire(desk, screens);
    people.publish();
    const seat = SEATS[0]!.seat;
    const was = people.placeOf(seat)!.facing;

    screens[0]!.camera!.rotation = was + 90;
    people.handed(seat, [{ id: chairId(seat) }] as never, { x: 1, y: 1 }, false);
    expect(people.placeOf(seat)?.facing, "mid-carry the place has not turned yet").toBe(was);

    people.handed(seat, [{ id: chairId(seat) }] as never, { x: 1, y: 1 }, true);
    expect(people.placeOf(seat)?.facing, "let go, it faces the way its owner was looking").toBe(was + 90);
    // ...AND THE ARCH SAYS SO. The facing is visible as the way the chair stands: a place whose
    // number turned while its shape did not is a desk that says two things about one seat. Level
    // on its owner's glass, which turns the desk by the facing — so on the desk it stands at MINUS
    // the facing, the disc's own law (`avatarNode`), face and all.
    expect(fieldsOf<TransformableFields>(byId(desk, chairId(seat))!, "Transformable")?.angle).toBe(-(was + 90));
    expect(fieldsOf<TransformableFields>(byId(desk, chairLidId(seat))!, "Transformable")?.angle).toBe(-(was + 90));
  });

  it("live.at-home-the-disc-is-in-the-arch — and away it stands under the glass, the chair left holding the place", () => {
    // ONE PICTURE FOR HOME: the disc at the place, in the arch, at the place's own turn. Away, the
    // disc is under the owner's glass and the chair stays, in their ink, saying the place is held.
    const desk = roundMap(SEATS);
    const places = roundPlaces(SEATS.length);
    const screens = SEATS.map(({ seat, ink }, i) => screenOf(seat, ink as string, places[i]!.facing));
    // Every camera aimed so its own place stands on the home anchor, which is what every live page
    // opens on after a glide — the LOW middle of the glass and not the middle (`homeTarget`).
    screens.forEach((one, i) => {
      const cam = one.camera!;
      cam.target = homeTarget(places[i]!, { zoom: cam.pixelsPerUnit, rotation: places[i]!.facing, glass: cam.glass });
    });
    const people = wire(desk, screens);
    people.publish();
    for (const [i, { seat }] of SEATS.entries()) {
      const disc = byId(desk, avatarId(seat))!;
      expect(disc, `${seat} at home has a disc`).toBeDefined();
      expect(at(disc), "…in the arch").toEqual(places[i]!.at);
      expect(fieldsOf<TransformableFields>(disc, "Transformable")?.angle).toBeCloseTo(-places[i]!.facing);
      expect(chairHome(byId(desk, chairId(seat))!), `${seat}'s chair says home`).toBe(true);
    }

    // ...AND ONE OF THEM WALKS OFF — past the far side of the felt, their own chair off the foot of
    // their glass. Their disc leaves the arch, on both screens, and their chair says so; the other
    // player's picture is untouched, which is what makes it a reading and not a mode. (Looking at
    // the MIDDLE of the desk is not walking off: the chair is still low on the glass, and home.)
    screens[0]!.camera!.target = { x: 0, y: -4 };
    people.publish();
    expect(at(byId(desk, avatarId(SEATS[0]!.seat))!), "away, the disc is under the glass").not.toEqual(places[0]!.at);
    expect(chairHome(byId(desk, chairId(SEATS[0]!.seat))!)).toBe(false);
    expect(at(byId(desk, avatarId(SEATS[1]!.seat))!), "the other one is still home").toEqual(places[1]!.at);
    expect(chairHome(byId(desk, chairId(SEATS[1]!.seat))!)).toBe(true);
  });

  it("live.a-tap-on-your-own-ring-takes-you-home — and a tap on anybody else's does nothing", () => {
    const desk = roundMap(SEATS);
    const asked: string[] = [];
    const people = withAvatars({
      desk,
      seats: SEATS,
      transport: transportOf([screenOf("south", "accent", 0)]),
      hands: ROUND_R,
      wall: document.createElement("div"),
      places: roundPlaces(SEATS.length),
      goHome: (seat) => asked.push(seat),
    });
    people.publish();
    const [mine, theirs] = SEATS.map(({ seat }) => seat) as [string, string];
    expect(people.tapped(mine, byId(desk, chairId(mine))!)).toBe(true);
    expect(asked).toEqual([mine]);
    // SOMEBODY ELSE'S RING IS NOT A THING THIS SEAT MAY SAY ANYTHING WITH — the tap goes on to
    // whatever the scene was already doing with one.
    expect(people.tapped(mine, byId(desk, chairId(theirs))!)).toBe(false);
    expect(asked).toEqual([mine]);
  });

  it("live.the-bar-is-pressed-by-its-owner-alone — shut, hide, turn over, pin, fold: five writes on the chair, read by every screen", () => {
    // THE CONTROLS ON THE OWNER'S GLASS (`handBar.ts`) are the one place a finger says what a hand
    // is. Each press is one write on the chair — the lock and the pin are numbers on it, hiding is
    // its zone rule, a flip is the cards' own sides, a fold is its pose — and the chair is on every
    // screen's tree, so the OTHER screen reads the state off the same node: marks beside the chair,
    // refused reaches, backs instead of faces.
    installStockFlips();
    const desk = roundMap(SEATS);
    const screens = [screenOf("south", "accent", 0), screenOf("north", "alert", 180)];
    const people = wire(desk, screens);
    people.publish();
    const ring = byId(desk, chairId("south"))!;
    const card = (id: string) => node(id, Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: "front" }), Transformable({ at: { x: 0, y: 0 } }), Flippable({ flip: "turnOver", back: "cardBack" }));
    add(ring, card("ace"));
    add(ring, card("two"));
    // THE CONTROLS ARE THE GLASS'S, built off the chair; on the felt there are none to press.
    expect(byId(desk, chairButtonId("south", "lock"))).toBeUndefined();
    const bar = seatBar("south", ring, "accent")[0]!;
    const control = (what: "lock" | "hide" | "flip" | "pin" | "fan" | "shrink") => byId(bar, chairButtonId("south", what))!;
    const marked = (what: "lock" | "hide" | "pin"): boolean => chairMarks(desk, "south").some((m) => m.id === chairMarkId("south", what));

    // NOBODY ELSE'S FINGER: north pressing south's bar is not this wiring's.
    expect(people.pressed("north", control("lock"))).toBe(false);
    expect(handLocked(ring)).toBe(false);
    // ...AND A PIECE THAT IS NOT THE BAR'S is not either.
    expect(people.pressed("south", ring)).toBe(false);

    expect(people.pressed("south", control("lock"))).toBe(true);
    expect(handLocked(ring), "shut").toBe(true);
    expect(grippableBy(byId(desk, "ace")!, "north"), "…and north cannot reach in").toBe(false);
    expect(marked("lock"), "…and the padlock stands beside the chair, for every screen").toBe(true);

    expect(people.pressed("south", control("hide"))).toBe(true);
    expect(handHidden(ring)).toBe(true);
    // THE OTHER SCREEN SEES BACKS — read where the picture is made, for its own eyes.
    const shown = (me: string, id: string) =>
      fieldsOf<SurfacedFields>(flipEffect(byId(desk, id)!, contextFor(byId(desk, id)!, 100, { ...DEFAULT_VIEWER, marks: { showOwn: false, me } })).node, "Surfaced")!.surface;
    expect(shown("north", "ace")).toBe("cardBack");
    expect(shown("south", "ace")).toBe("front");

    expect(people.pressed("south", control("flip"))).toBe(true);
    expect(facing(byId(desk, "ace")!)).toBe("down");
    expect(facing(byId(desk, "two")!)).toBe("down");
    expect(ring.children.map((n) => n.id), "the order is untouched").toEqual(["ace", "two"]);
    expect(chairMarks(desk, "south").length, "a flip is not a state and marks nothing").toBe(2);

    expect(people.pressed("south", control("pin"))).toBe(true);
    expect(chairPinned(ring)).toBe(true);
    // A PIN IS PUT UP AGAINST OTHER HANDS, NOT ONE'S OWN (`seatPlace.mayTake`): the owner still
    // moves their own chair, and the pin stops everybody else — the admin included.
    expect(mayTake(ring, "south"), "the owner moves their own chair, pinned or not").toBe(true);
    expect(mayTake(ring, "north"), "and a pinned chair moves for nobody else").toBe(false);
    expect(marked("pin")).toBe(true);

    // A FOLD IS ONE TOGGLE OF THE HAND'S POSE, written on the chair like the rest — and the other
    // two toggles are left as they were.
    expect(people.pressed("south", control("fan"))).toBe(true);
    expect(handPose(ring), "a fan on the glass is a fan in front of the chair").toEqual({ fan: true, shrink: false, tuck: false });
    expect(people.pressed("south", control("shrink"))).toBe(true);
    expect(handPose(ring), "shrunk as well, still fanned").toEqual({ fan: true, shrink: true, tuck: false });
    expect(people.pressed("south", control("fan"))).toBe(true);
    expect(handPose(ring), "the fan off again, the shrink kept").toEqual({ fan: false, shrink: true, tuck: false });

    // ...AND EACH PRESSED AGAIN IS THE STATE OFF AGAIN.
    people.pressed("south", control("lock"));
    people.pressed("south", control("hide"));
    people.pressed("south", control("pin"));
    expect([handLocked(ring), handHidden(ring), chairPinned(ring)]).toEqual([false, false, false]);
    expect(chairMarks(desk, "south"), "off, the marks come down").toEqual([]);
    expect(shown("north", "ace"), "shown again, north sees the side south set").toBe("cardBack");
  });

  it("live.a-pin-is-the-only-ban-on-a-place — and nothing at all may move a disc", () => {
    const desk = roundMap(SEATS);
    const people = wire(desk, [screenOf("south", "accent", 0)]);
    people.publish();
    const [mine, theirs] = SEATS.map(({ seat }) => seat) as [string, string];
    // A CHAIR IS MOVED BY ANY HAND UNTIL ITS OWNER PINS IT — the pin is the only ban, and it is
    // personal (`seatPlace.mayTake`). The refusal is `mayTake` rather than a grip, because a grip
    // cuts the subtree and would shut the hand inside the ring for ever.
    const chair = byId(desk, chairId(mine))!;
    expect(caps(chair).has("Draggable")).toBe(true);
    expect(mayTake(chair, mine)).toBe(true);
    expect(mayTake(chair, theirs), "an unpinned chair is moved by anybody").toBe(true);
    expect(grippableBy(chair, theirs), "an open hand is dealt from by anybody").toBe(true);
    // A DISC IS NOT PICKED UP AT ALL: it is a reading of a camera, not a thing on the desk.
    expect(caps(byId(desk, avatarId(mine))!).has("Draggable")).toBe(false);
  });

  it("live.one-ink-per-place — everything of a seat is drawn in that seat's colour and in no other", () => {
    // THE WHOLE OF WHAT A COLOUR SAYS AT A SHARED DESK is "this is the same person". A ring in one
    // ink with a disc in another beside it is two people where there is one, and the reader whose
    // own colour it is has no way to tell which of the two is them.
    const desk = roundMap(SEATS);
    const screens = [screenOf("south", "accent", 0), screenOf("north", "alert", 180)];
    wire(desk, screens).publish();
    const inks = SEATS.map(({ ink }) => ink as string);
    SEATS.forEach(({ seat, ink }, i) => {
      const theirs = inks[1 - i]!;
      // THE CHAIR'S INK IS THE RIM OF ITS FACE, the disc's the rim of the disc: the chair itself
      // and the disc's root are the black keyline and a frame, and carry no colour of their own.
      for (const [id, surface] of [
        [chairLidId(seat), chairLidSurface(seat)],
        [avatarId(seat), fieldsOf<SurfacedFields>(byId(byId(desk, avatarId(seat))!, `${avatarId(seat)} disc`)!, "Surfaced")!.surface],
      ] as const) {
        expect(byId(desk, id), id).toBeDefined();
        const record = surfaceRecord(surface)!;
        const paints = [...record.layers.map((l) => l.paint), record.stroke?.color].filter(Boolean);
        // ITS OWN INK IS ON IT, and the other seat's is nowhere on it. Both halves: a node painted
        // in neither colour is as wrong as one painted in the wrong one, and only the first check
        // catches the felt-coloured hand nobody can see is theirs.
        expect(paints, `${id} in its own ink`).toContain(ink);
        expect(paints, `${id} free of ${theirs}`).not.toContain(theirs);
      }
    });
  });

  it("live.a-desk-without-avatars-has-neither-a-person-nor-a-hand — an empty patch belongs to nobody", () => {
    const desk = roundMap([]);
    for (const { seat } of SEATS) {
      expect(byId(desk, chairId(seat)), `a place for ${seat}`).toBeUndefined();
      expect(byId(desk, avatarId(seat)), `a disc for ${seat}`).toBeUndefined();
    }
  });
});
