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
  extentOf,
  fieldsOf,
  footprint,
  Flippable,
  installStockControls,
  layoutChildren,
  layoutRecord,
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
import { barPress, chairBarGroupId, chairBarId, chairButtonId } from "./handBar.js";
import { handHud, HAND_HUD_BOX } from "./handHud.js";
import { layHand, setHandPose } from "./handZone.js";
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
const surfaceOf = (n: Node) => fieldsOf<{ surface: string }>(n, "Surfaced")?.surface;
const ids = (root: Node): string[] => {
  const seen: string[] = [];
  walk(root, (n) => seen.push(n.id));
  return seen;
};

describe("the hand on the glass", () => {
  it("hud.the-hand-on-the-glass-mirrors-the-one-on-the-felt — same cards, same order, and never a card of its own", () => {
    const b = bench();
    const hud = handHud(b.host, { seat: "south", desk: () => b.desk, ink: "accent" });
    // EMPTY IS A PLACE FOR CARDS: the strip stands at the foot holding nothing, with the controls
    // beside it — this screen plays cards, and a card dealt to it lands here.
    expect(hud.cards()).toEqual([]);
    expect(byId(hud.root, HAND_HUD_BOX), "the empty box is there").toBeDefined();
    expect(hud.floor()).toBeGreaterThan(0);

    for (const id of ["a", "b", "c"]) add(b.chair, card(id));
    layHand(b.chair);
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
    layHand(b.chair);
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
    layHand(b.chair);
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
    layHand(b.chair);
    hud.refresh();
    expect(fieldsOf<{ bounds: unknown }>(byId(hud.root, HAND_HUD_BOX)!, "Bounded"), "the cards lie in a box of their own").toBeDefined();
    const wide = hud.width() * u;
    expect(wide).toBeLessThanOrEqual(v.width);
    hud.stop();
  });

  it("hud.the-controls-come-with-the-glass — at its foot whether or not a hand is drawn, lit by the chair's own states", () => {
    const b = bench();
    const hud = handHud(b.host, { seat: "south", desk: () => b.desk, ink: "accent" });
    const screen = b.host.hudRoot!;
    // BEFORE ANY HAND IS ON THE GLASS the controls stand: pressing one is how a hand gets there.
    const lock = byId(screen, chairButtonId("south", "lock"))!;
    expect(lock, "the controls came with the glass").toBeDefined();
    expect(byId(hud.root, chairButtonId("south", "lock")), "…beside the strip, not in it").toBeUndefined();
    expect(barPress(lock)).toEqual({ seat: "south", what: "lock" });
    expect(caps(lock).has("Pressable")).toBe(true);
    // ON ONE BAR AT THE FOOT: the bar below the glass's middle and as wide as it; the rights on its
    // left, the flip and the folds on its right.
    const v = b.host.viewport();
    const u = b.host.unit();
    const bar = byId(screen, chairBarId("south"))!;
    expect(poseOf(bar).y).toBeGreaterThan(0);
    expect(poseOf(bar).y * u).toBeLessThan(v.height / 2);
    expect(extentOf(footprint(bar)!).w * u).toBeCloseTo(v.width, 0);
    const rights = poseOf(byId(screen, chairBarGroupId("south", "rights"))!);
    const poses = poseOf(byId(screen, chairBarGroupId("south", "poses"))!);
    expect(rights.x).toBeLessThan(0);
    expect(poses.x).toBeGreaterThan(0);
    // ...AND THE STRIP STANDS ON THE BAR, its cards tucked under the bar's top edge.
    expect(poseOf(hud.root).y).toBeLessThan(poseOf(bar).y);
    // ...AND THE ROOM THEY TAKE IS REPORTED, so the camera's pair stands clear of them.
    expect(hud.floor()).toBeGreaterThan(0);
    // ...AND LIT BY THE CHAIR'S OWN STATE, not by a second one kept here.
    const plate = (what: "lock" | "flip") => fieldsOf<{ surface: string }>(byId(screen, chairButtonId("south", what))!, "Surfaced")!.surface;
    expect(plate("lock")).toBe(plate("flip"));
    setHandLock(byId(b.desk, chairId("south"))!, true);
    hud.refresh();
    expect(plate("lock")).not.toBe(plate("flip"));
    hud.stop();
    expect(byId(screen, chairBarId("south")), "and they go down with the hand").toBeUndefined();
  });

  it("hud.eight-cards-stand-abreast-on-a-phone — the strip is drawn at the scale that fits them, and a fan never overlaps up to eight", () => {
    // THE OWNER'S RULE: on a phone eight cards fit the hand side by side, none over another. The
    // strip is scaled to the glass for it, so a 393px glass draws them smaller than their own size;
    // `shrink` still closes them up, because that is what the fold is for.
    const b = bench();
    const hud = handHud(b.host, { seat: "south", desk: () => b.desk, ink: "accent" });
    for (let i = 0; i < 8; i += 1) add(b.chair, card(`c${i}`));
    layHand(b.chair);
    setHandPose(b.chair, { side: "front", fold: "fan" });
    hud.refresh();
    const u = b.host.unit();
    const v = b.host.viewport();
    expect(hud.scale()).toBeLessThan(1);
    // Where the arrangement puts them — the arrangement is read, as the felt's own row is read.
    const laid = (): number[] => {
      const strip = byId(hud.root, HAND_HUD_BOX)!;
      const name = fieldsOf<{ layout: string }>(strip, "Container")!.layout;
      return layoutRecord(name)!.place(layoutChildren(strip), footprint(strip)).map((p) => p!.x);
    };
    const xs = laid();
    for (let i = 1; i < xs.length; i += 1) expect(xs[i]! - xs[i - 1]!, "a step of at least a card: none over another").toBeGreaterThanOrEqual(1);
    // ...AND THE LOT INSIDE THE GLASS, on the glass's own pixels.
    const span = (xs[7]! - xs[0]! + 1) * u * hud.scale();
    expect(span).toBeLessThanOrEqual(v.width);
    // A NINTH CLOSES THEM UP rather than pushing one off the glass.
    add(b.chair, card("c8"));
    layHand(b.chair);
    hud.refresh();
    const nine = laid();
    expect(nine[1]! - nine[0]!).toBeLessThan(1);
    // SHRINK CLOSES THEM UP whatever the count: the fold's own meaning.
    setHandPose(b.chair, { side: "front", fold: "shrink" });
    hud.refresh();
    const packed = laid();
    expect(packed[1]! - packed[0]!).toBeLessThan(1);
    hud.stop();
  });

  it("hud.a-picture-on-the-glass-is-a-way-of-reaching-the-card — the finger takes the card off the felt, and the picture steps aside", () => {
    // ONE CARD, TWO PLACES TO REACH IT. A finger that lands on the strip means the card that lies in
    // the box on the felt: `standFor` is what the drag wiring asks (`DragOptions.standIn`), so the
    // gesture that starts on the glass happens where the card actually is — the same run, the same
    // zones, the same drop, and nothing here has to know what any of them do.
    const b = bench();
    const hud = handHud(b.host, { seat: "south", desk: () => b.desk, ink: "accent" });
    for (const id of ["a", "b"]) add(b.chair, card(id));
    layHand(b.chair);
    hud.refresh();
    const shown = byId(hud.root, HAND_HUD_BOX)!.children;
    expect(hud.standFor(shown[0]!)).toBe(byId(b.desk, "a"));
    expect(hud.standFor(shown[1]!)).toBe(byId(b.desk, "b"));
    // ...AND NOTHING ELSE ON THE SCREEN IS A CARD: a button is only ever itself.
    expect(hud.standFor(byId(b.host.hudRoot!, chairButtonId("south", "lock"))!)).toBeUndefined();

    // WHAT IS IN THE AIR IS OUT OF THE PICTURE. A card drawn under the finger AND still lying in the
    // strip is one card shown twice, and the reader cannot tell which of them they are holding.
    hud.lifting(["a"]);
    expect(hud.cards()).toEqual(["b"]);
    hud.lifting([]);
    expect(hud.cards()).toEqual(["a", "b"]);

    // A DROP AIMED AT THE STRIP IS A DROP INTO THE HAND — asked in glass pixels, because that is
    // what a finger is measured in, and only while the hand is actually pinned there.
    const v = b.host.viewport();
    const u = b.host.unit();
    const onIt = { x: v.width / 2 + poseOf(hud.root).x * u, y: v.height / 2 + poseOf(hud.root).y * u };
    expect(hud.overHand(onIt)).toBe(true);
    expect(hud.overHand({ x: 20, y: 40 })).toBe(false);
    hud.stop();
  });
});
