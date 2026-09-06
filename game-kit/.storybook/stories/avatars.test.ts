// @vitest-environment jsdom
//
// THE TWO SCENES OF A LIVE PAGE, HELD APART — with the people at the desk, and without them.
//
// The whole of what `avatars: false` means is an absence, and an absence is exactly the thing that
// passes by looking right: a scene that quietly kept the hands would draw two empty patches nobody
// owns, and a scene that quietly kept the discs would draw two people who are not there. Neither
// shows up in a screenshot of a desk somebody is already playing on.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  avatarId,
  byId,
  caps,
  grippableBy,
  fieldsOf,
  surfaceRecord,
  type Node,
  type SurfacedFields,
  type TransformableFields,
} from "../../src/index.js";
import { chairId, handId, ROUND_R, roundMap, roundPlaces, SEATS } from "@game-presets/desks";
import { withAvatars } from "./avatars.js";
import { type Screen } from "./liveScreens.js";

/** A pane that has a camera and nothing else — the one thing `withAvatars` asks a screen for. */
function screenOf(seat: string, ink: string, rotation: number): Screen {
  return {
    seat,
    ink,
    dot: document.createElement("div"),
    scene: {
      camera: { target: { x: 0, y: 0 }, pixelsPerUnit: 40, rotation, glass: { w: 390, h: 400 } },
      // Told, and drawing nothing: what is being checked is the TREE the screen is handed, and a
      // painter in the way of that would be a WebGL canvas the suite has no headless stand-in for.
      setRoot: () => {},
    },
  } as unknown as Screen;
}

function at(n: Node): { x: number; y: number } {
  return fieldsOf<TransformableFields>(n, "Transformable")?.at ?? { x: 0, y: 0 };
}

describe("the people at a live desk", () => {
  const wire = (desk: Node, screens: Screen[]) =>
    withAvatars({
      desk,
      seats: SEATS,
      screens,
      page: "liveCards",
      hands: ROUND_R,
      wall: document.createElement("div"),
      places: roundPlaces(SEATS.length),
    });

  it("live.a-desk-with-avatars-seats-a-person-and-a-hand-each — and the hand stands beside its own PLACE", () => {
    const desk = roundMap(SEATS);
    const screens = [screenOf("south", "accent", 0), screenOf("north", "alert", Math.PI)];
    const people = wire(desk, screens);
    people.publish();

    const discs = SEATS.map(({ seat }) => byId(desk, avatarId(seat)));
    const hands = SEATS.map(({ seat }) => byId(desk, handId(seat)));
    const chairs = SEATS.map(({ seat }) => byId(desk, chairId(seat)));
    expect(discs.filter(Boolean)).toHaveLength(2);
    expect(hands.filter(Boolean)).toHaveLength(2);
    // BESIDE ITS OWN CHAIR, and on the felt — nearer to the ring it belongs to than to the other.
    hands.forEach((hand, i) => {
      const own = Math.hypot(at(hand!).x - at(chairs[i]!).x, at(hand!).y - at(chairs[i]!).y);
      const far = Math.hypot(at(hand!).x - at(chairs[1 - i]!).x, at(hand!).y - at(chairs[1 - i]!).y);
      expect(own).toBeLessThan(far);
      expect(Math.hypot(at(hand!).x, at(hand!).y)).toBeLessThan(ROUND_R);
    });
  });

  it("live.a-hand-stands-at-the-place-and-not-at-the-camera — panning your own view leaves it alone", () => {
    // THE ONE THING THIS SPLIT IS FOR. A hand fastened to the disc is a patch of table sliding
    // about under the cards lying in it every time its owner looks somewhere else.
    const desk = roundMap(SEATS);
    const screens = [screenOf("south", "accent", 0), screenOf("north", "alert", Math.PI)];
    const people = wire(desk, screens);
    people.publish();
    const seat = SEATS[0]!.seat;
    const wasHand = at(byId(desk, handId(seat))!);
    const wasChair = at(byId(desk, chairId(seat))!);
    const wasDisc = at(byId(desk, avatarId(seat))!);

    // THE VIEW MOVES and nothing on the felt does — only the disc, which IS the view.
    (screens[0]!.scene!.camera as { target: { x: number; y: number } }).target = { x: 2.5, y: -1.5 };
    people.publish();
    expect(at(byId(desk, handId(seat))!)).toEqual(wasHand);
    expect(at(byId(desk, chairId(seat))!)).toEqual(wasChair);
    expect(at(byId(desk, avatarId(seat))!)).not.toEqual(wasDisc);

    // THE PLACE MOVES and the hand goes with it — the chair is the anchor, and it is the only one.
    people.handed(seat, [{ id: chairId(seat) }] as never, { x: 0, y: -(ROUND_R - 1) }, true);
    expect(people.placeOf(seat)?.at).toEqual({ x: 0, y: -(ROUND_R - 1) });
    expect(at(byId(desk, chairId(seat))!)).toEqual({ x: 0, y: -(ROUND_R - 1) });
    expect(at(byId(desk, handId(seat))!)).not.toEqual(wasHand);
    // ...and it is still BESIDE it and still on the felt.
    const moved = at(byId(desk, handId(seat))!);
    expect(Math.hypot(moved.x - 0, moved.y + (ROUND_R - 1))).toBeLessThan(2.5);
    expect(Math.hypot(moved.x, moved.y)).toBeLessThan(ROUND_R);
  });

  it("live.only-the-owner-may-move-a-place — and nothing at all may move a disc", () => {
    const desk = roundMap(SEATS);
    const people = wire(desk, [screenOf("south", "accent", 0)]);
    people.publish();
    const [mine, theirs] = SEATS.map(({ seat }) => seat) as [string, string];
    // A CHAIR IS PICKED UP BY ITS OWN SEAT AND BY NOBODY ELSE — the refusal is the absent grip.
    const chair = byId(desk, chairId(mine))!;
    expect(caps(chair).has("Draggable")).toBe(true);
    expect(grippableBy(chair, mine)).toBe(true);
    expect(grippableBy(chair, theirs)).toBe(false);
    // A DISC IS NOT PICKED UP AT ALL: it is a reading of a camera, not a thing on the desk.
    expect(caps(byId(desk, avatarId(mine))!).has("Draggable")).toBe(false);
  });


  it("live.one-ink-per-place — everything of a seat is drawn in that seat's colour and in no other", () => {
    // THE WHOLE OF WHAT A COLOUR SAYS AT A SHARED DESK is "this is the same person". A ring in one
    // ink with a disc in another beside it is two people where there is one, and the reader whose
    // own colour it is has no way to tell which of the two is them.
    const desk = roundMap(SEATS);
    const screens = [screenOf("south", "accent", 0), screenOf("north", "alert", Math.PI)];
    wire(desk, screens).publish();
    const inks = SEATS.map(({ ink }) => ink as string);
    SEATS.forEach(({ seat, ink }, i) => {
      const theirs = inks[1 - i]!;
      for (const id of [chairId(seat), avatarId(seat), handId(seat)]) {
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

  // THE CURSOR IS THE ONE MARK OF A SEAT THAT IS NOT ON THE DESK — a div over the glass, painted by
  // the page and not by a surface, and it was painted the wrong colour on every live page: the dot
  // was given the ink of the PANE it sits in, while the finger it draws is always the other seat's.
  // Read as source, because the colour is set on a DOM node by a page that needs two hosts, a
  // pointer and a WebGL canvas to be built at all — and the bug is one word in one line.
  const LIVE_PAGES = ["Hands", "Cards", "Chess", "Nardy"];
  for (const page of LIVE_PAGES) {
    it(`live.a-cursor-wears-its-owner-s-ink — ${page} paints the dot at the end the finger is at`, () => {
      // From the package root and not from `import.meta.url`: this file runs under jsdom, where
      // that URL is the document's and not this module's, and the read lands outside the repo.
      const source = readFileSync(join(process.cwd(), ".storybook/stories", `${page}.stories.ts`), "utf8");
      // Painted where the hand is REPORTED (`mirror.hand` owns `ink`), and not where the dot is made.
      expect(source).toContain("one.dot.style.background = t(ink)");
      expect(source).not.toContain("transform:translate(-50%,-50%);background:${t(ink)}");
    });
  }

  it("live.a-desk-without-avatars-has-neither-a-person-nor-a-hand — an empty patch belongs to nobody", () => {
    const desk = roundMap([]);
    for (const { seat } of SEATS) {
      expect(byId(desk, handId(seat)), `a hand for ${seat}`).toBeUndefined();
      expect(byId(desk, avatarId(seat)), `a disc for ${seat}`).toBeUndefined();
    }
  });
});
