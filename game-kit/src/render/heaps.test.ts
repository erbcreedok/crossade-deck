import { describe, expect, it } from "vitest";
import { heapsOf, TOUCHING, sameKind } from "./heaps.js";
import { node, Bounded, Transformable, rect, Valued, Flippable, type Node, fieldsOf, caps, type ValuedFields } from "../index.js";

const kindOf = (n: Node) => caps(n).has("Flippable") ? "card" : fieldsOf<ValuedFields>(n, "Valued")?.values?.["chip"] ? "chip" : "";

const piece = (id: string, k: "card"|"chip", x: number, y: number) => 
  node(id, Bounded({ bounds: rect(0.5, 0.5) }), Transformable({ at: { x, y } }), k === "card" ? Flippable({ flip: "" }) : Valued({ values: { chip: 25 } }));

describe("heapsOf", () => {
  it("heaps.a-heap-is-one-kind-and-transitive — a card with a card, and the ends need not meet", () => {
    const desk = node("desk");
    const p1 = piece("p1", "chip", 0, 0);
    const p2 = piece("p2", "chip", 0.4, 0);
    const p3 = piece("p3", "chip", 0.8, 0);
    desk.children.push(p1, p2, p3);
    const heaps = heapsOf(desk, kindOf);
    expect(heaps).toHaveLength(1);
    expect(heaps[0]).toHaveLength(3);
    
    // different kinds don't mix
    const p4 = piece("p4", "card", 0, 0);
    desk.children.push(p4);
    const heaps2 = heapsOf(desk, kindOf);
    // the chips are 1 heap, the card is alone so not a heap
    expect(heaps2).toHaveLength(1);
    expect(heaps2[0]!.map((n) => n.id)).toEqual(["p1", "p2", "p3"]);
  });

  it("heaps.a-turned-card-still-joins-the-pile — a piece lying at its holder's angle is heaped by its real shape", () => {
    // A DROP NOW WRITES A TURN. A holder-facing piece comes to rest at the angle its holder saw it
    // at, so the pile it lands on meets a card that is not square with the rest. The reach is a
    // separating-axis test over the PLACED outline, so the turn is already in it — and the two cards
    // here prove it both ways: at the same seat they touch only BECAUSE one of them is turned.
    const tall = (id: string, x: number, deg: number) =>
      node(id, Bounded({ bounds: rect(0.5, 2) }), Transformable({ at: { x, y: 0 }, angle: deg }), Flippable({ flip: "" }));

    const desk = node("desk");
    desk.children.push(tall("flat", 0, 0), tall("turned", 1, 90));
    expect(heapsOf(desk, kindOf).map((h) => h.map((n) => n.id)), "turned, it lies across the other").toEqual([["flat", "turned"]]);

    const square = node("desk2");
    square.children.push(tall("flat", 0, 0), tall("alongside", 1, 0));
    expect(heapsOf(square, kindOf), "square with it at the same seat, the two are a hand apart").toEqual([]);
  });

  it("heaps.a-piece-in-flight-is-in-no-heap — it left the heap when it left the desk", () => {
    const desk = node("desk");
    const p1 = piece("p1", "chip", 0, 0);
    const p2 = piece("p2", "chip", 0.4, 0);
    const p3 = piece("p3", "chip", 0.8, 0);
    desk.children.push(p1, p2, p3);
    
    const heaps = heapsOf(desk, kindOf, (id) => id === "p2");
    // p2 is aloft. So p1 and p3 don't touch (they are 0.8 apart).
    expect(heaps).toHaveLength(0);
  });
  
  it("heaps.seam-heapRule — can be swapped out to ignore touches", () => {
    const desk = node("desk");
    const p1 = piece("p1", "chip", 0, 0);
    const p2 = piece("p2", "chip", 0.4, 0);
    desk.children.push(p1, p2);
    
    const rule = {
      joins: () => true,
      meets: () => false,
      admits: (group: readonly Node[]) => group,
      seats: () => [],
    };
    const heaps = heapsOf(desk, kindOf, () => false, rule);
    expect(heaps).toHaveLength(0);
  });
});
