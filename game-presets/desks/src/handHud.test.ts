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
import { barPress, chairBarGroupId, chairBarId, chairButtonId } from "./handBar.js";
import { handHud, HAND_HUD_ANCHOR, HAND_HUD_BOX } from "./handHud.js";
import { layHand } from "./handZone.js";
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
    hud.attach(true);
    // EMPTY IS NOTHING AT ALL. A permanent strip across the foot of a phone for a player holding
    // nothing is the glass spent on a fact that is already visible on the felt.
    expect(hud.cards()).toEqual([]);
    // ...BUT THE CONTROLS ARE, and the foot of the glass is theirs: a hand is put here by pressing one.
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
    hud.attach(true);
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
    // AT THE FOOT: the rights in the left corner, the poses in the right, below the glass's middle.
    const v = b.host.viewport();
    const u = b.host.unit();
    const rights = poseOf(byId(screen, chairBarGroupId("south", "rights"))!);
    const poses = poseOf(byId(screen, chairBarGroupId("south", "poses"))!);
    expect(rights.y).toBeGreaterThan(0);
    expect(rights.y * u).toBeLessThan(v.height / 2);
    expect(rights.x).toBeLessThan(0);
    expect(poses.x).toBeGreaterThan(0);
    expect(poses.y).toBeCloseTo(rights.y);
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

  it("hud.a-hand-goes-onto-the-glass-by-being-carried-there — an anchor while a ring is in hand, and the drop is the switch", () => {
    // HOW A PLAYER PINS THEIR HAND TO THEIR OWN SCREEN, and the only way: they pick their place up
    // — the one node on this desk that is theirs (`mayTake`) — and put it down at the foot of the
    // glass. The anchor is drawn only while a ring is actually in hand, because a dashed box across
    // the bottom of every game a reader is not moving anything in is a control asking to be noticed
    // for nothing.
    const b = bench();
    const hud = handHud(b.host, { seat: "south", desk: () => b.desk, ink: "accent" });
    add(b.chair, card("a"));
    layHand(b.chair);
    expect(hud.attached(), "a hand starts on the felt, where every player's does").toBe(false);
    expect(hud.cards(), "…and nothing of it is on the glass").toEqual([]);
    expect(byId(b.host.hudRoot!, HAND_HUD_ANCHOR), "no ring in hand, no anchor").toBeUndefined();

    // A RING IN HAND: the anchor appears, and it says whether the finger is over it — dashed while
    // it is not, solid the moment it is, so the reader is told where the drop will land BEFORE they
    // let go rather than by what happens after.
    const v = b.host.viewport();
    const u = b.host.unit();
    const away = { x: 20, y: 40 };
    expect(hud.carrying(away)).toBe(false);
    const anchor = byId(b.host.hudRoot!, HAND_HUD_ANCHOR)!;
    expect(anchor, "a ring in hand puts the anchor up").toBeDefined();
    // ABOVE THE CONTROLS, where the strip will be: the anchor stands where the hand lands.
    const onIt = { x: v.width / 2 + poseOf(anchor).x * u, y: v.height / 2 + poseOf(anchor).y * u };
    expect(onIt.y).toBeGreaterThan(v.height / 2);
    expect(onIt.y).toBeLessThan(v.height);
    const dashed = surfaceOf(anchor);
    expect(hud.carrying(onIt)).toBe(true);
    expect(surfaceOf(anchor), "aimed at, it stops being a dotted line").not.toBe(dashed);

    // LET GO OVER IT AND THE HAND IS THERE.
    expect(hud.dropped(onIt)).toBe(true);
    expect(hud.attached()).toBe(true);
    expect(hud.cards()).toEqual(["a"]);
    expect(byId(b.host.hudRoot!, HAND_HUD_ANCHOR), "and the anchor goes down with the gesture").toBeUndefined();

    // ...AND WHILE THE ANCHOR IS UP IT CATCHES WHAT IS LET GO ON IT. A hand carried to the glass by
    // its own handle is a run in the air, and a run let go at the foot of the screen belongs to this
    // hand: without this it is spilled onto the felt at the moment it was being put away.
    hud.attach(false);
    hud.carrying(onIt);
    expect(hud.overHand(onIt), "the anchor catches what is dropped on it").toBe(true);
    hud.carrying(undefined);
    expect(hud.overHand(onIt), "…and catches nothing once it is down").toBe(false);
    hud.attach(true);

    // ...AND THE SAME GESTURE TAKES IT BACK OFF: one place, one act, both ways.
    hud.carrying(onIt);
    expect(hud.dropped(onIt)).toBe(true);
    expect(hud.attached()).toBe(false);
    expect(hud.cards()).toEqual([]);

    // A RING LET GO ANYWHERE ELSE IS A RING BEING MOVED ON THE FELT, and says nothing about the glass.
    hud.carrying(away);
    expect(hud.dropped(away)).toBe(false);
    expect(hud.attached()).toBe(false);
    expect(byId(b.host.hudRoot!, HAND_HUD_ANCHOR)).toBeUndefined();
    hud.stop();
  });

  it("hud.a-picture-on-the-glass-is-a-way-of-reaching-the-card — the finger takes the card off the felt, and the picture steps aside", () => {
    // ONE CARD, TWO PLACES TO REACH IT. A finger that lands on the strip means the card that lies in
    // the box on the felt: `standFor` is what the drag wiring asks (`DragOptions.standIn`), so the
    // gesture that starts on the glass happens where the card actually is — the same run, the same
    // zones, the same drop, and nothing here has to know what any of them do.
    const b = bench();
    const hud = handHud(b.host, { seat: "south", desk: () => b.desk, ink: "accent" });
    hud.attach(true);
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
    hud.attach(false);
    expect(hud.overHand(onIt), "a hand that is not on the glass catches nothing dropped at it").toBe(false);
    hud.stop();
  });
});
