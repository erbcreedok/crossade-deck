import { describe, expect, it } from "vitest";
import { regrip, isGrip, GRIP } from "./grips.js";
import { heapBox } from "./heaps.js";
import { node, Bounded, Transformable, rect, Valued, Flippable, type Node, fieldsOf, caps, type ValuedFields, type TransformableFields, extentOf, type BoundedFields } from "../index.js";

const kindOf = (n: Node) => caps(n).has("Flippable") ? "card" : fieldsOf<ValuedFields>(n, "Valued")?.values?.["chip"] ? "chip" : "";

const piece = (id: string, k: "card"|"chip", x: number, y: number) => 
  node(id, Bounded({ bounds: rect(0.5, 0.5) }), Transformable({ at: { x, y } }), k === "card" ? Flippable({ flip: "" }) : Valued({ values: { chip: 25 } }));

describe("regrip", () => {
  it("grips.a-handle-stands-under-the-middle-of-what-the-heap-covers — one per heap, and none for a lone piece", () => {
    const desk = node("desk");
    expect(regrip(desk, kindOf).size).toBe(0);
    expect(desk.children.filter(isGrip)).toHaveLength(0);
    
    const p1 = piece("p1", "chip", 0, 0);
    const p2 = piece("p2", "chip", 0.4, 0);
    desk.children.push(p1, p2);
    
    const held = regrip(desk, kindOf);
    expect(held.size).toBe(1);
    const tab = desk.children.find(isGrip)!;
    expect(held.get(tab.id)).toHaveLength(2);
    
    const box = heapBox(desk, held.get(tab.id)!);
    const seat = fieldsOf<TransformableFields>(tab, "Transformable")!.at!;
    expect(seat.x).toBeCloseTo(box.mid, 6);
    expect(seat.y).toBeGreaterThan(box.bottom + GRIP.h / 2);
  });
  
  it("grips.a-handle-in-a-hand-is-not-redrawn — what is being held may not be replaced under the hand", () => {
    const desk = node("desk");
    const p1 = piece("p1", "chip", 0, 0);
    const p2 = piece("p2", "chip", 0.4, 0);
    const p3 = piece("p3", "chip", 3, 0);
    const p4 = piece("p4", "chip", 3.4, 0);
    desk.children.push(p1, p2, p3, p4);
    
    const first = [...regrip(desk, kindOf).keys()];
    expect(first).toHaveLength(2);
    const holding = first[0]!;
    
    const again = regrip(desk, kindOf, undefined, () => false, holding);
    expect(desk.children.filter(isGrip).map(n => n.id)).toContain(holding);
    expect([...again.keys()].filter(id => id !== holding).every(id => !first.includes(id))).toBe(true);
  });
  
  it("grips.a-handle-is-never-the-same-node-twice — so it appears where it belongs and goes where it stood", () => {
    const desk = node("desk");
    desk.children.push(piece("p1", "chip", 0, 0), piece("p2", "chip", 0.4, 0), piece("p3", "chip", 3, 0), piece("p4", "chip", 3.4, 0));
    
    const first = [...regrip(desk, kindOf).keys()];
    const again = [...regrip(desk, kindOf).keys()];
    expect(again.some((id) => first.includes(id))).toBe(false);
  });
});
