// THE RIGHTS OF A PLACE — the marks beside a chair on the felt, and the controls on the owner's
// glass, and the one place a finger says "shut my hand", "hide it", "turn it over", "nobody moves
// my chair", "fan it", "put it on my screen".
//
// Arithmetic and data: where the controls stand comes off the glass, what they mean comes off
// `Valued`, and what they show comes off the chair's own state. Nothing here needs a glass; the
// press itself is the kit's (`wireButtons`), and the answer to it is the people wiring's
// (`Avatars.pressed`), which has its own checks.

import { describe, expect, it } from "vitest";
import { add, Bounded, byId, caps, fieldsOf, node, rect, Transformable, type Node, type SurfacedFields, type TransformableFields } from "game-kit";
import { BAR, BAR_POSES, BAR_RIGHTS, barExtent, barPress, chairBarGroupId, chairBarId, chairButtonId, dressBar, fitBar, seatBar, type BarWhat } from "./handBar.js";
import { handPose, setHandHidden, setHandPose } from "./handZone.js";
import { chairId, mayTake, roundMap, seatChair, setChairPin, setHandLock, chairPinned } from "./index.js";
import { SEATS } from "./liveMap.js";

const poseOf = (n: Node) => fieldsOf<TransformableFields>(n, "Transformable")!.at!;

describe("the controls of a hand", () => {
  it("bar.the-controls-stand-in-two-groups-at-the-foot-of-the-glass — the rights on the left, the poses and the glass on the right", () => {
    const desk = roundMap();
    const seat = SEATS[0]!.seat;
    const chair = byId(desk, chairId(seat))!;
    const made = seatBar(seat, chair, SEATS[0]!.ink);
    expect(made).toHaveLength(1);
    const bar = made[0]!;
    expect(bar.id).toBe(chairBarId(seat));
    // NOT ON THE FELT: the bar is built for a glass, and a desk that seats somebody carries none.
    expect(byId(desk, chairBarId(seat))).toBeUndefined();
    const rights = byId(bar, chairBarGroupId(seat, "rights"))!;
    const poses = byId(bar, chairBarGroupId(seat, "poses"))!;
    expect(rights.children.map((c) => c.id)).toEqual(BAR_RIGHTS.map((what) => chairButtonId(seat, what)));
    expect(poses.children.map((c) => c.id)).toEqual(BAR_POSES.map((what) => chairButtonId(seat, what)));
    for (const c of [...rights.children, ...poses.children]) {
      expect(caps(c).has("Pressable"), "a control answers a finger").toBe(true);
      // ...AND EACH SAYS WHAT IT IS FOR, and whose: the press reads it back and never parses an id.
      expect(barPress(c)?.seat).toBe(seat);
    }
    expect(rights.children.map((c) => barPress(c)!.what)).toEqual(BAR_RIGHTS);
    expect(poses.children.map((c) => barPress(c)!.what)).toEqual(BAR_POSES);
    // THE RIGHTS IN A ROW from the group's left edge, a step apart; the poses two by two from its
    // right edge — so each group is placed by the corner it stands in.
    const step = BAR.size + BAR.gap;
    rights.children.forEach((c, i) => {
      expect(poseOf(c).x).toBeCloseTo(BAR.size / 2 + step * i);
      expect(poseOf(c).y).toBeCloseTo(-BAR.size / 2);
    });
    expect(poseOf(poses.children[1]!)).toEqual({ x: -BAR.size / 2, y: -BAR.size / 2 - step });
    expect(poseOf(poses.children[0]!).x).toBeCloseTo(-BAR.size / 2 - step);
    expect(poseOf(poses.children[0]!).y).toBeCloseTo(-BAR.size / 2 - step);
    expect(poseOf(poses.children[2]!), "tuck under the two").toEqual({ x: -BAR.size / 2 - step, y: -BAR.size / 2 });
    // PUT AT THE FOOT OF A GLASS: the corners, a margin in.
    const screen = node("screen");
    add(screen, bar);
    fitBar(screen, seat, { w: 6, h: 12 }, 0.2);
    expect(poseOf(rights)).toEqual({ x: -3 + 0.2, y: 6 - 0.2 });
    expect(poseOf(poses)).toEqual({ x: 3 - 0.2, y: 6 - 0.2 });
    expect(barExtent("rights").w).toBeCloseTo(BAR.size + step * (BAR_RIGHTS.length - 1));
    expect(barExtent("poses").h).toBeCloseTo(BAR.size + step);
    // A PLACE NOBODY HOLDS HAS NO CONTROLS: there is nobody to press them.
    const free = seatChair("north", { at: { x: 0, y: -5 } });
    expect(seatBar("north", free, "accent")).toHaveLength(0);
    // ...AND A BOARD DOES NOT EITHER — controls about a hand belong to a desk that deals.
    const bare = seatChair("north", { at: { x: 0, y: -5 }, facing: 180 }, { ink: "accent" });
    expect(seatBar("north", bare, "accent")).toHaveLength(0);
  });

  it("bar.the-states-show-on-the-controls — gold while on, dark while off, read off the chair; a flip never lights", () => {
    const desk = roundMap();
    const seat = SEATS[0]!.seat;
    const chair = byId(desk, chairId(seat))!;
    const screen = node("screen");
    for (const one of seatBar(seat, chair, SEATS[0]!.ink)) add(screen, one);
    const plate = (what: BarWhat): string => fieldsOf<SurfacedFields>(byId(screen, chairButtonId(seat, what))!, "Surfaced")!.surface;
    const lit = (what: BarWhat): boolean => plate(what) !== plate("flip");
    dressBar(screen, seat, chair);
    // THE FOLD THAT IS ON IS THE HAND'S OWN POSE — a stack on the right, to open with.
    expect(handPose(chair).fold).toBe("shrink");
    expect([lit("pin"), lit("lock"), lit("hide"), lit("flip"), lit("fan"), lit("shrink"), lit("tuck")]).toEqual([false, false, false, false, false, true, false]);
    setHandLock(chair, true);
    setHandHidden(chair, true);
    setChairPin(chair, true);
    setHandPose(chair, { side: "front", fold: "fan" });
    dressBar(screen, seat, chair);
    expect([lit("pin"), lit("lock"), lit("hide"), lit("flip"), lit("fan"), lit("shrink"), lit("tuck")]).toEqual([true, true, true, false, true, false, false]);
    // A LIT CONTROL IS THE SAME CONTROL: same id, same meaning, in the same place in its row.
    expect(barPress(byId(screen, chairButtonId(seat, "lock"))!)).toEqual({ seat, what: "lock" });
    expect(byId(screen, chairBarGroupId(seat, "rights"))!.children.map((c) => c.id)).toEqual(BAR_RIGHTS.map((what) => chairButtonId(seat, what)));
    setHandLock(chair, false);
    dressBar(screen, seat, chair);
    expect([lit("lock"), lit("hide"), lit("pin")]).toEqual([false, true, true]);
  });

  it("seat.a-pinned-chair-moves-for-nobody — its owner included, and the hand in it is untouched", () => {
    // A SEPARATE STATE FROM THE LOCK: a player may open their cards and still not want to be moved,
    // or shut them and not mind. Pinned, the chair refuses every finger; the cards in it answer to
    // the lock alone.
    const desk = roundMap();
    const seat = SEATS[0]!.seat;
    const chair = byId(desk, chairId(seat))!;
    expect(chairPinned(chair)).toBe(false);
    expect(mayTake(chair, seat)).toBe(true);
    setChairPin(chair, true);
    expect(chairPinned(chair)).toBe(true);
    expect(mayTake(chair, seat)).toBe(false);
    add(chair, node("held", Bounded({ bounds: rect(1, 1.4) }), Transformable({ at: { x: 0, y: 0 } })));
    expect(mayTake(byId(desk, "held")!, "north"), "the cards answer to the lock, not the pin").toBe(true);
    setChairPin(chair, false);
    expect(mayTake(chair, seat)).toBe(true);
  });
});
