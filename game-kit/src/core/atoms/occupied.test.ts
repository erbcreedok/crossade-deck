import { beforeEach, describe, expect, it } from "vitest";
import { node } from "../node.js";
import { Container } from "./container.js";
import { capture, Displacer, installStockOccupied, merge, reject, resolveOccupied, resetOccupied, swap } from "./occupied.js";

beforeEach(() => {
  resetOccupied();
  installStockOccupied();
});

describe("occupied", () => {
  it("occupied.reject-moves-nobody — the drop is refused, the sitter stays", () => {
    expect(reject.resolve()).toEqual({ kind: "reject" });
  });

  it("occupied.swap-trades-places — incomer takes the slot, sitter goes back", () => {
    expect(swap.resolve()).toEqual({ kind: "swap" });
  });

  it("occupied.merge-keeps-both — the slot now holds more than one", () => {
    expect(merge.resolve()).toEqual({ kind: "merge" });
  });

  it("occupied.capture-names-the-destination — the sitter is taken away to a named zone", () => {
    // capture bakes its argument into the record, so the outcome carries WHERE the sitter goes.
    expect(capture("tray").resolve()).toEqual({ kind: "capture", to: "tray" });
  });

  it("occupied.default-is-reject — a container that is not a Displacer does not clobber", () => {
    const plain = node("o1", Container({ layout: "free" }));
    expect(resolveOccupied(plain)).toEqual({ kind: "reject" });
  });

  it("occupied.from-the-tree — resolveOccupied reads the container's policy", () => {
    const slot = node("o2", Container({ layout: "free" }), Displacer({ occupied: "swap" }));
    expect(resolveOccupied(slot)).toEqual({ kind: "swap" });
  });
});
