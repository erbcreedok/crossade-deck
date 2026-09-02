// THE LIVE DESK'S OWN PIECE — what one screen draws of the OTHER hands on the desk.
//
// Delivery is the master's and is guarded there; the desk is the magnetism page's and is guarded
// there. What is only ever true here is the marking: a ring on what somebody else is holding, a
// cursor wherever their finger is, and — the part that is easy to get wrong and impossible to see
// in a screenshot — that both come OFF again.

import { describe, expect, it } from "vitest";
import { byId, caps, fieldsOf, heapOf, walk, type Node, type NodeId, type TransformableFields } from "../../src/index.js";
import { isCursor, liveMap, markHands, SEATS, type Hand } from "./liveMap.js";

/** How many cursors this screen is drawing — by what the nodes ARE, never by what they are called. */
const cursors = (tree: Node): number => {
  let n = 0;
  walk(tree, (one) => {
    if (isCursor(one)) n++;
  });
  return n;
};

/** Whether this node wears a coat — read through the door, never off the node's own innards. */
const coated = (tree: Node, id: NodeId): boolean => {
  const n = byId(tree, id);
  return !!n && caps(n).has("Coated");
};

describe("what one screen draws of the other hands", () => {
  const deskAnd = (): { desk: Node; card: NodeId } => {
    const desk = liveMap();
    const card = desk.children.find((n) => heapOf(n) === "card")!.id;
    return { desk, card };
  };

  it("live.a-hand-is-a-ring-and-a-cursor — one about a card, one about a person", () => {
    const { desk, card } = deskAnd();
    const hands = new Map<string, Hand>([["north", { els: [card], at: { x: 1, y: -2 } }]]);
    const marked = markHands(desk, hands);
    expect(coated(marked, card), "a ring on what they are holding").toBe(true);
    expect(cursors(marked), "and a cursor where their finger is").toBe(1);
    // ...and the desk itself is untouched: the mark is a VIEW and the snapshot is not the viewer's
    // to write on. Two screens mark the same snapshot differently, and each must get its own.
    expect(coated(desk, card), "the snapshot was not written on").toBe(false);
  });

  it("live.a-hand-holding-nothing-is-still-a-hand — a cursor you cannot see is a player who left", () => {
    const { desk } = deskAnd();
    const marked = markHands(desk, new Map([["north", { els: [], at: { x: 0, y: 0 } }]]));
    expect(cursors(marked)).toBe(1);
  });

  it("live.marks-come-off-again — absence has to mean absence", () => {
    // The trap: a ring composed onto the snapshot itself outlives the hand that put it there,
    // because the next pass simply does not mention that node and what was never removed stays.
    // Marking a fresh copy each time is what makes "nobody is holding this" sayable at all.
    const { desk, card } = deskAnd();
    const held = markHands(desk, new Map([["north", { els: [card], at: { x: 1, y: 1 } }]]));
    expect(coated(held, card)).toBe(true);
    const letGo = markHands(desk, new Map());
    expect(coated(letGo, card), "the ring is gone with the hand").toBe(false);
    expect(cursors(letGo), "and so is the cursor").toBe(0);
  });

  it("live.every-seat-has-an-area-and-they-face-each-other", () => {
    // Two seats, two areas, on opposite sides of one desk — a player whose area was not across from
    // the other's would be sitting at a different desk.
    const desk = liveMap();
    const areas = desk.children.filter((n) => caps(n).has("Acceptor"));
    expect(areas.length).toBe(SEATS.length);
    const ys = areas.map((n) => fieldsOf<TransformableFields>(n, "Transformable")!.at!.y);
    expect(Math.sign(ys[0]!)).toBe(-Math.sign(ys[1]!));
  });
});
