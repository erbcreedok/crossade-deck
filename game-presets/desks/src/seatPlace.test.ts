// THE CHAIRS — a place is a thing on the felt and not a thing that arrives with a person.
//
// Everything here is about the SPLIT: the chair stands at the place whatever the avatar is doing, it
// wears the place's own colour, and a place nobody holds is a different picture rather than a dimmer
// one. A desk that fails any of these is a desk where "who sits where" is only knowable while
// somebody happens to be looking at their own seat.

import { describe, expect, it } from "vitest";
import {
  add,
  Bounded,
  node,
  rect,
  Transformable,
  AVATAR_VALUE,
  avatarId,
  avatarNode,
  homeTarget,
  byId,
  outlineOf,
  placeAvatars,
  type Presence,
  type ValuedFields,
  caps,
  fieldsOf,
  grippableBy,
  ridesFelt,
  surfaceRecord,
  type Node,
  type SurfacedFields,
  type TransformableFields,
} from "game-kit";
import { CHESS_SEATS, chessMap, seatPlaces as chessPlaces } from "./chessMap.js";
import { NARDY_SEATS, nardyMap, seatPlaces as nardyPlaces } from "./nardyMap.js";
import { roundMap, seatPlaces as roundPlaces } from "./roundMap.js";
import { SEATS } from "./liveMap.js";
import {
  arch,
  chairHome,
  chairId,
  chairLidId,
  chairLidSurface,
  chairRingId,
  chairSurface,
  dressChair,
  isChair,
  mayTake,
  seatChair,
  seatChairs,
  setHandLock,
  setSeatHome,
  CHAIR,
  standChair,
} from "./seatPlace.js";
import { handLocked, isHand } from "./handZone.js";
import { chairMarkId, chairMarks, MARK } from "./handBar.js";
import { setChairPin } from "./seatPlace.js";

const walk = (n: Node): Node[] => [n, ...n.children.flatMap(walk)];
// Walked and not read off `desk.children`: a chair lives in the seats' own layer (`CHAIR_LAYER`), so
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
/** The ink of a held place is the rim of its face (`chairLidSurface`), inside the black keyline. */
const inkOf = (desk: Node, seat: string): unknown =>
  surfaceRecord(fieldsOf<SurfacedFields>(byId(desk, chairLidId(seat))!, "Surfaced")!.surface)?.stroke?.color;

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
        // WHERE THE PLACE IS, and not a second opinion about it: the chair and the idle glide read
        // one answer (`seatPlaces`), or a view returning home lands beside the chair it came from.
        expect(poseOf(chair).x).toBeCloseTo(places[i]!.at.x);
        expect(poseOf(chair).y).toBeCloseTo(places[i]!.at.y);
        // A DESK THAT DEALS PUTS THE CARDS IN THE CHAIR, and a board has nothing to put anywhere:
        // a man is on a square and nowhere else. The two pictures are one node either way.
        expect(caps(chair).has("Acceptor")).toBe(name === "round");
        expect(isHand(chair)).toBe(name === "round");
        // Its OWNER may move it, and only its owner: where a person sits is theirs to decide, and a
        // chair any passing finger could drag is a player being reseated by somebody else.
        expect(caps(chair).has("Draggable")).toBe(true);
        expect(mayTake(chair, seat)).toBe(true);
        for (const other of seats) if (other.seat !== seat) expect(mayTake(chair, other.seat)).toBe(false);
        // ...and the refusal is NOT a grip. A grip cuts the whole subtree, so a chair gripped to its
        // owner would be a hand nobody could ever be dealt from — which is what the LOCK is for.
        for (const other of seats) expect(grippableBy(chair, other.seat)).toBe(true);
      });
    });

    it(`seat.the-chair-wears-the-place-ink — ${name}: the rim of the arch, inside the black keyline`, () => {
      const desk = build();
      seats.forEach(({ seat, ink }) => {
        expect(inkOf(desk, seat)).toBe(ink);
        // THE CHAIR ITSELF IS THE KEYLINE, one black plate under every place, and the ink is the face
        // over it: a chair drawn in one node could not have a keyline OUTSIDE its own rim.
        expect(surfaceRecord(chairSurface(seat))?.layers.length).toBeGreaterThan(0);
        expect(surfaceRecord(chairLidSurface(seat))?.stroke?.alignment, "the rim is inside the keyline").toBe(1);
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

    it(`seat.people-are-not-pieces — ${name} keeps discs and chairs out of the game's own tree`, () => {
      // THE FAULT THIS EXISTS FOR: a disc placed among the desk's own children is a piece to
      // everything that reads them — an arrangement seats it, a square's `Displacer` sends whoever
      // stands there away, an `Acceptor` counts it as what is now in the place. On a board that is
      // an avatar standing on e4 instead of a man. Parentage is the whole of the answer, so it is
      // parentage that is checked: neither the desk itself nor anything that holds a piece may own
      // a disc or a chair.
      const desk = build();
      placeAvatars(desk, seats.map(({ seat, ink }) => person(seat, ink)));

      const people = walk(desk).filter((n) => isChair(n) || isAvatar(n));
      expect(people.length, "the desk seats somebody at all").toBe(seats.length * 2);
      for (const one of people) {
        const owner = one.parent!;
        expect(owner, `${one.id} does not stand in the desk's own list`).not.toBe(desk);
        // The layer holds people AND the chair's own furniture: the face over a chair, the gold
        // ring under one's own, the marks beside it — all of it beside the chair, never IN it, because
        // the chair arranges what is in it as cards.
        for (const sibling of owner.children) {
          const furniture = seats.some(
            ({ seat }) => chairLidId(seat) === sibling.id || chairRingId(seat) === sibling.id || chairMarks(desk, seat).includes(sibling),
          );
          expect(isChair(sibling) || isAvatar(sibling) || furniture, `${owner.id} holds people only`).toBe(true);
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

  it("seat.an-empty-chair-is-an-outline — dashed, in cream, with no face and nothing in it", () => {
    const desk = roundMap();
    const free = seatChair("north", { at: { x: 0, y: -5 } });
    expect(byId(desk, chairId(SEATS[0]!.seat))!.children).toHaveLength(0);
    expect(free.children).toHaveLength(0);
    // ...and nothing may be put in one: an unheld place is nobody's hand.
    expect(caps(free).has("Acceptor")).toBe(false);
    expect(mayTake(free, "north"), "a place nobody holds is nobody's to move").toBe(true);
    // ...and it is DASHED and cream, rather than the same chair turned down: a place drawn in a
    // seat's colour is a place claimed for a player who is not there.
    expect(fieldsOf<SurfacedFields>(free, "Surfaced")?.surface).toBe(chairSurface());
    expect(surfaceRecord(chairSurface())?.stroke?.dash).toBeTruthy();
    expect(surfaceRecord(chairSurface())?.stroke?.color).not.toBe("accent");
    expect(surfaceRecord(chairSurface())?.layers).toHaveLength(0);
    // ...AND NO FACE OVER IT: the wood and the rim are a held place's.
    const bare = node("bare desk");
    seatChairs(bare, [{ at: { x: 0, y: 0 }, facing: 0 }], []);
    expect(byId(bare, chairId("0"))).toBeDefined();
    expect(byId(bare, chairLidId("0"))).toBeUndefined();
  });

  it("seat.a-chair-rides-the-felt — a place is slid, never lifted and never thrown", () => {
    // A CHAIR IS NOT A CARD. The wiring tells the two apart by how the thing is CARRIED
    // (`ridesFelt`), and a chair that never said so was carried as a piece: a contour of a landing
    // appeared under a dragged seat and a flicked one flew off across the felt.
    const desk = roundMap();
    expect(ridesFelt(byId(desk, chairId(SEATS[0]!.seat))!), "a chair on a dealt desk slides").toBe(true);
    expect(ridesFelt(seatChair("north", { at: { x: 0, y: -5 } })), "…and so does a place nobody holds").toBe(true);
  });

  it("seat.the-arch-looks-where-the-place-looks — a round front into the desk, a flat back at the owner", () => {
    // THE SHAPE SAYS THE DIRECTION, so the chair wears no tick. The arch's round side is -y in its
    // own frame and its flat side +y, and the chair stands at `-facing` — the disc's own turn — so a
    // glass turned by the facing sees the round front straight ahead, into the desk.
    const shape = outlineOf(arch(CHAIR.d / 2));
    expect(Math.min(...shape.map((p) => p.y))).toBeCloseTo(-CHAIR.d / 2, 1);
    expect(Math.max(...shape.map((p) => p.y))).toBeCloseTo(CHAIR.d / 2, 1);
    // Round on top: the widest point of the top half is at its middle, the flat bottom is full width.
    const bottom = shape.filter((p) => Math.abs(p.y - CHAIR.d / 2) < 1e-6);
    expect(Math.max(...bottom.map((p) => p.x))).toBeCloseTo(CHAIR.d / 2);
    const desk = roundMap();
    const places = roundPlaces(SEATS.length);
    for (const [i, { seat }] of SEATS.entries()) {
      expect(apart(angleOf(byId(desk, chairId(seat))!), -places[i]!.facing)).toBeCloseTo(0);
      // ...AND THE FACE OVER IT STANDS AS IT STANDS: same place, same turn, a node of its own.
      const lid = byId(desk, chairLidId(seat))!;
      expect(lid.parent).not.toBe(byId(desk, chairId(seat)));
      expect(poseOf(lid)).toEqual(poseOf(byId(desk, chairId(seat))!));
      expect(apart(angleOf(lid), angleOf(byId(desk, chairId(seat))!))).toBeCloseTo(0);
    }
    // ...AND IT GOES ROUND WHEN THE PLACE IS TURNED, face and all: a place let go of under a turned
    // camera faces the way its holder looked.
    standChair(desk, SEATS[0]!.seat, { x: 1, y: 1 }, 90);
    expect(apart(angleOf(byId(desk, chairId(SEATS[0]!.seat))!), -90)).toBeCloseTo(0);
    expect(apart(angleOf(byId(desk, chairLidId(SEATS[0]!.seat))!), -90)).toBeCloseTo(0);
    expect(poseOf(byId(desk, chairLidId(SEATS[0]!.seat))!)).toEqual({ x: 1, y: 1 });
    // A PLACE NOBODY HOLDS HAS NO OWNER TO BE SQUARE TO, and stands as it was built.
    expect(angleOf(seatChair("north", { at: { x: 0, y: -5 } }))).toBe(0);
  });

  it("seat.the-marks-stand-beside-the-chair — one per state that is on, in a column on the owner's left", () => {
    // THE RIGHTS ARE MARKS ON THE FELT, not controls: a pin, a padlock, a struck eye, each up only
    // while its state is on — absence is the refusal — so the whole table reads WHY a card will not
    // come out before anybody reaches for it. On the owner's LEFT, in the chair's own frame.
    const desk = roundMap();
    const seat = SEATS[0]!.seat;
    const chair = byId(desk, chairId(seat))!;
    expect(chairMarks(desk, seat)).toEqual([]);
    setChairPin(chair, true);
    dressChair(chair, {});
    expect(chairMarks(desk, seat).map((n) => n.id)).toEqual([chairMarkId(seat, "pin")]);
    setHandLock(chair, true);
    const up = chairMarks(desk, seat);
    expect(up.map((n) => n.id)).toEqual([chairMarkId(seat, "pin"), chairMarkId(seat, "lock")]);
    // Beside the chair, on its left, a step apart and centred on the arch's middle — turned with it.
    const at = poseOf(chair);
    const rad = (angleOf(chair) * Math.PI) / 180;
    up.forEach((markNode, k) => {
      const local = { x: MARK.x, y: (k - 0.5) * MARK.step };
      expect(poseOf(markNode).x).toBeCloseTo(at.x + local.x * Math.cos(rad) - local.y * Math.sin(rad));
      expect(poseOf(markNode).y).toBeCloseTo(at.y + local.x * Math.sin(rad) + local.y * Math.cos(rad));
      expect(apart(angleOf(markNode), angleOf(chair))).toBeCloseTo(0);
      expect(markNode.parent, "beside the chair, in its layer").toBe(chair.parent);
    });
    // ...AND THEY GO WITH THE CHAIR.
    standChair(desk, seat, { x: -2, y: 2 }, 0);
    expect(poseOf(chairMarks(desk, seat)[0]!).x).toBeCloseTo(-2 + MARK.x);
    // ...AND DOWN WHEN THE STATE IS OFF.
    setChairPin(chair, false);
    setHandLock(chair, false);
    expect(chairMarks(desk, seat)).toEqual([]);
    // A BOARD'S CHAIR HAS NO HAND AND SO NO MARKS: there is nothing in it to lock or hide.
    const board = chessMap();
    const white = byId(board, chairId(CHESS_SEATS[0]!.seat))!;
    setChairPin(white, true);
    dressChair(white, {});
    expect(chairMarks(board, CHESS_SEATS[0]!.seat)).toEqual([]);
  });

  it("seat.the-avatar-opens-on-its-own-chair — the disc stands IN the arch, not beside it", () => {
    const desk = roundMap();
    const place = roundPlaces(SEATS.length)[0]!;
    const seat = SEATS[0]!.seat;
    // A presence with a place, looking AT that place — what every consumer opens with, and the one
    // thing that makes the chair and the disc read as one picture.
    const avatar = avatarNode({
      seat,
      place,
      name: "A",
      ink: SEATS[0]!.ink,
      state: "online",
      holding: false,
      // AIMED SO THE CHAIR STANDS ON THE HOME ANCHOR — which is what "looking at one's own place"
      // now means, and it is no longer the middle of the glass (`HOME_ANCHOR`).
      view: { target: homeTarget(place, { zoom: 1, rotation: 0, glass: { w: 400, h: 800 } }), zoom: 1, rotation: 0, glass: { w: 400, h: 800 } },
    });
    expect(avatar.id).toBe(avatarId(seat));
    expect(poseOf(avatar).x).toBeCloseTo(poseOf(byId(desk, chairId(seat))!).x);
    expect(poseOf(avatar).y).toBeCloseTo(poseOf(byId(desk, chairId(seat))!).y);
  });
});

describe("a seat can be moved", () => {
  it("seat.a-place-goes-where-its-owner-put-it — and the chair on every screen goes with it", () => {
    // The chair is the ANCHOR, so moving it IS moving the seat: one writer (`standChair`), fed the
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

describe("a seat says what is true of it", () => {
  it("seat.home-is-a-fact-on-the-chair — and the picture of it is the disc in the arch, not a fill", () => {
    // BOTH SCREENS READ IT OFF THE NODE. What it looks like is the disc standing in the arch
    // (`placeAvatars`); the chair's own paint does not move, because a chair that changed colour
    // when its owner looked at it would be a second answer to "whose place is this".
    const desk = roundMap();
    const seat = SEATS[0]!.seat;
    const chair = byId(desk, chairId(seat))!;
    expect(chairHome(chair)).toBe(false);
    const paint = fieldsOf<SurfacedFields>(chair, "Surfaced")!.surface;
    setSeatHome(chair, true);
    expect(chairHome(chair)).toBe(true);
    expect(fieldsOf<SurfacedFields>(chair, "Surfaced")!.surface).toBe(paint);
    setSeatHome(chair, false);
    expect(chairHome(chair)).toBe(false);
  });

  it("seat.mine-is-a-gold-ring-outside-the-keyline — written by the screen that knows whose it is", () => {
    // ONE'S OWN PLACE DOES NOT CHANGE COLOUR: the rim stays the place's ink, or in a room of four
    // nobody could tell their colour from the chair. "This is me" is a separate ring, under the
    // chair and outside its keyline — and a fact of the SCREEN, so it is put up by `dressChair`
    // and never sent.
    const desk = roundMap();
    const seat = SEATS[0]!.seat;
    const chair = byId(desk, chairId(seat))!;
    expect(byId(desk, chairRingId(seat))).toBeUndefined();
    dressChair(chair, { mine: true });
    const ring = byId(desk, chairRingId(seat))!;
    expect(ring).toBeDefined();
    expect(ring.parent).toBe(chair.parent);
    expect(chair.parent!.children.indexOf(ring), "under the chair").toBeLessThan(chair.parent!.children.indexOf(chair));
    expect(surfaceRecord(fieldsOf<SurfacedFields>(ring, "Surfaced")!.surface)?.layers[0]?.paint).toBe("accent");
    expect(poseOf(ring)).toEqual(poseOf(chair));
    // ...AND IT FOLLOWS THE CHAIR, AND COMES DOWN.
    standChair(desk, seat, { x: 2, y: -1 });
    expect(poseOf(byId(desk, chairRingId(seat))!)).toEqual({ x: 2, y: -1 });
    dressChair(chair, { mine: false });
    expect(byId(desk, chairRingId(seat))).toBeUndefined();
    // The rim's ink is untouched by any of it.
    expect(inkOf(desk, seat)).toBe(SEATS[0]!.ink);
  });

  it("seat.home-and-the-lock-are-two-facts — neither writes over the other", () => {
    // Written separately they would: the second call would decide the whole record, and a shut
    // hand would come open the moment its owner looked at it.
    const desk = roundMap();
    const chair = byId(desk, chairId(SEATS[0]!.seat))!;
    setSeatHome(chair, true);
    setHandLock(chair, true);
    expect(chairHome(chair)).toBe(true);
    expect(handLocked(chair)).toBe(true);
    setSeatHome(chair, false);
    expect(handLocked(chair), "the lock survives a look away").toBe(true);
    expect(chairHome(chair)).toBe(false);
  });

  it("seat.a-chair-is-one-size-whatever-it-holds — the arch, and the cards lie about it", () => {
    // THE CHAIR DOES NOT GROW. Dealt to, it is the same arch; where the cards go is the pose's
    // business (`handZone.ts`), and a chair that grew into a box around them was a chair that
    // changed shape every time somebody was dealt a card.
    const desk = roundMap();
    const chair = byId(desk, chairId(SEATS[0]!.seat))!;
    const before = outlineOf(fieldsOf<{ bounds: never }>(chair, "Bounded")!.bounds);
    for (let i = 0; i < 5; i += 1) add(chair, node(`c${i}`, Bounded({ bounds: rect(1, 1.4) }), Transformable({ at: { x: 0, y: 0 } })));
    dressChair(chair, {});
    expect(outlineOf(fieldsOf<{ bounds: never }>(chair, "Bounded")!.bounds)).toEqual(before);
  });
});
