import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { node } from "./node.js";
import { Bounded } from "./atoms/bounded.js";
import { Surfaced } from "./atoms/surfaced.js";
import { Transformable } from "./atoms/transformable.js";
import { Flippable } from "./atoms/flippable.js";
import { Tiltable } from "./atoms/tiltable.js";
import { Draggable } from "./atoms/draggable.js";
import { rect } from "../presets/shapes.js";
import { actionNames, actionsOf, installStockActions, registerAction, resetActions } from "./actions.js";

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
});
