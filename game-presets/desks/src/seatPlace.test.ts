// THE CHAIRS — a place is a thing on the felt and not a thing that arrives with a person.
//
// Everything here is about the SPLIT: the ring stands at the place whatever the avatar is doing, it
// wears the place's own colour, and a place nobody holds is a different picture rather than a dimmer
// one. A desk that fails any of these is a desk where "who sits where" is only knowable while
// somebody happens to be looking at their own seat.

import { describe, expect, it } from "vitest";
import {
  avatarId,
  avatarNode,
  byId,
  caps,
  fieldsOf,
  surfaceRecord,
  type LabeledFields,
  type Node,
  type SurfacedFields,
  type TransformableFields,
} from "game-kit";
import { CHESS_SEATS, chessMap, seatPlaces as chessPlaces } from "./chessMap.js";
import { NARDY_SEATS, nardyMap, seatPlaces as nardyPlaces } from "./nardyMap.js";
import { roundMap, seatPlaces as roundPlaces } from "./roundMap.js";
import { SEATS } from "./liveMap.js";
import { chairId, chairSurface, isChair, seatChair } from "./seatPlace.js";

const chairs = (desk: Node): Node[] => desk.children.filter(isChair);
const poseOf = (n: Node) => fieldsOf<TransformableFields>(n, "Transformable")!.at!;
const inkOf = (n: Node): unknown =>
  surfaceRecord(fieldsOf<SurfacedFields>(n, "Surfaced")!.surface)?.stroke?.color;
const captionOf = (chair: Node): string | undefined =>
  fieldsOf<LabeledFields>(chair.children[0] ?? chair, "Labeled")?.label;

describe("a seat is drawn", () => {
  const desks: readonly [string, () => Node, readonly { readonly seat: string; readonly ink: string }[], readonly { at: { x: number; y: number } }[]][] = [
    ["round", () => roundMap(), SEATS as never, roundPlaces(SEATS.length)],
    ["chess", () => chessMap(), CHESS_SEATS as never, chessPlaces(CHESS_SEATS.length)],
    ["nardy", () => nardyMap(), NARDY_SEATS as never, nardyPlaces(NARDY_SEATS.length)],
  ];

  for (const [name, build, seats, places] of desks) {
    it(`seat.a-chair-per-place — ${name} draws every place it seats`, () => {
      const desk = build();
      const drawn = chairs(desk);
      expect(drawn).toHaveLength(seats.length);
      seats.forEach(({ seat }, i) => {
        const chair = byId(desk, chairId(seat))!;
        expect(chair, "the place is on the felt under its own name").toBeTruthy();
        // WHERE THE PLACE IS, and not a second opinion about it: the ring and the idle glide read
        // one answer (`seatPlaces`), or a view returning home lands beside the chair it came from.
        expect(poseOf(chair).x).toBeCloseTo(places[i]!.at.x);
        expect(poseOf(chair).y).toBeCloseTo(places[i]!.at.y);
        // A chair is scenery: nothing may be dropped in it and nothing may pick it up.
        expect(caps(chair).has("Acceptor")).toBe(false);
        expect(caps(chair).has("Draggable")).toBe(false);
      });
    });

    it(`seat.the-chair-wears-the-place-ink — ${name}`, () => {
      const desk = build();
      seats.forEach(({ seat, ink }) => {
        expect(inkOf(byId(desk, chairId(seat))!)).toBe(ink);
      });
    });

    it(`seat.the-chair-is-under-what-is-played-on-it — ${name}`, () => {
      const desk = build();
      // Equals in the plan are ranked by document order, so "under" is "earlier" in the WALK: a
      // chair added after the pieces is an outline drawn over the very board it belongs to. Walked
      // and not read off `desk.children`, because a man stands in a cell and a card in a hand — a
      // piece is rarely the desk's own child, and a comparison of siblings would pass vacuously.
      const walk = (n: Node): Node[] => [n, ...n.children.flatMap(walk)];
      const order = walk(desk);
      const last = chairs(desk).reduce((n, chair) => Math.max(n, order.indexOf(chair)), -1);
      const pieces = order.filter((n) => caps(n).has("Draggable"));
      expect(pieces.length, "a desk with nothing on it proves nothing about what is under what").toBeGreaterThan(0);
      for (const piece of pieces) expect(order.indexOf(piece)).toBeGreaterThan(last);
    });
  }

  it("seat.an-empty-chair-has-no-name — a place nobody holds is an outline and says nothing", () => {
    const held = seatChair("south", { at: { x: 0, y: 5 } }, { ink: "accent", name: "south" });
    const free = seatChair("north", { at: { x: 0, y: -5 } });
    expect(captionOf(held)).toBe("south");
    expect(free.children).toHaveLength(0);
    expect(captionOf(free)).toBeUndefined();
    // ...and it is DASHED and grey, rather than the same ring turned down: a place drawn in a
    // seat's colour is a place claimed for a player who is not there.
    expect(fieldsOf<SurfacedFields>(free, "Surfaced")?.surface).toBe(chairSurface());
    expect(surfaceRecord(chairSurface())?.stroke?.dash).toBeTruthy();
    expect(surfaceRecord(chairSurface())?.stroke?.color).not.toBe("accent");
  });

  it("seat.the-avatar-opens-on-its-own-chair — the disc stands IN the ring, not beside it", () => {
    const desk = roundMap();
    const place = roundPlaces(SEATS.length)[0]!;
    const seat = SEATS[0]!.seat;
    // A presence with a place and a desk pin at that place — what every consumer opens with, and
    // the one thing that makes the ring and the disc read as one picture.
    const avatar = avatarNode(
      {
        seat,
        place,
        name: "A",
        ink: SEATS[0]!.ink,
        state: "online",
        holding: false,
        view: { target: { x: 0, y: 0 }, zoom: 1, rotation: 0, glass: { w: 400, h: 800 } },
        pin: { mode: "desk", at: place.at, leash: "chase" },
      },
      true,
    );
    expect(avatar.id).toBe(avatarId(seat));
    expect(poseOf(avatar).x).toBeCloseTo(poseOf(byId(desk, chairId(seat))!).x);
    expect(poseOf(avatar).y).toBeCloseTo(poseOf(byId(desk, chairId(seat))!).y);
  });
});
