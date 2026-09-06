// THE CHAIRS — a place is a thing on the felt and not a thing that arrives with a person.
//
// Everything here is about the SPLIT: the ring stands at the place whatever the avatar is doing, it
// wears the place's own colour, and a place nobody holds is a different picture rather than a dimmer
// one. A desk that fails any of these is a desk where "who sits where" is only knowable while
// somebody happens to be looking at their own seat.

import { describe, expect, it } from "vitest";
import {
  add,
  Bounded,
  extentOf,
  footprint,
  node,
  rect,
  Transformable,
  AVATAR_VALUE,
  avatarId,
  avatarNode,
  homeTarget,
  byId,
  placeAvatars,
  type Presence,
  type ValuedFields,
  caps,
  fieldsOf,
  grippableBy,
  ridesFelt,
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
import {
  chairHome,
  chairId,
  chairNameId,
  chairSurface,
  isChair,
  mayTake,
  seatChair,
  setHandLock,
  setSeatHome,
  chairTickId,
  CHAIR,
  CHAIR_TICK,
  fitChair,
  standChair,
} from "./seatPlace.js";
import { growHand, handLocked, isHand } from "./handZone.js";
import { chairBarId } from "./handBar.js";

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
const angleOf = (n: Node) => fieldsOf<TransformableFields>(n, "Transformable")!.angle ?? 0;
/** Two turns as one number: 180 and -180 are the same lie. */
const apart = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);
const inkOf = (n: Node): unknown =>
  surfaceRecord(fieldsOf<SurfacedFields>(n, "Surfaced")!.surface)?.stroke?.color;
// The name is a NODE OF ITS OWN beside the ring, not a child of it: the ring arranges what is in it
// (`handLayout`), and a caption inside that row would be a word dealt into somebody's hand.
const captionOf = (desk: Node, seat: string): string | undefined =>
  fieldsOf<LabeledFields>(byId(desk, chairNameId(seat)) ?? desk, "Labeled")?.label;

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
        // A DESK THAT DEALS PUTS THE CARDS IN THE RING, and a board has nothing to put anywhere:
        // a man is on a square and nowhere else. The two pictures are one node either way.
        expect(caps(chair).has("Acceptor")).toBe(name === "round");
        expect(isHand(chair)).toBe(name === "round");
        // Its OWNER may move it, and only its owner: where a person sits is theirs to decide, and a
        // ring any passing finger could drag is a player being reseated by somebody else.
        expect(caps(chair).has("Draggable")).toBe(true);
        expect(mayTake(chair, seat)).toBe(true);
        for (const other of seats) if (other.seat !== seat) expect(mayTake(chair, other.seat)).toBe(false);
        // ...and the refusal is NOT a grip. A grip cuts the whole subtree, so a ring gripped to its
        // owner would be a hand nobody could ever be dealt from — which is what the LOCK is for.
        for (const other of seats) expect(grippableBy(chair, other.seat)).toBe(true);
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
        // The layer holds people AND the words under them: a caption is the ring's name and belongs
        // beside it, but never IN it (see `chairNameId`). The facing tick is beside a ring for the
        // very same reason and is allowed here on the very same ground (see `chairTickId`).
        for (const sibling of owner.children) {
          const named = byId(desk, chairNameId(sibling.id)) !== undefined || fieldsOf<LabeledFields>(sibling, "Labeled") !== undefined;
          const ticks = seats.some(({ seat }) => chairTickId(seat) === sibling.id);
          // ...and the bar's controls, the chair's furniture on the same ground (`handBar.ts`).
          const bar = seats.some(({ seat }) => chairBarId(seat) === sibling.id);
          expect(isChair(sibling) || isAvatar(sibling) || named || ticks || bar, `${owner.id} holds people only`).toBe(true);
        }
        // ...and the layer is not a place either: nothing arranges what is in it and nothing may be
        // dropped in it, or the layer would be the same fault one node further down.
        for (const atom of ["Container", "Acceptor", "Displacer", "Grabber", "Keeper"]) {
          expect(caps(owner).has(atom), `${owner.id} has no ${atom}`).toBe(false);
        }
      }

      // AND THE BOARD IS STILL WHOLE. Every man that was on a square is on the square he was on:
      // a disc that took a place would show up here as a piece short.
      const holders = walk(desk).filter((n) => caps(n).has("Acceptor") && !isChair(n));
      for (const holder of holders) {
        for (const child of holder.children) {
          expect(isChair(child) || isAvatar(child), `${holder.id} holds only what is played`).toBe(false);
        }
      }
    });
  }

  it("seat.an-empty-chair-has-no-name — a place nobody holds is an outline and says nothing", () => {
    const desk = roundMap();
    const free = seatChair("north", { at: { x: 0, y: -5 } });
    expect(captionOf(desk, SEATS[0]!.seat)).toBe(SEATS[0]!.seat);
    expect(byId(desk, chairId(SEATS[0]!.seat))!.children).toHaveLength(0);
    expect(free.children).toHaveLength(0);
    expect(captionOf(free, "north")).toBeUndefined();
    // ...and nothing may be put in one: an unheld place is nobody's hand.
    expect(caps(free).has("Acceptor")).toBe(false);
    expect(mayTake(free, "north"), "a place nobody holds is nobody's to move").toBe(true);
    // ...and it is DASHED and grey, rather than the same ring turned down: a place drawn in a
    // seat's colour is a place claimed for a player who is not there.
    expect(fieldsOf<SurfacedFields>(free, "Surfaced")?.surface).toBe(chairSurface());
    expect(surfaceRecord(chairSurface())?.stroke?.dash).toBeTruthy();
    expect(surfaceRecord(chairSurface())?.stroke?.color).not.toBe("accent");
  });

  it("seat.a-ring-rides-the-felt — a place is slid, never lifted and never thrown", () => {
    // A CHAIR IS NOT A CARD. The wiring tells the two apart by how the thing is CARRIED
    // (`ridesFelt`), and a ring that never said so was carried as a piece: a contour of a landing
    // appeared under a dragged seat and a flicked one flew off across the felt.
    const desk = roundMap();
    expect(ridesFelt(byId(desk, chairId(SEATS[0]!.seat))!), "a chair on a dealt desk slides").toBe(true);
    expect(ridesFelt(seatChair("north", { at: { x: 0, y: -5 } })), "…and so does a place nobody holds").toBe(true);
  });

  it("seat.the-ring-wears-its-own-facing — a tick on the rim, where that place looks", () => {
    // A RING IS SYMMETRIC, so on a round felt it says WHERE somebody sits and not which way round
    // they are sitting — and the seat opposite is looking at the same cards from the other end. The
    // place's own `facing` is the answer and it is already known when the chair is built.
    const desk = roundMap();
    const places = roundPlaces(SEATS.length);
    for (const [i, { seat }] of SEATS.entries()) {
      const tick = byId(desk, chairTickId(seat));
      expect(tick, `${seat} says which way it looks`).toBeDefined();
      const place = places[i]!;
      const rad = (place.facing * Math.PI) / 180;
      // ON THE RIM, in the direction of the look — the desk point that a glass turned by `facing`
      // puts straight ahead: `rotate(-facing)` of screen-up, which is (-sin, -cos). Written with the
      // sign the other way, a place at the right of the felt wore its tick on the OUTSIDE of the
      // ring, looking away from the desk it was sat at.
      expect(poseOf(tick!).x).toBeCloseTo(place.at.x - Math.sin(rad) * (CHAIR.d / 2));
      expect(poseOf(tick!).y).toBeCloseTo(place.at.y - Math.cos(rad) * (CHAIR.d / 2));
      // ...AND LYING ACROSS THE LOOK: level on its owner's own glass, which turns the desk by
      // `facing`, so on the desk it stands at `-facing` — the disc's own law (`avatarNode`).
      expect(apart(angleOf(tick!), -place.facing)).toBeCloseTo(0);
      // NOT A CHILD OF THE RING. The ring arranges what is IN it (`handLayout`), so a tick made a
      // child would be dealt into somebody's hand — the caption's own reason, twice over.
      expect(tick!.parent).not.toBe(byId(desk, chairId(seat)));
    }
    // A PLACE NOBODY HOLDS HAS NO DIRECTION: an outline is a place, not a person, and there is
    // nobody at it to be turned anywhere.
    expect(byId(roundMap([]), chairTickId("0"))).toBeUndefined();
    // ...AND IT TRAVELS WITH THE CHAIR, keeping its angle: dragging a ring moves a seat, it does
    // not turn it round.
    const moved = { x: 2, y: -3 };
    standChair(desk, SEATS[0]!.seat, moved);
    const rad0 = (places[0]!.facing * Math.PI) / 180;
    expect(poseOf(byId(desk, chairTickId(SEATS[0]!.seat))!).x).toBeCloseTo(moved.x - Math.sin(rad0) * (CHAIR.d / 2));
    expect(poseOf(byId(desk, chairTickId(SEATS[0]!.seat))!).y).toBeCloseTo(moved.y - Math.cos(rad0) * (CHAIR.d / 2));
    // ...AND TOLD A FACING, it goes round: the holder let go of the ring looking from 90°, and the
    // tick has to sit where THAT glass looks — on the ring's left on the desk, level on that glass.
    standChair(desk, SEATS[0]!.seat, moved, 90);
    const tick90 = byId(desk, chairTickId(SEATS[0]!.seat))!;
    expect(poseOf(tick90).x).toBeCloseTo(moved.x - (CHAIR.d / 2));
    expect(poseOf(tick90).y).toBeCloseTo(moved.y);
    expect(apart(angleOf(tick90), -90)).toBeCloseTo(0);
  });

  it("seat.the-chair-is-turned-to-its-facing — the box, and the row in it, stand square to their owner", () => {
    // A RING DOES NOT CARE, BUT A HAND DOES: the box a dealt place grows into is a row of cards, and a
    // row laid along the desk's own x is a hand its owner at the side of the table reads end-on. The
    // chair stands at `-facing`, the same turn the tick and the disc stand at, so what is IN it lies
    // level on its owner's own glass — and it is one number on one node, inherited by every card.
    const desk = roundMap();
    const places = roundPlaces(SEATS.length);
    for (const [i, { seat }] of SEATS.entries()) {
      expect(apart(angleOf(byId(desk, chairId(seat))!), -places[i]!.facing)).toBeCloseTo(0);
    }
    // ...AND IT GOES ROUND WHEN THE PLACE IS TURNED, with its tick: a place let go of under a turned
    // camera faces the way its holder looked, box and all.
    standChair(desk, SEATS[0]!.seat, { x: 1, y: 1 }, 90);
    expect(apart(angleOf(byId(desk, chairId(SEATS[0]!.seat))!), -90)).toBeCloseTo(0);
    // A PLACE NOBODY HOLDS HAS NO OWNER TO BE SQUARE TO, and stands as it was built.
    expect(angleOf(seatChair("north", { at: { x: 0, y: -5 } }))).toBe(0);
  });

  it("seat.the-tick-and-the-name-follow-the-box — a hand that grew keeps its furniture on its rim", () => {
    // THE TICK SITS ON THE RIM AND THE NAME HANGS UNDER IT. Both are measured from the chair's
    // centre, and a chair dealt to is no longer the mark it was built as: left at the ring's own
    // radius, the tick stood inside the box and the name lay across the bottom card. So both are
    // re-measured off the box the chair now IS (`fitChair`), on the owner's own side of it.
    const desk = roundMap();
    const seat = SEATS[0]!.seat;
    const chair = byId(desk, chairId(seat))!;
    const facing = roundPlaces(SEATS.length)[0]!.facing;
    const rad = (facing * Math.PI) / 180;
    for (let i = 0; i < 3; i += 1) add(chair, node(`c${i}`, Bounded({ bounds: rect(1, 1.4) }), Transformable({ at: { x: 0, y: 0 } })));
    growHand(chair);
    fitChair(desk, seat);
    const reach = extentOf(footprint(chair)!).h / 2;
    const at = poseOf(chair);
    const tick = poseOf(byId(desk, chairTickId(seat))!);
    expect(Math.hypot(tick.x - at.x, tick.y - at.y), "the tick is on the box's rim").toBeCloseTo(reach);
    expect(tick.x).toBeCloseTo(at.x - Math.sin(rad) * reach);
    const name = poseOf(byId(desk, chairNameId(seat))!);
    expect(name.y - at.y, "the name hangs under the box, on the owner's side").toBeCloseTo(Math.cos(rad) * (reach + CHAIR.caption.gap));
    expect(name.x - at.x).toBeCloseTo(Math.sin(rad) * (reach + CHAIR.caption.gap));
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
        // AIMED SO THE RING STANDS ON THE HOME ANCHOR — which is what "looking at one's own place"
        // now means, and it is no longer the middle of the glass (`HOME_ANCHOR`).
        view: { target: homeTarget(place, { zoom: 1, rotation: 0, glass: { w: 400, h: 800 } }), zoom: 1, rotation: 0, glass: { w: 400, h: 800 } },
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

describe("a seat says whether its owner is looking at it", () => {
  it("seat.home-fills-the-ring — and away it is the bare outline again", () => {
    // THE ONE PICTURE THAT REPLACES THE DISC. A person at their own place has no avatar drawn
    // (`placeAvatars` skips them), so the ring has to say by itself that somebody is in it — and
    // "filled with their own ink" is the only thing an outline can become without becoming a
    // different shape.
    const desk = roundMap();
    const seat = SEATS[0]!.seat;
    const ring = byId(desk, chairId(seat))!;
    expect(chairHome(ring)).toBe(false);
    const away = fieldsOf<SurfacedFields>(ring, "Surfaced")!.surface;
    expect(surfaceRecord(away)!.layers, "an outline is what a place IS").toHaveLength(0);

    setSeatHome(ring, true);
    expect(chairHome(ring)).toBe(true);
    const home = fieldsOf<SurfacedFields>(ring, "Surfaced")!.surface;
    expect(home).not.toBe(away);
    expect(surfaceRecord(home)!.layers.length, "home is filled").toBeGreaterThan(0);
    expect(surfaceRecord(home)!.stroke?.color, "and it is still the same place").toBe(SEATS[0]!.ink);

    setSeatHome(ring, false);
    expect(fieldsOf<SurfacedFields>(ring, "Surfaced")!.surface).toBe(away);
  });

  it("seat.home-and-the-lock-are-two-facts-and-one-picture — neither paints over the other", () => {
    // Written separately they would: the second call would decide the whole surface, and a shut
    // hand would come open to the eye the moment its owner looked at it.
    const desk = roundMap();
    const ring = byId(desk, chairId(SEATS[0]!.seat))!;
    setSeatHome(ring, true);
    setHandLock(ring, true);
    expect(chairHome(ring)).toBe(true);
    expect(handLocked(ring)).toBe(true);
    expect(fieldsOf<SurfacedFields>(ring, "Surfaced")!.surface).toBe(
      chairSurface(SEATS[0]!.seat, { home: true, shut: true }),
    );
  });

  it("seat.the-name-travels-with-the-place — a caption left behind is a name lying on empty felt", () => {
    const desk = roundMap();
    const seat = SEATS[0]!.seat;
    standChair(desk, seat, { x: -2, y: 3 });
    const name = byId(desk, chairNameId(seat))!;
    expect(poseOf(name).x).toBeCloseTo(-2);
    expect(poseOf(name).y).toBeGreaterThan(3);
  });
});
