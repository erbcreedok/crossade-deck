// The gesture map's own arithmetic: the border a carried piece is kept inside.
//
// Pure and headless — the walls are the map's rect inset by the piece's own half, and that is a
// sum, not a picture. It is worth its own guard because the inset is the whole of the rule: clamp
// the wrong thing and the border still LOOKS enforced, with half a card hanging over the side.

import { describe, expect, it } from "vitest";
import { add, Bounded, Container, freeLayout, node, rect, registerLayout, type Node } from "../../src/index.js";
import { compose, extentOf, fieldsOf, Transformable, type BoundedFields, type TransformableFields } from "../../src/index.js";
import { DIE_SPIN, DIE_SPIN_DRAG, dropOf, fallOrder, gestureMap, GRIP, heapBox, heapsOf, isGrip, kindOf, MAP, mapWalls, regrip, STACK_FALL_STEP, stackMap, stackSeats, toFront, warmingNodes } from "./gestureMap.js";

const piece = (w: number, h: number): Node => node("p", Bounded({ bounds: rect(w, h) }));

describe("the gesture map", () => {
  it("map.walls-inset-by-the-piece — the anchor is clamped, so the BODY is what must stay in", () => {
    // A card 1×1.4 on an 8×8 map: its origin may reach 3.5 across and 3.3 down, and not a unit
    // further. Clamping the origin to the map's own edge instead would leave half a card outside,
    // which is the version that looks right until somebody drags to the corner.
    const w = mapWalls(piece(1, 1.4));
    expect(w).toEqual({ x0: -3.5, y0: -3.3, x1: 3.5, y1: 3.3 });
    // A square piece answers the same on both axes — the inset is the piece's own extent and not
    // one number standing in for four.
    expect(mapWalls(piece(0.9, 0.9))).toEqual({ x0: -3.55, y0: -3.55, x1: 3.55, y1: 3.55 });
  });

  it("map.walls-count-the-pop — a piece drawn bigger is bigger at the border too", () => {
    // The carry holds a piece at `lift`, so what the eye sees cross the line is the LIFTED body.
    // Ignore it and exactly that sliver — six percent of the card — goes over the edge.
    const lifted = mapWalls(piece(1, 1.4), 1.06);
    expect(lifted.x1).toBeCloseTo(3.47, 6);
    expect(lifted.y1).toBeCloseTo(3.258, 6);
    expect(lifted.x1).toBeLessThan(mapWalls(piece(1, 1.4)).x1);
  });

  it("map.walls-never-turn-inside-out — a piece bigger than the map stands in the middle", () => {
    // A negative half would make `x0 > x1`, and a clamp between crossed bounds is whichever of them
    // the arithmetic reaches last: the piece would be flung to one edge rather than held.
    const huge = mapWalls(piece(MAP.w * 2, MAP.h * 2));
    expect(huge).toEqual({ x0: 0, y0: 0, x1: 0, y1: 0 });
  });

  it("map.a-piece-with-no-box-is-a-point — the border is still the map's own", () => {
    // Nothing on this desk is boxless, but `Bounded` is optional in the model and a missing box
    // must read as "no size", never as a crash inside a debug scene.
    expect(mapWalls(node("bare"))).toEqual({ x0: -4, y0: -4, x1: 4, y1: 4 });
  });

  it("map.a-card-is-put-down-and-a-chip-is-dropped — two ways of leaving a hand, and the panel may swap them", () => {
    // Not a contradiction: a card put down on a felt IS a putting-down, while a chip dropped on one
    // is a thing landing. `settle` is also the quiet one — nothing is thrown, so there is nothing to
    // schedule and nothing to re-order first, which is where the flicker came from.
    const desk = stackMap();
    const card = desk.children.find((n) => kindOf(n) === "card")!;
    const chip = desk.children.find((n) => kindOf(n) === "chip")!;
    const die = desk.children.find((n) => kindOf(n) === "die")!;
    expect(dropOf(card).fall).toBe("settle");
    expect(dropOf(chip).fall).toBe("fall");
    // A DIE ROLLS. Always, and not only when it was thrown hard: that is what a die is for, and one
    // that came down flat and lay there would be a counter. It is a way of leaving a hand that only
    // a thing with FACES has, so nothing else on the desk is offered it.
    expect(dropOf(die).fall).toBe("roll");
    expect(dropOf(die, { die: "fall" }).fall, "and a reader may still say otherwise").toBe("fall");
    expect(dropOf(card, { die: "roll" }).fall, "the die's word is the die's").toBe("settle");
    // And a reader may disagree, per kind and without touching the other.
    expect(dropOf(card, { card: "fall" }).fall).toBe("fall");
    expect(dropOf(chip, { card: "fall" }).fall).toBe("fall");
    expect(dropOf(chip, { chip: "settle" }).fall).toBe("settle");
    expect(dropOf(card, { chip: "settle" }).fall).toBe("settle");
    // The weights are untouched by the way it leaves: what it is made of is not what it is doing.
    expect(dropOf(card, { card: "fall" }).gravity).toBe(dropOf(card).gravity);
    // AND A HEAP OF CARDS FILES NO FLIGHT AT ALL. It is worth writing down because it is the shape
    // of a bug that has now been paid for: anything a scene hangs off a LANDING never happens for a
    // run where nothing lands, and a settling card is exactly that.
    const cards = desk.children.filter((n) => kindOf(n) === "card");
    expect(fallOrder(cards.filter((n) => dropOf(n).fall === "fall"))).toEqual([]);
    expect(fallOrder(cards.filter((n) => dropOf(n, { card: "fall" }).fall === "fall"))).toHaveLength(cards.length);
  });

  it("map.drop-feel-is-read-off-what-the-piece-is — never off its name", () => {
    // A die is the thing whose faces go over, a card is the thing with a back to turn to, and a
    // carved piece is neither — so the answer comes from the model. Off the id it would be a list
    // somebody has to remember to add the fifth piece to, and `guard.id-is-opaque` forbids reading
    // one anyway: an id says WHICH, never WHAT.
    const by = Object.fromEntries(gestureMap().children.map((n) => [n.id, dropOf(n)]));
    const die = by["die"]!;
    const knight = by["knight"]!;
    const card = Object.entries(by).find(([id]) => id !== "die" && id !== "knight")![1];
    // The card is the slow one, and the only one that does not come back up.
    expect(card.gravity).toBeLessThan(die.gravity);
    expect(card.gravity).toBeLessThan(knight.gravity);
    expect(card.bounce).toBe(0);
    // The die is the one the desk throws back; the carved piece does not bounce at all — a tenth of
    // a percent, which is "not at all" written down. Written down rather than left at zero so the
    // ORDER of the three still says something: it is the end of the scale, not a piece the scale
    // forgot about.
    expect(die.bounce).toBeGreaterThan(knight.bounce);
    expect(knight.bounce).toBeGreaterThan(0);
    expect(knight.bounce, "a carved piece does not bounce").toBeLessThan(0.01);
    expect(knight.wallBounce, "and not off a rail either").toBeLessThan(0.01);
    // And the two heavy ones fall at about the same rate — what tells them apart is the landing.
    expect(Math.abs(die.gravity - knight.gravity) / die.gravity).toBeLessThan(0.3);
    // A WALL IS ITS OWN MATERIAL. The die is the liveliest off a rail and the carved piece the
    // deadest, which is the opposite order to nothing else here — and the card, dead on the cloth,
    // still comes back off a border. On one number that last pair could not be said at all.
    expect(die.wallBounce).toBeGreaterThan(card.wallBounce);
    expect(card.wallBounce).toBeGreaterThan(knight.wallBounce);
    expect(card.wallBounce).toBeGreaterThan(card.bounce);
  });

  it("map.the-last-dropped-is-on-top — and it is a place in the list, not a height", () => {
    // Equal `z` keeps tree order (the plan sorts stably), so "in front" is the end of the children.
    // As a height it would be a lie about the third dimension: the piece is ON the desk, and every
    // drop would raise the pile a little further off the felt forever.
    registerLayout("gesture.map.free", freeLayout);
    const desk = node("desk", Container({ layout: "gesture.map.free" }));
    for (const id of ["a", "b", "c"]) add(desk, node(id, Bounded({ bounds: rect(1, 1) })));
    const at = (): string[] => desk.children.map((n) => n.id);
    toFront(desk.children[0]!);
    expect(at()).toEqual(["b", "c", "a"]);
    // The one already on top is left exactly where it is — no shuffling for a no-op.
    toFront(desk.children[2]!);
    expect(at()).toEqual(["b", "c", "a"]);
    // And nothing is lost or duplicated on the way, whichever one is raised.
    toFront(desk.children[1]!);
    expect(at()).toEqual(["b", "a", "c"]);
    // A piece with no owner is not an error — it is simply already the only thing there is.
    expect(() => toFront(node("loose"))).not.toThrow();
  });

  it("map.carries-four-pieces-of-three-kinds — a carry that only ever holds a card teaches the card", () => {
    const desk = gestureMap();
    const pieces = desk.children.filter((n) => kindOf(n) !== "warm");
    expect(pieces).toHaveLength(4);
    expect(pieces.map((n) => n.id)).toContain("knight");
    expect(pieces.map((n) => n.id)).toContain("die");
  });
});

describe("the stacking desk", () => {
  const at = (desk: Node, id: string, x: number, y: number): void => {
    compose(desk.children.find((n) => n.id === id)!, Transformable({ at: { x, y } }));
  };
  const kinds = (desk: Node) => desk.children.map(kindOf);

  it("map.the-stacking-desk-opens-with-nothing-touching — the subject cannot already be on the desk", () => {
    // Six cards, six chips of one denomination, one die. A desk that opened with a heap already on
    // it would teach the heap and not how one comes about.
    const desk = stackMap();
    const k = kinds(desk);
    expect(k.filter((x) => x === "card")).toHaveLength(6);
    expect(k.filter((x) => x === "chip")).toHaveLength(6);
    expect(k.filter((x) => x === "die")).toHaveLength(1);
    expect(heapsOf(desk), "and not one of them touches another").toEqual([]);
  });

  it("map.a-heap-is-one-kind-and-transitive — a card with a card, and the ends need not meet", () => {
    // WHAT MAY TOUCH WHAT is the desk's rule, not the kit's: the kit answers the geometry and stops.
    const desk = stackMap();
    // Three chips in a row, each touching the next and the ends apart: still one heap.
    at(desk, "chip 0", 0, 5);
    at(desk, "chip 1", 0.4, 5);
    at(desk, "chip 2", 0.8, 5);
    let heaps = heapsOf(desk);
    expect(heaps).toHaveLength(1);
    expect(heaps[0]).toHaveLength(3);
    // A chip sitting ON a card is not a heap: two kinds do not stack together on this desk.
    at(desk, "chip 3", 0, -5);
    at(desk, "chip 4", 9, 9);
    at(desk, "chip 5", 9, -9);
    const card = desk.children.find((n) => kindOf(n) === "card")!;
    compose(card, Transformable({ at: { x: 0, y: -5 } }));
    heaps = heapsOf(desk);
    expect(heaps.every((h) => h.every((n) => kindOf(n) === kindOf(h[0]!)))).toBe(true);
    expect(heaps.some((h) => h.some((n) => n.id === "chip 3"))).toBe(false);
  });

  it("map.a-handle-stands-under-the-middle-of-what-the-heap-covers — one per heap, and none for a lone piece", () => {
    const desk = stackMap();
    expect(regrip(desk).size, "nothing touches, so there is nothing to pull").toBe(0);
    expect(desk.children.filter(isGrip)).toHaveLength(0);
    for (const i of [2, 3, 4, 5]) at(desk, `chip ${i}`, 3 + i, 3);
    at(desk, "chip 0", 0, 0);
    at(desk, "chip 1", 0.4, 0);
    const held = regrip(desk);
    expect(held.size).toBe(1);
    const tab = desk.children.find(isGrip)!;
    expect(held.get(tab.id)).toHaveLength(2);
    // Under the MIDDLE of everything the heap covers, and below its lowest edge — never over it.
    const box = heapBox(desk, held.get(tab.id)!);
    const seat = fieldsOf<TransformableFields>(tab, "Transformable")!.at!;
    expect(seat.x).toBeCloseTo(box.mid, 6);
    expect(seat.y).toBeGreaterThan(box.bottom + GRIP.h / 2);
    // And the old tab goes when the heap does: a handle nobody redrew hangs under felt.
    at(desk, "chip 1", 5, 5);
    expect(regrip(desk).size).toBe(0);
    expect(desk.children.filter(isGrip)).toHaveLength(0);
  });

  it("map.a-dropped-heap-pours-rather-than-slabs — a step apart, bottom first, and the handle not at all", () => {
    // All at once and a heap comes down as a slab; too far apart and it stops being one thing coming
    // down and becomes several things dropped in turn. A step is what reads as a pour.
    const desk = stackMap();
    for (const i of [2, 3, 4, 5]) at(desk, `chip ${i}`, 6 + i, 6);
    at(desk, "chip 0", 0, 0);
    at(desk, "chip 1", 0.4, 0);
    regrip(desk);
    const run = [desk.children.find(isGrip)!, ...heapsOf(desk)[0]!];
    const falling = fallOrder(run);
    // The handle is not among them: a control does not fall, it is redrawn where the pieces land.
    expect(falling.map((f) => f.piece.id)).toEqual(["chip 0", "chip 1"]);
    // The bottom of the stack leaves first, so what comes after lands ON it and not under it.
    expect(falling[0]!.delayMs).toBe(0);
    expect(falling[1]!.delayMs).toBe(STACK_FALL_STEP);
    // A run of one has no stagger to have — which is every other page on the shelf, unchanged.
    expect(fallOrder([run[1]!])).toEqual([{ piece: run[1], delayMs: 0 }]);
    expect(fallOrder([])).toEqual([]);
  });

  it("map.a-roll-is-brisk-and-does-not-outstay-it — a faster turn must not also be a longer one", () => {
    // The faces are counted off the die's OWN turn, so the spin buys both halves at once: a brisker
    // roll shows more faces AND shows them faster. What it must not buy is duration — a die still
    // turning three seconds after it was let go is a die nobody is waiting for. So the drag is its
    // own too, and steeper than the desk's.
    const seconds = DIE_SPIN / DIE_SPIN_DRAG;
    expect(seconds).toBeLessThan(2);
    expect(seconds).toBeGreaterThan(0.8); // and long enough to be a roll rather than a twitch
    // How many faces that is: the turn it has in it, over the kit's degrees-per-face.
    const faces = (DIE_SPIN * DIE_SPIN) / (2 * DIE_SPIN_DRAG) / 60;
    expect(faces).toBeGreaterThan(12);
    expect(faces / seconds, "faces a second — a blur, which is what a rolling die is").toBeGreaterThan(8);
  });

  it("map.the-pictures-are-warmed-by-asking-for-them — off the map, and out of everything's way", () => {
    // The painter loads a texture the first time a PLAN asks to draw it, and until it lands the
    // layer draws nothing — which is why a die stutters through its first roll. So the first frame
    // asks for all of them at once. Parked where no camera reaches and no rule counts them.
    const warm = warmingNodes();
    expect(warm.length, "every registered picture").toBeGreaterThan(6);
    for (const n of warm) {
      expect(kindOf(n), "not a piece, so no heap and no handle ever sees it").toBe("warm");
      const at = fieldsOf<TransformableFields>(n, "Transformable")!.at!;
      expect(Math.abs(at.x) > MAP.w / 2 || Math.abs(at.y) > MAP.h / 2, "off the map").toBe(true);
    }
    // And the desk that holds them still holds exactly the pieces it says it does.
    const desk = stackMap();
    expect(desk.children.filter((n) => kindOf(n) === "warm").length).toBe(warm.length);
    expect(heapsOf(desk), "warming nodes never form a heap").toEqual([]);
  });

  it("map.a-handle-is-never-the-same-node-twice — so it appears where it belongs and goes where it stood", () => {
    // A handle is a PICTURE of a heap, not a thing on the desk. Named by its place in the list, two
    // handles swap names the moment a heap between them goes: the clock sees one id whose rest pose
    // has moved and eases it there, so every remaining tab slides along into the one before it and a
    // new tab flies out of an old one's seat. Named afresh, each is a node the clock has never seen,
    // and a new node is drawn at its rest without flying in from anywhere.
    const desk = stackMap();
    for (const i of [4, 5]) at(desk, `chip ${i}`, 6 + i, 6);
    at(desk, "chip 0", 0, 0);
    at(desk, "chip 1", 0.4, 0);
    at(desk, "chip 2", 3, 0);
    at(desk, "chip 3", 3.4, 0);
    const first = [...regrip(desk).keys()];
    expect(first).toHaveLength(2);
    // The same two heaps again: still not one name reused, so nothing can be eased into place.
    const again = [...regrip(desk).keys()];
    expect(again).toHaveLength(2);
    expect(again.some((id) => first.includes(id)), "no name comes back").toBe(false);
    // And when the FIRST heap goes, the survivor does not inherit the departed one's name — which
    // is the whole of "they all slide along after each other".
    at(desk, "chip 1", 8, 8);
    const left = [...regrip(desk).keys()];
    expect(left).toHaveLength(1);
    expect(again.includes(left[0]!)).toBe(false);
  });

  it("map.a-lifted-heap-hangs-by-its-bottom-centre — a handle is UNDER a heap, not through it", () => {
    // Hung by their middles the pieces sit ON the tab with half of each below it: a stack skewered
    // on its own handle rather than one standing on it. And thickness is an `at`, never a `z` —
    // written as height a growing heap would rise off the felt for ever.
    const desk = stackMap();
    const cards = desk.children.filter((n) => kindOf(n) === "card").slice(0, 3);
    const half = extentOf(fieldsOf<BoundedFields>(cards[0]!, "Bounded")!.bounds).h / 2;
    const seats = stackSeats(cards);
    // The first card's own bottom edge sits clear of the tab, above it — never over its middle.
    expect(seats[0]!.y + half).toBeLessThan(-GRIP.h / 2);
    expect(seats[0]!.x).toBe(0);
    // Each one a hair further up the glass than the last, and the step is even.
    expect(seats[1]!.y).toBeLessThan(seats[0]!.y);
    expect(seats[2]!.y - seats[1]!.y).toBeCloseTo(seats[1]!.y - seats[0]!.y, 10);
    // A chip is shorter than a card, so it hangs closer: the seat is the PIECE's own half, not one
    // number that happens to suit whichever kind was written down first.
    const chips = desk.children.filter((n) => kindOf(n) === "chip").slice(0, 2);
    expect(stackSeats(chips)[0]!.y).toBeGreaterThan(seats[0]!.y);
    expect(stackSeats([])).toEqual([]);
  });
});
