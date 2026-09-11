// THE HAND IS A LAYER, AND THE RUNTIME UNDER IT KNOWS NOTHING ABOUT CARDS.
//
// The point of this package is negative: what it does is not new, it is what the hub's own desk was
// already doing under `if (game === "cards")`. What IS new is that the desk no longer has to.
//
// So the tests here ask the two questions that would go unnoticed if the extraction were only half
// done: does the layer work through the context alone (no reaching back into a hub, no second copy
// of the tree), and does the chair-dressing still happen on exactly the events it used to.

import { chairId, roundMap, roundPlaces } from "@game-presets/desks";
import type { DeskContext } from "@game-presets/desk";
import { byId, type Node } from "game-kit";
import { describe, expect, it } from "vitest";
import { handLayer } from "./handLayer.js";

const PLACES = roundPlaces(2);

/**
 * A CONTEXT WITHOUT A GLASS — everything a layer is handed, with the drawing half answering nothing.
 *
 * It is deliberately this poor: a layer that needs more than a tree and a seat to dress the chairs
 * would be one that cannot run before the first frame, and the roster arrives before the first
 * frame on every reload. Mounting against this is the test.
 */
function bareContext(root: Node, seat: string | null): DeskContext {
  let written = 0;
  return {
    host: undefined as never,
    root: () => root,
    camera: () => undefined,
    motions: () => undefined,
    seat: () => seat,
    hudRoot: () => undefined,
    ink: () => "accent",
    redraw: () => {},
    write: () => {
      written += 1;
    },
    avatars: () => undefined,
    hud: () => undefined,
    // Not part of the contract — the counter is read by the test through the closure below.
    ...({ written: () => written } as object),
  } as DeskContext;
}

describe("hand.the-hand-on-the-glass-is-a-layer", () => {
  it("dresses the chairs off the roster with nothing but the context", () => {
    const desk = roundMap([]);
    const layer = handLayer({ places: PLACES });
    layer.mount(bareContext(desk, "p1"));
    expect(byId(desk, chairId("p1")), "no ring before anybody is announced").toBeUndefined();

    layer.seated!([{ seat: "p1", name: "Ana" }]);
    expect(byId(desk, chairId("p1")), "the roster put one up").toBeTruthy();
    expect(byId(desk, chairId("p2")), "and only for the seat that is taken").toBeUndefined();

    layer.seated!([{ seat: "p1", name: "Ana" }, { seat: "p2", name: "Bek" }]);
    expect(byId(desk, chairId("p2"))).toBeTruthy();
    layer.stop();
  });

  it("survives every callback before the seat is known — a desk stands up before the room answers", () => {
    // THE ORDER IS NOT NEGOTIABLE: the host is built, the camera opens, and only then does
    // `joinTable` resolve. A layer that threw on any of these would take the whole desk down on the
    // way up, which is exactly how the old file fell over once.
    const desk = roundMap([]);
    const layer = handLayer({ places: PLACES });
    const ctx = bareContext(desk, null);
    expect(() => {
      layer.mount(ctx);
      layer.changed!();
      layer.carried!([{ id: "nothing" }], { x: 0, y: 0 }, false, {});
      layer.carried!([{ id: "nothing" }], undefined, true, {});
      layer.standIn!(desk);
      layer.floor!();
      layer.handUnderFinger({ x: 0, y: 0 });
      layer.stop();
    }).not.toThrow();
  });

  it("answers the gesture's own questions without a glass — a shut hand is refused at the pick", () => {
    const desk = roundMap([]);
    const layer = handLayer({ places: PLACES });
    layer.mount(bareContext(desk, "p1"));
    layer.seated!([{ seat: "p1", name: "Ana" }]);
    const chair = byId(desk, chairId("p1"))!;
    // A CARD AT A CHAIR IS AN INDICATOR: not lifted off the felt, and not turned by a tap.
    const card = { id: "c", parent: chair } as unknown as Node;
    expect(layer.may(card), "a card in a hand is not picked off the chair").toBe(false);
    expect(layer.taps(card), "and a tap on it turns nothing").toBe(true);
    layer.stop();
  });
});
