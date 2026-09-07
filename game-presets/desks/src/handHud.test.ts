// @vitest-environment jsdom

// THE HAND ON THE GLASS — the same cards as the one on the felt, drawn where a thumb can reach them.
//
// The table's hand is the TRUTH and this is a picture of it: a card never lives here, it is shown
// here (`handHud`). That is the whole reason the two can never disagree about what somebody holds —
// there is one array, and everything else reads it. What this file checks is that the picture is
// faithful (same cards, same order, same faces), that it stands at the foot of the glass with its
// own controls above it, and that it says how much of the bottom it has taken so nothing else on
// the screen is laid over it.

import { describe, expect, it } from "vitest";
import {
  add,
  Bounded,
  DEFAULT_VIEWER,
  byId,
  caps,
  fieldsOf,
  Flippable,
  installStockControls,
  installStockSurfaces,
  mount,
  node,
  rect,
  registerLayout,
  freeLayout,
  resetSurfaces,
  setFacing,
  Surfaced,
  Transformable,
  walk,
  type Node,
  type TransformableFields,
} from "game-kit";
import { barPress, chairBarId, chairButtonId } from "./handBar.js";
import { handHud, HAND_HUD_BOX } from "./handHud.js";
import { growHand } from "./handZone.js";
import { chairId, seatChair, setHandLock } from "./seatPlace.js";

function bench() {
  registerLayout("free", freeLayout);
  resetSurfaces();
  installStockSurfaces();
  installStockControls();
  const container = document.createElement("div");
  container.getBoundingClientRect = () =>
    ({ width: 393, height: 800, x: 0, y: 0, top: 0, left: 0, right: 393, bottom: 800, toJSON: () => "" }) as DOMRect;
  const desk = node("desk", Bounded({ bounds: rect(12, 12) }));
  const chair = seatChair("south", { at: { x: 0, y: 3 }, facing: 0 }, { ink: "accent", hand: true });
  add(desk, chair);
  const host = mount(container, desk, { ...DEFAULT_VIEWER, hudUnit: 64 });
  return { host, desk, chair };
}

const card = (id: string): Node =>
  node(id, Bounded({ bounds: rect(1, 1.4) }), Surfaced({ surface: "front" }), Flippable({ flip: "turnOver", back: "cardBack" }), Transformable({ at: { x: 0, y: 0 } }));

const poseOf = (n: Node) => fieldsOf<TransformableFields>(n, "Transformable")!.at!;
const ids = (root: Node): string[] => {
  const seen: string[] = [];
  walk(root, (n) => seen.push(n.id));
  return seen;
};

describe("the hand on the glass", () => {
  it("hud.the-hand-on-the-glass-mirrors-the-one-on-the-felt — same cards, same order, and never a card of its own", () => {
    const b = bench();
    const hud = handHud(b.host, { seat: "south", desk: () => b.desk, ink: "accent" });
    // EMPTY IS NOTHING AT ALL. A permanent strip across the foot of a phone for a player holding
    // nothing is the glass spent on a fact that is already visible on the felt.
    expect(hud.cards()).toEqual([]);
    expect(hud.floor()).toBe(0);

    for (const id of ["a", "b", "c"]) add(b.chair, card(id));
    growHand(b.chair);
    hud.refresh();
    // THE SAME CARDS, IN THE SAME ORDER — read off the chair every time, so a hand dealt to, played
    // from or reordered on the felt is that hand here without anybody telling this file what changed.
    expect(hud.cards()).toEqual(["a", "b", "c"]);
    // ...AND THEY ARE PICTURES: the cards themselves never leave the chair, or the table would stop
    // being able to show anybody what this player holds.
    expect(b.chair.children.map((n) => n.id)).toEqual(["a", "b", "c"]);
    expect(ids(hud.root)).not.toContain("a");
    // A CARD PLAYED IS GONE FROM THE GLASS TOO.
    b.chair.children.splice(1, 1);
    growHand(b.chair);
    hud.refresh();
    expect(hud.cards()).toEqual(["a", "c"]);
    // ...AND THE FACE IS THE OWNER'S OWN. This screen belongs to the player whose hand it is: what
    // they turned down is down here, and the hiding a shut hand does to everybody ELSE is not theirs.
    setFacing(byId(b.desk, "c")!, "down");
    hud.refresh();
    expect(hud.faces()).toEqual(["up", "down"]);
    hud.stop();
  });

  it("hud.the-hand-on-the-glass-stands-at-the-foot-of-it — in a row across the bottom, and it says what it took", () => {
    const b = bench();
    const hud = handHud(b.host, { seat: "south", desk: () => b.desk, ink: "accent" });
    for (const id of ["a", "b", "c"]) add(b.chair, card(id));
    growHand(b.chair);
    hud.refresh();
    const v = b.host.viewport();
    const u = b.host.unit();
    const glass = (n: Node) => ({ x: v.width / 2 + poseOf(n).x * u, y: v.height / 2 + poseOf(n).y * u });
    // AT THE FOOT, CENTRED: a thumb reaches the bottom of a phone and nothing else.
    const at = glass(hud.root);
    expect(at.x).toBeCloseTo(v.width / 2, 6);
    expect(at.y).toBeGreaterThan(v.height * 0.7);
    expect(at.y).toBeLessThan(v.height);
    // ...AND IT SAYS HOW MUCH OF THE BOTTOM IT TOOK, so the camera's own controls stand clear of it
    // rather than over the cards (`floor`).
    expect(hud.floor()).toBeGreaterThan(0);
    expect(hud.floor()).toBeLessThan(v.height / 2);
    // A HAND WIDER THAN THE GLASS IS SQUEEZED, never drawn past the edge: the row closes up exactly
    // as it does in a box on the felt (`handLayout`), because it is the same arrangement.
    for (const id of ["d", "e", "f", "g", "h", "i", "j"]) add(b.chair, card(id));
    growHand(b.chair);
    hud.refresh();
    expect(fieldsOf<{ bounds: unknown }>(byId(hud.root, HAND_HUD_BOX)!, "Bounded"), "the cards lie in a box of their own").toBeDefined();
    const wide = hud.width() * u;
    expect(wide).toBeLessThanOrEqual(v.width);
    hud.stop();
  });

  it("hud.the-four-controls-come-with-it — the same meaning, above the cards, lit by the same states", () => {
    const b = bench();
    const hud = handHud(b.host, { seat: "south", desk: () => b.desk, ink: "accent" });
    add(b.chair, card("a"));
    growHand(b.chair);
    hud.refresh();
    // THE SAME FOUR, and they MEAN the same: one press wiring, one answer, whichever copy the finger
    // found (`barPress`). A second meaning for the same button is two locks that can disagree.
    const lock = byId(hud.root, chairButtonId("south", "lock"))!;
    expect(lock, "the bar came with the hand").toBeDefined();
    expect(barPress(lock)).toEqual({ seat: "south", what: "lock" });
    expect(caps(lock).has("Pressable")).toBe(true);
    // ABOVE THE CARDS: the controls are on the far side of the box from the reader, as on the felt.
    expect(poseOf(byId(hud.root, chairBarId("south"))!).y).toBeLessThan(0);
    // ...AND LIT BY THE CHAIR'S OWN STATE, not by a second one kept here.
    expect(fieldsOf<{ cast: unknown }>(lock, "Coated")).toBeUndefined();
    setHandLock(byId(b.desk, chairId("south"))!, true);
    hud.refresh();
    expect(fieldsOf<{ cast: unknown }>(byId(hud.root, chairButtonId("south", "lock"))!, "Coated")).toBeDefined();
    hud.stop();
  });
});
