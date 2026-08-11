import { beforeEach, describe, expect, it } from "vitest";
import { add, node } from "../node.js";
import { Container } from "./container.js";
import { grabAbove, grabFrom, grabOne, grabTop, Grabber, installStockGrabs, resetGrabs } from "./grab.js";

beforeEach(() => {
  resetGrabs();
  installStockGrabs();
});

describe("grab", () => {
  it("grab.one-takes-the-touched-child — the slot stays, only its content goes", () => {
    expect(grabOne(["a", "b", "c"], "b")).toEqual(["b"]);
  });

  it("grab.top-takes-the-last-whatever-was-touched — the pile gives up its top", () => {
    // `top` ignores which card was pressed and yields the one on top — the last in tree order.
    expect(grabTop(["a", "b", "c"], "a")).toEqual(["c"]);
  });

  it("grab.above-tears-off-the-subpile — the touched card and everything resting on it", () => {
    expect(grabAbove(["a", "b", "c"], "b")).toEqual(["b", "c"]);
    expect(grabAbove(["a", "b", "c"], "z")).toEqual([]); // a card not in the pile tears off nothing
  });

  it("grab.empty-pile-grabs-nothing — the drag never starts", () => {
    // An empty pile has no top and no sub-pile: the load is empty, so the gesture does not begin.
    expect(grabTop([], "x")).toEqual([]);
    expect(grabAbove([], "x")).toEqual([]);
  });

  it("grab.no-grabber-eats-no-gesture — a container without the atom takes nothing", () => {
    // Absence is the off switch: the hit-test walks up to an owner that does grab, rather than this
    // container swallowing a gesture it has no policy for.
    const plain = node("g1", Container({ layout: "free" }));
    add(plain, node("g1a"));
    expect(grabFrom(plain, "g1a")).toEqual([]);
  });

  it("grab.from-the-tree — grabFrom reads the policy and the real children", () => {
    const pile = node("g2", Container({ layout: "free" }), Grabber({ grab: "above" }));
    ["a", "b", "c"].forEach((id) => add(pile, node(`g2${id}`)));
    expect(grabFrom(pile, "g2b")).toEqual(["g2b", "g2c"]);
  });
});
