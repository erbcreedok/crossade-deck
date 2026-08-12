import { beforeEach, describe, expect, it } from "vitest";
import { node } from "../core/node.js";
import { contextFor } from "../core/resolve.js";
import { IDENTITY, move } from "../core/transform.js";
import { applyEffects, registerEffect, resetEffects, type Effect } from "./effects.js";

const ctx = () => contextFor(node("solo"), 1);

describe("the effects list", () => {
  beforeEach(() => resetEffects());

  it("effects.empty-is-the-node — no mechanic registered leaves the node untouched", () => {
    // The whole point of the seam: with nothing in the list, the plan sees exactly the node it
    // was handed, at its own pose, with no runtime coats. A no-op the day it is wired in.
    const n = node("plate");
    const out = applyEffects(n, ctx());
    expect(out.node).toBe(n);
    expect(out.pre).toEqual(IDENTITY);
    expect(out.coats).toBeUndefined();
  });

  it("effects.pre-composes — two shifting effects fold into one pose, in order", () => {
    registerEffect(() => ({ node: node("a"), pre: move(2, 0) }));
    registerEffect(() => ({ node: node("b"), pre: move(0, 3) }));
    const out = applyEffects(node("start"), ctx());
    // e: 2 from the first, and the second's move composed onto it — a plain sum here since
    // neither turns or scales.
    expect(out.pre).toEqual({ a: 1, b: 0, c: 0, d: 1, e: 2, f: 3 });
  });

  it("effects.node-chains — each effect sees what the one before it returned", () => {
    const seen: string[] = [];
    registerEffect((n) => {
      seen.push(n.id);
      return { node: node("swapped"), pre: IDENTITY };
    });
    registerEffect((n) => {
      seen.push(n.id);
      return { node: n, pre: IDENTITY };
    });
    const out = applyEffects(node("origin"), ctx());
    expect(seen).toEqual(["origin", "swapped"]);
    expect(out.node.id).toBe("swapped");
  });

  it("effects.coats-accumulate — every effect's coats reach the plan, first-registered first", () => {
    registerEffect((n) => ({ node: n, pre: IDENTITY, coats: [{ layers: [{ paint: "accent", opacity: 1 }] }] }));
    registerEffect((n) => ({ node: n, pre: IDENTITY, coats: [{ filter: { name: "mosaic", params: { strength: 0.5 } } }] }));
    const out = applyEffects(node("plate"), ctx());
    expect(out.coats).toHaveLength(2);
    expect(out.coats![0]!.layers?.[0]?.paint).toBe("accent");
    expect(out.coats![1]!.filter?.name).toBe("mosaic");
  });

  it("effects.order-is-registration — the list plays in the order it was built", () => {
    const order: number[] = [];
    const mark = (i: number): Effect => (n) => {
      order.push(i);
      return { node: n, pre: IDENTITY };
    };
    registerEffect(mark(1));
    registerEffect(mark(2));
    registerEffect(mark(3));
    applyEffects(node("plate"), ctx());
    expect(order).toEqual([1, 2, 3]);
  });
});
