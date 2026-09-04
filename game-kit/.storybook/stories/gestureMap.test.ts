// The gesture map's own arithmetic: the border a carried piece is kept inside.
//
// Pure and headless — the walls are the map's rect inset by the piece's own half, and that is a
// sum, not a picture. It is worth its own guard because the inset is the whole of the rule: clamp
// the wrong thing and the border still LOOKS enforced, with half a card hanging over the side.

import { describe, expect, it } from "vitest";
import { apply, Camera, polar, type Vec } from "../../src/index.js";
import { landingAt, landingBox, add, Bounded, Container, freeLayout, node, rect, registerLayout, type Node } from "../../src/index.js";
import { caps, compose, extentOf, facing, fieldsOf, resetSurfaces, surfaceRecord, Transformable, type BoundedFields, type TransformableFields } from "../../src/index.js";
import { DECK, deckMap, DIE_SPIN, DIE_SPIN_DRAG, dropOf, STACK_POUR, STACK_STEP, STACK_THICK, turnOver, THROWN_AT, thrown, fallOrder, gestureMap, GRIP, GRIP_GAP, GRIP_RATIO, heapBox, heapsOf, isGrip, kindOf, MAP, mapWalls, deskRoom, flockTo, restsAt, regrip, flickOf, flightOf, THROW_REACH, STACK_FALL_STEP, stackMap, stackSeats, toFront, warmingNodes } from "./gestureMap.js";

const piece = (w: number, h: number): Node => node("p", Bounded({ bounds: rect(w, h) }));

describe("the gesture map", () => {
  it("map.everything-that-lies-on-a-desk-throws-a-shadow — height is the one thing an overhead view cannot draw", () => {
    // Half of what this shelf shows is HEIGHT: a piece lifts as it is picked up, hangs at the hand's
    // height while it is carried, falls from that height when it is let go. Seen from above, a card
    // in the air and a card on the felt are the same picture — the shadow is the difference, and
    // without it every page about lifting, dropping and throwing teaches something invisible.
    for (const [what, build] of [
      ["gestures", gestureMap],
      ["stacking", stackMap],
      ["deck", deckMap],
    ] as const) {
      const pieces = build().children.filter((n) => kindOf(n) !== "" && kindOf(n) !== "warm" && kindOf(n) !== "grip");
      expect(pieces.length, `${what}: a desk with no pieces is not a desk`).toBeGreaterThan(0);
      for (const piece of pieces) expect(caps(piece).has("ShadowCaster"), `${what}: ${kindOf(piece)}`).toBe(true);
    }
  });

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

/** Where the middle of a pile of these would sit if it were centred: the tab's clearance and a half. */
const clearOf = (piece: Node): number => GRIP.w / GRIP_RATIO / 2 + GRIP_GAP + extentOf(fieldsOf<BoundedFields>(piece, "Bounded")!.bounds).h / 2;

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

  it("map.a-piece-in-flight-is-in-no-heap — it left the heap when it left the desk", () => {
    // Thrown out of a stack, a card is in the AIR. The tree still seats it where the hand let go —
    // touching what it was heaped with — so a handle built from the tree alone would count it, and
    // taking the stack again would pull the card back out of its own flight.
    const desk = stackMap();
    for (const i of [2, 3, 4, 5]) at(desk, `chip ${i}`, 6 + i, 6);
    at(desk, "chip 0", 0, 0);
    at(desk, "chip 1", 0.4, 0);
    expect(heapsOf(desk)[0]).toHaveLength(2);
    // With one of them aloft there is no heap left at all — one piece is not a heap.
    expect(heapsOf(desk, (id) => id === "chip 1")).toEqual([]);
    expect(regrip(desk, undefined, (id) => id === "chip 1").size, "and so no handle").toBe(0);
    // A third on the desk and the two that are still lying make a heap without the flier.
    at(desk, "chip 2", 0.8, 0);
    const left = heapsOf(desk, (id) => id === "chip 1");
    expect(left).toHaveLength(0); // chip 0 and chip 2 do not reach each other without chip 1
    at(desk, "chip 2", 0.35, 0);
    expect(heapsOf(desk, (id) => id === "chip 1")[0]).toHaveLength(2);
  });

  it("map.every-desk-can-draw-a-handle — a picture nobody registered is silently nothing", () => {
    // An unregistered surface is SKIPPED and never thrown (one bad reference must not take a scene
    // down and hide every node that was fine). That is right, and it is also why this needs a guard:
    // a handle whose picture was registered by some OTHER desk is drawn into nothing, and the page
    // looks exactly as though stacking had been switched off.
    for (const build of [deckMap, gestureMap, stackMap]) {
      resetSurfaces();
      const desk = build();
      const tab = [...regrip(desk).values()][0];
      const grip = desk.children.find(isGrip);
      if (!grip) continue; // that desk starts with nothing touching, which is its own guard
      const name = fieldsOf<{ surface: string }>(grip, "Surfaced")!.surface;
      expect(surfaceRecord(name), `${build.name} draws its handle into nothing`).toBeTruthy();
      expect(tab).toBeTruthy();
    }
  });

  it("map.a-deck-is-a-heap-and-nothing-else — so a finger on it lands on its top card", () => {
    // Nothing about a deck is written down anywhere. It is thirty cards on one spot — a heap, which
    // is to say every rule this desk already has: it forms one, it earns a handle, and the topmost
    // card DRAWN is the one a finger reaches. That is the whole of "tapping a deck turns its top
    // card over": the answer the pick already gives is the right one.
    const desk = deckMap();
    const cards = desk.children.filter((n) => kindOf(n) === "card");
    expect(cards).toHaveLength(DECK.cards);
    expect(cards.filter((n) => facing(n) === "up"), "the ones in the open").toHaveLength(DECK.dealt);
    // The pile is one heap of everything that is face down, and the six in the open touch nobody.
    const heaps = heapsOf(desk);
    expect(heaps).toHaveLength(1);
    expect(heaps[0]).toHaveLength(DECK.cards - DECK.dealt);
    expect(heaps[0]!.every((n) => facing(n) === "down")).toBe(true);
    // The deck's own card is LAST in the children, so it is what the topmost drawn quad belongs to.
    expect(desk.children.indexOf(heaps[0]![heaps[0]!.length - 1]!)).toBeGreaterThan(desk.children.indexOf(heaps[0]![0]!));
    // And turning one over is the atom's word, not the desk's: the truth moves and the picture follows.
    const one = cards[0]!;
    turnOver(one);
    expect(facing(one)).toBe("down");
    turnOver(one);
    expect(facing(one)).toBe("up");
  });

  it("map.a-handle-in-a-hand-is-not-redrawn — what is being held may not be replaced under the hand", () => {
    // Every other tab is thrown away and made afresh, which is what keeps them from sliding into
    // each other's places. The one under a finger is the exception: replaced mid-carry it is a NEW
    // node the hand never took, so what the hand is holding vanishes out from under it — and any
    // landing anywhere on the desk is enough to trigger the rebuild.
    const desk = stackMap();
    for (const i of [4, 5]) at(desk, `chip ${i}`, 8 + i, 8);
    at(desk, "chip 0", 0, 0);
    at(desk, "chip 1", 0.4, 0);
    at(desk, "chip 2", 3, 0);
    at(desk, "chip 3", 3.4, 0);
    const first = [...regrip(desk).keys()];
    expect(first).toHaveLength(2);
    const holding = first[0]!;
    const again = regrip(desk, undefined, () => false, holding);
    // The held one is the SAME node, still on the desk; its neighbour was made afresh as always.
    expect(desk.children.filter(isGrip).map((n) => n.id)).toContain(holding);
    expect([...again.keys()].filter((id) => id !== holding).every((id) => !first.includes(id))).toBe(true);
    // And without the exception it goes, which is the bug: the hand is left holding a dead id.
    regrip(desk);
    expect(desk.children.filter(isGrip).map((n) => n.id)).not.toContain(holding);
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
    // ...AND THE PILE IS CENTRED ON THE TAB, because that is where the tab stands: `gripFor` puts it
    // under the MIDDLE of what it lifts. Counted from the first card instead, the pile drifts off
    // sideways by half its own spread — with thirty-six cards the better part of a card, so the tab
    // and the pile it stands for ended up in visibly different places, and the picture of the
    // landing showed that gap correctly and uselessly.
    const mids = seats.map((seat) => seat.x);
    expect((Math.min(...mids) + Math.max(...mids)) / 2, "the pile's middle is over the tab").toBeCloseTo(0, 10);
    const tall = seats.map((seat) => seat.y);
    expect((Math.min(...tall) + Math.max(...tall)) / 2 + clearOf(cards[0]!), "and so is its height").toBeCloseTo(0, 10);
    // Each one a hair further up the glass than the last, and the step is even.
    expect(seats[1]!.y).toBeLessThan(seats[0]!.y);
    expect(seats[2]!.y - seats[1]!.y).toBeCloseTo(seats[1]!.y - seats[0]!.y, 10);
    // A chip is shorter than a card, so it hangs closer: the seat is the PIECE's own half, not one
    // number that happens to suit whichever kind was written down first.
    const chips = desk.children.filter((n) => kindOf(n) === "chip").slice(0, 2);
    expect(stackSeats(chips)[0]!.y).toBeGreaterThan(seats[0]!.y);
    expect(stackSeats([])).toEqual([]);
    // A HEAP'S THICKNESS IS THE PILE'S, not the sum of its cards'. Three cards keep the full step;
    // thirty would be nearly a whole card of spread at that rate, and the deck would come up a fan.
    const deck = stackMap().children.filter((n) => kindOf(n) === "card");
    const few = stackSeats(cards);
    const many = stackSeats([...deck, ...deck, ...deck, ...deck, ...deck]);
    expect(Math.abs(few[2]!.y - few[0]!.y), "a few keep their step").toBeCloseTo(2 * STACK_STEP.y * -1, 6);
    const thick = Math.abs(many[many.length - 1]!.y - many[0]!.y);
    expect(thick).toBeLessThanOrEqual(STACK_THICK + 1e-9);
    expect(thick, "and it is still a pile, not a plane").toBeGreaterThan(STACK_THICK * 0.9);
  });

  it("map.the-camera-gets-room-the-desk-does-not — an edge you cannot bring to the middle is an edge you cannot read", () => {
    // Told the desk EXACTLY, the camera holds it covering the glass, and the felt's border becomes a
    // wall the view stops dead against: every pan ends in a stop with nothing on the other side of
    // it, and a piece lying by that border can never be brought to the middle of the glass to be
    // looked at. Which is what it felt like — being boxed in by the desk's own outline.
    //
    // The measurement is that last sentence, not the numbers: can the desk's own corner be pushed to
    // the centre of the glass? On the desk alone it cannot; with the room it can.
    const glass = { w: 400, h: 400 };
    const middle = { x: glass.w / 2, y: glass.h / 2 };
    const cornerAtMiddle = (area: { x: number; y: number; w: number; h: number }): number => {
      const cam = new Camera({ minZoom: 0.5, maxZoom: 2.5 });
      cam.setScreen(glass.w, glass.h);
      cam.setContent(area, 60);
      // Shove it as hard as anything can: far past any clamp, so what is left is the clamp itself.
      cam.panBy(-4000, -4000);
      const corner = apply(cam.transform(), { x: MAP.w / 2, y: MAP.h / 2 });
      return Math.hypot(corner.x - middle.x, corner.y - middle.y);
    };
    const boxedIn = cornerAtMiddle({ x: -MAP.w / 2, y: -MAP.h / 2, w: MAP.w, h: MAP.h });
    const roomy = cornerAtMiddle(deskRoom());
    // The desk alone: the corner stops a long way short of the middle — that gap IS the complaint.
    expect(boxedIn, "the desk's own outline is the wall").toBeGreaterThan(glass.w / 4);
    expect(roomy, "and with the room, the corner comes to the middle").toBeLessThan(boxedIn);
    // ...and the room is even, so no edge is easier to reach than another.
    const room = deskRoom();
    expect(room.x + room.w / 2, "still centred on the desk").toBeCloseTo(0, 9);
    expect(room.y + room.h / 2).toBeCloseTo(0, 9);
    expect(room.w, "and it is ROOM, not a second desk").toBeGreaterThan(MAP.w);
  });

  it("map.a-landing-mark-is-the-shape-of-what-will-BE-there — not of what is being held", () => {
    // A hand is carried splayed and in the air; what lands is a squared pile lying flat. The picture
    // a player needs is of the second, and it is drawn from the very seats the landing will write —
    // one piece's own box swept along them — so the outline cannot drift from the outcome.
    const one = [node("a", Bounded({ bounds: rect(1, 1.4) }))];
    const alone = landingBox(one, [{ x: 0, y: 0 }]);
    expect(alone.w, "one card is one card").toBeCloseTo(1, 9);
    expect(alone.h).toBeCloseTo(1.4, 9);
    expect(alone.at, "and it stands where it will stand").toEqual({ x: 0, y: 0 });

    // A PILE IS A CARD AND A SLIVER: the step is what the seats say, so the outline grows by exactly
    // the sliver a pile of that many actually takes, and its middle sits where the pile's middle is.
    const many = Array.from({ length: 12 }, (_v, i) => node(`c${i}`, Bounded({ bounds: rect(1, 1.4) })));
    const seats = stackSeats(many);
    const pile = landingBox(many, seats);
    expect(pile.w, "a card wide, and a hair more").toBeGreaterThanOrEqual(1);
    expect(pile.w, "never a fan's width").toBeLessThan(1.3);
    expect(pile.h).toBeGreaterThanOrEqual(1.4);
    const mid = (Math.min(...seats.map((s) => s.y)) + Math.max(...seats.map((s) => s.y))) / 2;
    expect(pile.at.y, "centred on the seats, not on the anchor").toBeCloseTo(mid, 9);
    // A HAND HELD AS A FAN would be three or four cards wide; the mark never is, because it is not
    // drawn from the hand at all.
    // ...AND IT STANDS WHERE THE PLACE IS. Under the anchor on the felt; IN a zone that would take
    // the run, because a zone lays its own things out and where they will lie there is its business.
    // Aim at somebody's area and the picture moves into it — the answer before the hand has let go.
    const zone = node("area", Bounded({ bounds: rect(3.4, 1.4) }), Transformable({ at: { x: 0, y: 2 } }));
    expect(landingAt({ x: 1, y: -1 }, { x: 0, y: -0.8 }, undefined), "on the felt, under the anchor").toEqual({ x: 1, y: -1.8 });
    expect(landingAt({ x: 1, y: -1 }, { x: 0, y: -0.8 }, zone), "and in the zone, when the zone takes it").toEqual({ x: 0, y: 2 });

    const fanned = landingBox(many, many.map((_n, i) => ({ x: i * 0.5, y: 0 })));
    expect(fanned.w, "asked about a fan, it answers about a fan").toBeGreaterThan(pile.w * 3);
    expect(fanned.at.x, "and centred on that spread, not on the first card").toBeCloseTo(2.75, 9);
  });

  it("map.a-landing-mark-is-hidden-during-a-throw", () => {
    // A hand moving fast during a throw gesture produces a fling vector (`flickOf`), which hides the landing mark.
    // A slow hand or a drop gesture ("drop") does not produce a fling vector, so the landing mark is shown.
    const perUnit = 100;
    const friction = 6;
    const fastSwing = { x: THROWN_AT * 6, y: 0 };
    const slowSwing = { x: 10, y: 0 };

    const wouldFly = (swing: Vec | undefined, letGo: "throw" | "drop" | undefined) =>
      letGo === "throw" && flickOf(swing, perUnit, friction) !== undefined;

    expect(wouldFly(fastSwing, "throw"), "fast swing on throw: will fly, landing mark hidden").toBe(true);
    expect(wouldFly(slowSwing, "throw"), "slow swing on throw: will not fly, landing mark shown").toBe(false);
    expect(wouldFly(fastSwing, "drop"), "fast swing on drop: drop never flies, landing mark shown").toBe(false);
    expect(wouldFly(slowSwing, "drop"), "slow swing on drop: drop never flies, landing mark shown").toBe(false);
  });
});
