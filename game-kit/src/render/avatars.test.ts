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
  avatarId,
  byId,
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
import { chairHome, chairId, isHand, ROUND_R, roundMap, roundPlaces, SEATS } from "@game-presets/desks";
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

  it("live.at-home-the-ring-is-the-person — filled, and no disc drawn over it", () => {
    // A DISC ON A FILLED RING IS THE SAME PERSON TWICE, at the one moment the two pictures agree
    // least: the ring says "this seat is taken" and the disc says "somebody is over here".
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
    for (const { seat } of SEATS) {
      expect(byId(desk, avatarId(seat)), `${seat} at home has no disc`).toBeUndefined();
      expect(chairHome(byId(desk, chairId(seat))!), `${seat}'s ring is filled`).toBe(true);
    }

    // ...AND ONE OF THEM LOOKS AWAY. Their disc appears, on both screens, and their ring empties;
    // the other player's picture is untouched, which is what makes it a reading and not a mode.
    screens[0]!.camera!.target = { x: 0, y: 0 };
    people.publish();
    expect(byId(desk, avatarId(SEATS[0]!.seat)), "away, the disc is drawn").toBeDefined();
    expect(chairHome(byId(desk, chairId(SEATS[0]!.seat))!)).toBe(false);
    expect(byId(desk, avatarId(SEATS[1]!.seat)), "the other one is still home").toBeUndefined();
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

  it("live.only-the-owner-may-move-a-place — and nothing at all may move a disc", () => {
    const desk = roundMap(SEATS);
    const people = wire(desk, [screenOf("south", "accent", 0)]);
    people.publish();
    const [mine, theirs] = SEATS.map(({ seat }) => seat) as [string, string];
    // A RING IS PICKED UP BY ITS OWN SEAT AND BY NOBODY ELSE — and the refusal is `mayTake` rather
    // than a grip, because a grip cuts the subtree and would shut the hand inside the ring for ever.
    const chair = byId(desk, chairId(mine))!;
    expect(caps(chair).has("Draggable")).toBe(true);
    expect(mayTake(chair, mine)).toBe(true);
    expect(mayTake(chair, theirs)).toBe(false);
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
      for (const id of [chairId(seat), avatarId(seat)]) {
        const node = byId(desk, id)!;
        expect(node, id).toBeDefined();
        const record = surfaceRecord(fieldsOf<SurfacedFields>(node, "Surfaced")!.surface)!;
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
