import { beforeEach, describe, expect, it } from "vitest";
import { Marked, mark, unmark, visibleMark } from "./marked.js";
import { node } from "../node.js";
import type { ViewerSettings } from "../viewer.js";

describe("Marked atom", () => {
  beforeEach(() => {
    // Clean test state
  });

  it("marked.overwrites — mark writes fields and overwrites an existing mark", () => {
    const n = node("piece");
    mark(n, { by: "south", mark: "lifted", from: { x: 1, y: 2 }, at: 1000 });
    expect(n.atoms.has("Marked")).toBe(true);

    const first = visibleMark(n, undefined, 1000);
    expect(first).toEqual({ by: "south", mark: "lifted", from: { x: 1, y: 2 }, at: 1000 });

    mark(n, { by: "north", mark: "captured", at: 2000 });
    const second = visibleMark(n, undefined, 2000);
    expect(second).toEqual({ by: "north", mark: "captured", from: undefined, at: 2000 });
  });

  it("marked.unmark — unmark removes the atom outright", () => {
    const n = node("piece");
    mark(n, { by: "south", mark: "moved", at: 1000 });
    expect(visibleMark(n, undefined, 1000)).toBeDefined();

    unmark(n);
    expect(n.atoms.has("Marked")).toBe(false);
    expect(visibleMark(n, undefined, 1000)).toBeUndefined();
  });

  it("marked.visible-mark-branches — tests all four visibility branches", () => {
    const n = node("piece");

    // Branch 1: No atom
    expect(visibleMark(n, undefined, 1000)).toBeUndefined();

    mark(n, { by: "south", mark: "moved", at: 1000 });

    // Branch 2: Own mark hidden when showOwn is false
    const hideOwnViewer: ViewerSettings = {
      theme: "dark",
      marks: { me: "south", showOwn: false },
    };
    expect(visibleMark(n, hideOwnViewer, 1000)).toBeUndefined();

    const showOwnViewer: ViewerSettings = {
      theme: "dark",
      marks: { me: "south", showOwn: true },
    };
    expect(visibleMark(n, showOwnViewer, 1000)).toBeDefined();

    // Branch 3: Expired mark when ttlMs is set
    const ttlViewer: ViewerSettings = {
      theme: "dark",
      marks: { ttlMs: 5000, showOwn: true },
    };
    expect(visibleMark(n, ttlViewer, 7000)).toBeUndefined(); // 7000 - 1000 = 6000 > 5000
    expect(visibleMark(n, ttlViewer, 5000)).toBeDefined(); // 5000 - 1000 = 4000 <= 5000

    // Branch 4: Otherwise return fields (different user or no TTL)
    const otherViewer: ViewerSettings = {
      theme: "dark",
      marks: { me: "north", showOwn: false },
    };
    expect(visibleMark(n, otherViewer, 1000)).toEqual({
      by: "south",
      mark: "moved",
      from: undefined,
      at: 1000,
    });
  });
});
