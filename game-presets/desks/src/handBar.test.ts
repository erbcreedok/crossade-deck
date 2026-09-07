// THE BAR ABOVE A HAND — the controls on the far rim of the owner's place, and the one place a
// finger says "shut my hand", "hide it", "turn it over", "nobody moves my chair".
//
// Arithmetic and data: where the controls stand comes off the chair's own pose and reach, what
// they mean comes off `Valued`, and what they show comes off the chair's own state. Nothing here
// needs a glass; the press itself is the kit's (`wireButtons`), and the answer to it is the people
// wiring's (`Avatars.pressed`), which has its own checks.

import { describe, expect, it } from "vitest";
import { add, Bounded, byId, caps, fieldsOf, node, rect, Transformable, type CoatedFields, type Node, type TransformableFields } from "game-kit";
import { BAR, barPress, chairBarId, chairButtonId, dressBar, seatBar } from "./handBar.js";
import { growHand, setHandHidden } from "./handZone.js";
import { chairId, chairReach, mayTake, roundMap, seatChair, setChairPin, setHandLock, chairPinned, standChair } from "./index.js";
import { seatPlaces as roundPlaces } from "./roundMap.js";
import { SEATS } from "./liveMap.js";

const poseOf = (n: Node) => fieldsOf<TransformableFields>(n, "Transformable")!.at!;
const apart = (a: number, b: number) => Math.abs((((a - b) % 360) + 540) % 360 - 180);

describe("the bar above a hand", () => {
  it("bar.the-controls-stand-above-the-box-on-the-far-rim — in a row across the owner's look, outside the outline", () => {
    const desk = roundMap();
    const places = roundPlaces(SEATS.length);
    for (const [i, { seat }] of SEATS.entries()) {
      const chair = byId(desk, chairId(seat))!;
      const at = poseOf(chair);
      const rad = (places[i]!.facing * Math.PI) / 180;
      const look = { x: -Math.sin(rad), y: -Math.cos(rad) };
      const across = { x: Math.cos(rad), y: -Math.sin(rad) };
      const bar = byId(desk, chairBarId(seat))!;
      expect(bar, `${seat} has its bar`).toBeDefined();
      // ONE NODE HELD ON THE GLASS, so the row scales as a row — lying as the chair lies, not a
      // billboard: stood up to every viewer it stood over the box for the player opposite.
      expect(caps(bar).has("Screened")).toBe(true);
      expect(caps(bar).has("Oriented")).toBe(false);
      const d = { x: poseOf(bar).x - at.x, y: poseOf(bar).y - at.y };
      // PAST THE RIM, on the far side: the outline is the hand's and the controls are not in it. The
      // bar is seated by its NEAR edge, a gap past the rim, and its controls stand on the far side
      // of that edge — so a bar held on the glass grows away from the box at every zoom.
      expect(d.x * look.x + d.y * look.y).toBeCloseTo(chairReach(chair) + BAR.gap);
      expect(d.x * across.x + d.y * across.y, "centred on the look").toBeCloseTo(0);
      const ids = (["lock", "hide", "flip", "pin", "glass"] as const).map((what) => chairButtonId(seat, what));
      const controls = ids.map((id) => byId(desk, id)!);
      for (const c of controls) {
        expect(c, `${seat} has its controls`).toBeDefined();
        expect(c.parent, "…in the bar").toBe(bar);
        expect(caps(c).has("Pressable"), "a control answers a finger").toBe(true);
        expect(poseOf(c).y, "…on the far side of the bar's near edge").toBeCloseTo(-BAR.size / 2);
      }
      // ...IN A ROW, centred, one step apart, in the order named.
      const along = controls.map((c) => poseOf(c).x);
      for (let k = 1; k < along.length; k += 1) expect(along[k]! - along[k - 1]!).toBeCloseTo(BAR.size + BAR.gap);
      expect(along.reduce((s, x) => s + x, 0)).toBeCloseTo(0);
      // ...AND EACH SAYS WHAT IT IS FOR, and whose: the press reads it back and never parses an id.
      expect(controls.map((c) => barPress(c))).toEqual((["lock", "hide", "flip", "pin", "glass"] as const).map((what) => ({ seat, what })));
    }
    // A PLACE NOBODY HOLDS HAS NO BAR: there is nobody to press it.
    expect(byId(roundMap([]), chairBarId("0"))).toBeUndefined();
    // ...AND A BOARD DOES NOT EITHER — controls about a hand belong to a desk that deals.
    const bare = seatChair("north", { at: { x: 0, y: -5 }, facing: 180 }, { ink: "accent" });
    expect(seatBar("north", bare, "accent")).toHaveLength(0);
  });

  it("bar.the-controls-follow-the-box — grown, moved or turned, the row stays on the far rim", () => {
    const desk = roundMap();
    const seat = SEATS[0]!.seat;
    const chair = byId(desk, chairId(seat))!;
    for (let i = 0; i < 3; i += 1) add(chair, node(`c${i}`, Bounded({ bounds: rect(1, 1.4) }), Transformable({ at: { x: 0, y: 0 } })));
    growHand(chair);
    standChair(desk, seat, { x: 2, y: 1 }, 90);
    const at = poseOf(chair);
    const reach = chairReach(chair);
    const bar = byId(desk, chairBarId(seat))!;
    // Facing 90: the look is the desk's -x, so the bar stands left of the box, past its half height.
    expect(poseOf(bar).x).toBeCloseTo(at.x - (reach + BAR.gap));
    expect(poseOf(bar).y).toBeCloseTo(at.y);
    expect(apart(fieldsOf<TransformableFields>(bar, "Transformable")!.angle ?? 0, -90), "…and turned with the chair").toBeCloseTo(0);
  });

  it("bar.the-two-statuses-and-the-pin-show-on-the-control — lit while on, plain while off; flip never lights", () => {
    const desk = roundMap();
    const seat = SEATS[0]!.seat;
    const chair = byId(desk, chairId(seat))!;
    const lit = (what: "lock" | "hide" | "flip" | "pin" | "glass"): boolean => fieldsOf<CoatedFields>(byId(desk, chairButtonId(seat, what))!, "Coated") !== undefined;
    expect([lit("lock"), lit("hide"), lit("flip"), lit("pin"), lit("glass")]).toEqual([false, false, false, false, false]);
    setHandLock(chair, true);
    setHandHidden(chair, true);
    setChairPin(chair, true);
    dressBar(desk, seat);
    expect([lit("lock"), lit("hide"), lit("flip"), lit("pin"), lit("glass")]).toEqual([true, true, false, true, false]);
    setHandLock(chair, false);
    dressBar(desk, seat);
    expect([lit("lock"), lit("hide"), lit("pin")]).toEqual([false, true, true]);
  });

  it("seat.a-pinned-chair-moves-for-nobody — its owner included, and the hand in it is untouched", () => {
    // A SEPARATE STATE FROM THE LOCK: a player may open their cards and still not want to be moved,
    // or shut them and not mind. Pinned, the ring refuses every finger; the cards in it answer to
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
