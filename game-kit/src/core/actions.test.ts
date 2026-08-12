import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fieldsOf, node } from "./node.js";
import { Bounded } from "./atoms/bounded.js";
import { Surfaced } from "./atoms/surfaced.js";
import { Transformable } from "./atoms/transformable.js";
import { Flippable, type FlippableFields } from "./atoms/flippable.js";
import { Tiltable } from "./atoms/tiltable.js";
import { Draggable } from "./atoms/draggable.js";
import { rect } from "../presets/shapes.js";
import { actionNames, actionsOf, installStockActions, perform, registerAction, resetActions } from "./actions.js";

const surface = Surfaced({ surface: "front" });
const box = Bounded({ bounds: rect(1, 1) });

beforeEach(() => installStockActions());
afterEach(() => resetActions());

describe("actions", () => {
  it("action.flip-offered-for-a-flippable — the verb follows the capability", () => {
    const card = node("c", box, surface, Flippable({ back: "b" }));
    expect(actionsOf(card).map((a) => a.name)).toEqual(["flip"]);
  });

  it("action.label-comes-from-the-record — an already-written verb", () => {
    const card = node("c", box, surface, Flippable({ back: "b" }));
    expect(actionsOf(card)[0]?.label).toBe("Flip");
  });

  it("action.tap-offered-for-a-tiltable", () => {
    const token = node("t", Transformable({ at: { x: 0, y: 0 } }), Tiltable({}));
    expect(actionsOf(token).map((a) => a.name)).toEqual(["tap"]);
  });

  it("action.only-capable-actions-and-stable-order — capabilities filter, registration orders", () => {
    // Flippable + Draggable, but NOT Tiltable: flip and drag, and flip before drag (register order).
    const card = node("c", box, surface, Flippable({ back: "b" }), Draggable({ onReject: "home" }));
    expect(actionsOf(card).map((a) => a.name)).toEqual(["flip", "drag"]);
  });

  it("action.bare-node-offers-nothing — a node you can only look at", () => {
    expect(actionsOf(node("bare"))).toEqual([]);
  });

  it("action.unregistered-nothing — no stock installed, no actions", () => {
    resetActions();
    const card = node("c", box, surface, Flippable({ back: "b" }));
    expect(actionsOf(card)).toEqual([]);
  });

  it("action.a-consumer-verb-joins-on-its-capability", () => {
    registerAction("surface", { label: "Repaint", requires: "Surfaced" });
    expect(actionNames()).toContain("surface");
    const plain = node("p", box, surface);
    expect(actionsOf(plain).map((a) => a.name)).toEqual(["surface"]);
  });

  it("flip.flip-action-bumps-turns — the verb tumbles turns by one and touches nothing else", () => {
    // §5: the flip action is turns+1 on the node, nothing more. It returns a CHANGED node — the
    // orchestrator sets it as the new root; the side that shows is still the parity, resolved later.
    const card = node("c", box, surface, Flippable({ flip: "turnOver", back: "b", axis: 76, turns: 2 }));
    const flipped = perform("flip", card);
    const f = fieldsOf<FlippableFields>(flipped, "Flippable")!;
    expect(f.turns).toBe(3); // the one thing it does
    expect(f.flip).toBe("turnOver"); // recipe untouched
    expect(f.back).toBe("b"); // reference untouched
    expect(f.axis).toBe(76); // axis untouched
    // A node without the capability is returned as-is — a verb it does not carry does nothing.
    const bare = node("bare");
    expect(perform("flip", bare)).toBe(bare);
  });
});
