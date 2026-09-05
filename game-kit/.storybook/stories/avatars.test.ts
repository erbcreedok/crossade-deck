// @vitest-environment jsdom
//
// THE TWO SCENES OF A LIVE PAGE, HELD APART — with the people at the desk, and without them.
//
// The whole of what `avatars: false` means is an absence, and an absence is exactly the thing that
// passes by looking right: a scene that quietly kept the hands would draw two empty patches nobody
// owns, and a scene that quietly kept the discs would draw two people who are not there. Neither
// shows up in a screenshot of a desk somebody is already playing on.

import { describe, expect, it } from "vitest";
import { avatarId, byId, fieldsOf, type Node, type TransformableFields } from "../../src/index.js";
import { handId, ROUND_R, roundMap, SEATS } from "@game-presets/desks";
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
  it("live.a-desk-with-avatars-seats-a-person-and-a-hand-each — and the hand stands beside its own person", () => {
    const desk = roundMap(SEATS);
    const screens = [screenOf("south", "accent", 0), screenOf("north", "alert", Math.PI)];
    const people = withAvatars({
      desk,
      seats: SEATS,
      screens,
      page: "liveCards",
      at: (i) => ({ x: 0, y: i === 0 ? ROUND_R - 1 : -(ROUND_R - 1) }),
      hands: ROUND_R,
      wall: document.createElement("div"),
    });
    people.publish();

    const discs = SEATS.map(({ seat }) => byId(desk, avatarId(seat)));
    const hands = SEATS.map(({ seat }) => byId(desk, handId(seat)));
    expect(discs.filter(Boolean)).toHaveLength(2);
    expect(hands.filter(Boolean)).toHaveLength(2);
    // BESIDE ITS OWN PERSON, and on the felt — nearer to the disc it belongs to than to the other.
    hands.forEach((hand, i) => {
      const own = Math.hypot(at(hand!).x - at(discs[i]!).x, at(hand!).y - at(discs[i]!).y);
      const far = Math.hypot(at(hand!).x - at(discs[1 - i]!).x, at(hand!).y - at(discs[1 - i]!).y);
      expect(own).toBeLessThan(far);
      expect(Math.hypot(at(hand!).x, at(hand!).y)).toBeLessThan(ROUND_R);
    });

    // AND IT GOES WHERE THE PERSON GOES. The desk seats a hand at every place on its own, so a
    // hand that had never been re-placed against its avatar would still have passed the lines
    // above: what says the wiring is live is that dragging the disc took the patch with it.
    const wasAt = at(hands[0]!);
    people.handed(SEATS[0]!.seat, [{ id: avatarId(SEATS[0]!.seat) }] as never, { x: 3, y: 0 }, true);
    expect(at(byId(desk, handId(SEATS[0]!.seat))!)).not.toEqual(wasAt);
  });

  it("live.a-desk-without-avatars-has-neither-a-person-nor-a-hand — an empty patch belongs to nobody", () => {
    const desk = roundMap([]);
    for (const { seat } of SEATS) {
      expect(byId(desk, handId(seat)), `a hand for ${seat}`).toBeUndefined();
      expect(byId(desk, avatarId(seat)), `a disc for ${seat}`).toBeUndefined();
    }
  });
});
