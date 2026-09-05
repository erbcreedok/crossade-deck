// A regression on the release path: a card let go over a zone crashed instead of joining the pile
// it was dropped on, because the check for "is a handle among what is being handed over" conjured
// an empty-id node to ask `isGrip` of an item that had already left the tree (the landing picture,
// removed by `landingPic.end()` before a zone is ever asked about). `node("")` throws by the model's
// own law (`core/node.ts`), and the release died before the card was ever written down.

import { describe, expect, it } from "vitest";
import { add, Bounded, node, rect, Valued } from "../../src/index.js";
import { isHandleAmong } from "./gestureScene.js";

describe("isHandleAmong", () => {
  it("scene.a-missing-item-is-not-a-handle — asked, not conjured", () => {
    const root = node("desk");
    const card = node("card", Bounded({ bounds: rect(1, 1.4) }));
    add(root, card);
    // The picture rode along in `items` and was already removed from the tree by the moment this is
    // asked — `byId` finds nothing for it, and that must read as "not a handle", never throw.
    expect(() => isHandleAmong(root, [{ id: card.id, offset: { x: 0, y: 0 } }, { id: "landing mark 0", offset: { x: 0, y: 0 } }])).not.toThrow();
    expect(isHandleAmong(root, [{ id: card.id, offset: { x: 0, y: 0 } }, { id: "landing mark 0", offset: { x: 0, y: 0 } }])).toBe(false);
  });

  it("scene.a-grip-among-the-items-is-a-handle", () => {
    const root = node("desk");
    const grip = node("stack handle 0", Bounded({ bounds: rect(1, 0.3) }), Valued({ values: { grip: 0 } }));
    add(root, grip);
    expect(isHandleAmong(root, [{ id: grip.id, offset: { x: 0, y: 0 } }])).toBe(true);
  });
});
