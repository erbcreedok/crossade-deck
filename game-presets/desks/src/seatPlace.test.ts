// THE CHAIRS — a place is a thing on the felt and not a thing that arrives with a person.
//
// Everything here is about the SPLIT: the ring stands at the place whatever the avatar is doing, it
// wears the place's own colour, and a place nobody holds is a different picture rather than a dimmer
// one. A desk that fails any of these is a desk where "who sits where" is only knowable while
// somebody happens to be looking at their own seat.

import { describe, expect, it } from "vitest";
import {
  AVATAR_VALUE,
  avatarId,
  avatarNode,
  byId,
  placeAvatars,
  type Presence,
  type ValuedFields,
  caps,
  fieldsOf,
  grippableBy,
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
import { chairId, chairSurface, isChair, seatChair, standChair } from "./seatPlace.js";

const walk = (n: Node): Node[] => [n, ...n.children.flatMap(walk)];
// Walked and not read off `desk.children`: a ring lives in the seats' own layer (`CHAIR_LAYER`), so
// that it is never a piece of the desk to whatever reads the desk's children.
const chairs = (desk: Node): Node[] => walk(desk).filter(isChair);
/** A disc says it is one; the layer test reads that and never the shape of an id. */
const isAvatar = (n: Node): boolean => Boolean(fieldsOf<ValuedFields>(n, "Valued")?.values[AVATAR_VALUE]);
/** Somebody sitting at a place and looking at it — the opening state of every live page. */
const person = (seat: string, ink: string): Presence => ({
  seat,
  name: seat,
  ink,
  state: "online",
  holding: false,
  view: { target: { x: 0, y: 0 }, zoom: 50, rotation: 0, glass: { w: 400, h: 800 } },
});
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
        // Nothing may be dropped IN a chair — it is not a place a card may go.
        expect(caps(chair).has("Acceptor")).toBe(false);
        // ...but its OWNER may move it, and only its owner: where a person sits is theirs to decide,
        // and a ring any passing finger could drag is a player being reseated by somebody else.
        expect(caps(chair).has("Draggable")).toBe(true);
        expect(grippableBy(chair, seat)).toBe(true);
        for (const other of seats) if (other.seat !== seat) expect(grippableBy(chair, other.seat)).toBe(false);
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
      const order = walk(desk);
      const last = chairs(desk).reduce((n, chair) => Math.max(n, order.indexOf(chair)), -1);
      // The chairs themselves are draggable now (their own owner moves them), so "a piece" is what
      // is PLAYED on the desk — everything else that may be lifted.
      const pieces = order.filter((n) => caps(n).has("Draggable") && !isChair(n));
      expect(pieces.length, "a desk with nothing on it proves nothing about what is under what").toBeGreaterThan(0);
      for (const piece of pieces) expect(order.indexOf(piece)).toBeGreaterThan(last);
    });

    it(`seat.people-are-not-pieces — ${name} keeps discs and rings out of the game's own tree`, () => {
      // THE FAULT THIS EXISTS FOR: a disc placed among the desk's own children is a piece to
      // everything that reads them — an arrangement seats it, a square's `Displacer` sends whoever
      // stands there away, an `Acceptor` counts it as what is now in the place. On a board that is
      // an avatar standing on e4 instead of a man. Parentage is the whole of the answer, so it is
      // parentage that is checked: neither the desk itself nor anything that holds a piece may own
      // a disc or a ring.
      const desk = build();
      placeAvatars(desk, seats.map(({ seat, ink }) => person(seat, ink)));

      const people = walk(desk).filter((n) => isChair(n) || isAvatar(n));
      expect(people.length, "the desk seats somebody at all").toBe(seats.length * 2);
      for (const one of people) {
        const owner = one.parent!;
        expect(owner, `${one.id} does not stand in the desk's own list`).not.toBe(desk);
        for (const sibling of owner.children) {
          expect(isChair(sibling) || isAvatar(sibling), `${owner.id} holds people only`).toBe(true);
        }
        // ...and the layer is not a place either: nothing arranges what is in it and nothing may be
        // dropped in it, or the layer would be the same fault one node further down.
        for (const atom of ["Container", "Acceptor", "Displacer", "Grabber", "Keeper"]) {
          expect(caps(owner).has(atom), `${owner.id} has no ${atom}`).toBe(false);
        }
      }

      // AND THE BOARD IS STILL WHOLE. Every man that was on a square is on the square he was on:
      // a disc that took a place would show up here as a piece short.
      const holders = walk(desk).filter((n) => caps(n).has("Acceptor"));
      for (const holder of holders) {
        for (const child of holder.children) {
          expect(isChair(child) || isAvatar(child), `${holder.id} holds only what is played`).toBe(false);
        }
      }
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
    // A presence with a place, looking AT that place — what every consumer opens with, and the one
    // thing that makes the ring and the disc read as one picture.
    const avatar = avatarNode(
      {
        seat,
        place,
        name: "A",
        ink: SEATS[0]!.ink,
        state: "online",
        holding: false,
        view: { target: place.at, zoom: 1, rotation: 0, glass: { w: 400, h: 800 } },
      },
    );
    expect(avatar.id).toBe(avatarId(seat));
    expect(poseOf(avatar).x).toBeCloseTo(poseOf(byId(desk, chairId(seat))!).x);
    expect(poseOf(avatar).y).toBeCloseTo(poseOf(byId(desk, chairId(seat))!).y);
  });
});

describe("a seat can be moved", () => {
  it("seat.a-place-goes-where-its-owner-put-it — and the chair on every screen goes with it", () => {
    // The ring is the ANCHOR, so moving it IS moving the seat: one writer (`standChair`), fed the
    // place both screens read off `Presence.place`, or the two desks disagree about who sits where.
    const desk = roundMap();
    const seat = SEATS[0]!.seat;
    const was = poseOf(byId(desk, chairId(seat))!);
    standChair(desk, seat, { x: -2, y: 3 });
    expect(poseOf(byId(desk, chairId(seat))!)).toEqual({ x: -2, y: 3 });
    expect(poseOf(byId(desk, chairId(seat))!)).not.toEqual(was);
    // A seat nobody has heard of is skipped rather than thrown at: an unknown name must not take
    // the desk down with it (CANONS §1).
    expect(() => standChair(desk, "nobody", { x: 0, y: 0 })).not.toThrow();
  });
});
