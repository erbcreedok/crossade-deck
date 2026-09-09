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
  remove,
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
import { courtLift, handHud, HAND_HUD_BOX, HUD_COURT } from "./handHud.js";
import { HAND_POSES, handPose, handPoseName, layHand, setHandPose, untuck } from "./handZone.js";
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

  it("hud.the-cards-never-change-size — one size of the glass for any count and any pose; fan is the angle, shrink the distance, tuck the height", () => {
    // THE OWNER'S RULE: the card on the glass is one size — what six abreast get across it — for
    // one card, six or fifteen, fanned or shut. A fan is an ARC: the outer cards sit lower and lean
    // further out, and the whole of it stays inside the glass sideways.
    const b = bench();
    const hud = handHud(b.host, { seat: "south", desk: () => b.desk, ink: "accent" });
    const scales: number[] = [];
    const laid = (): { x: number; y: number }[] => {
      const strip = byId(hud.root, HAND_HUD_BOX)!;
      const name = fieldsOf<{ layout: string }>(strip, "Container")!.layout;
      return layoutRecord(name)!.place(layoutChildren(strip), footprint(strip)).map((p) => ({ x: p!.x, y: p!.y }));
    };
    for (let i = 0; i < 15; i += 1) {
      add(b.chair, card(`c${i}`));
      layHand(b.chair);
      hud.refresh();
      scales.push(hud.scale());
    }
    expect(scales[0]).toBeLessThan(1);
    for (const s of scales) expect(s).toBeCloseTo(scales[0]!, 6);
    setHandPose(b.chair, { fan: true, shrink: false, tuck: false });
    hud.refresh();
    expect(hud.scale()).toBeCloseTo(scales[0]!, 6);
    // THE ARC: middle highest, ends lowest, the lean growing outwards, symmetric about the middle.
    const fan = laid();
    const shown = byId(hud.root, HAND_HUD_BOX)!.children;
    const lean = (i: number) => fieldsOf<TransformableFields>(shown[i]!, "Transformable")?.angle ?? 0;
    expect(fan[7]!.y).toBeLessThan(fan[0]!.y);
    expect(fan[7]!.y).toBeLessThan(fan[14]!.y);
    expect(fan[0]!.y).toBeCloseTo(fan[14]!.y);
    expect(lean(7)).toBeCloseTo(0);
    expect(lean(0)).toBeLessThan(lean(1));
    expect(lean(14)).toBeGreaterThan(lean(13));
    expect(lean(0)).toBeCloseTo(-lean(14));
    // ...AND INSIDE THE GLASS SIDEWAYS, on the glass's own pixels.
    const u = b.host.unit();
    const v = b.host.viewport();
    expect((fan[14]!.x - fan[0]!.x + 1) * u * hud.scale()).toBeLessThanOrEqual(v.width + 1e-6);
    // NOT FANNED, A ROW TO ATTENTION — level, the same steps as the arc's, pinned to the same edges.
    setHandPose(b.chair, { fan: false, shrink: false, tuck: false });
    hud.refresh();
    expect(hud.scale()).toBeCloseTo(scales[0]!, 6);
    const row = laid();
    expect(new Set(row.map((p) => p.y)).size, "level").toBe(1);
    expect(byId(hud.root, HAND_HUD_BOX)!.children.every((c) => (fieldsOf<TransformableFields>(c, "Transformable")?.angle ?? 0) === 0)).toBe(true);
    expect(row[0]!.x + row[14]!.x).toBeCloseTo(0, 6);
    // SHRUNK, THE CARDS PRESS INTO EACH OTHER SO HARD THE COUNT IS HARD TO READ — at the same size,
    // in a row and on the arc alike.
    setHandPose(b.chair, { fan: false, shrink: true, tuck: false });
    hud.refresh();
    expect(hud.scale()).toBeCloseTo(scales[0]!, 6);
    const packed = laid();
    expect(packed[1]!.x - packed[0]!.x).toBeLessThan(0.15);
    setHandPose(b.chair, { fan: true, shrink: true, tuck: false });
    hud.refresh();
    const packedArc = laid();
    expect(packedArc[8]!.x - packedArc[7]!.x).toBeLessThan(0.15);
    expect(lean(14)).toBeGreaterThan(0);
    expect(lean(14)).toBeLessThan(8);
    // TUCKED, THE STRIP IS LET DOWN UNDER THE BAR with a sliver showing — the height alone: the
    // same row, the same steps, and less of the foot spoken for.
    const rootAt = () => fieldsOf<TransformableFields>(hud.root, "Transformable")!.at!.y;
    const up = rootAt();
    const floorUp = hud.floor();
    setHandPose(b.chair, { fan: true, shrink: true, tuck: true });
    hud.refresh();
    expect(laid()).toEqual(packedArc);
    expect(rootAt()).toBeGreaterThan(up);
    expect(hud.floor()).toBeLessThan(floorUp);
    hud.stop();
  });

  it("hud.the-fan-runs-edge-to-edge-and-few-cards-keep-together — the arc's ends on the glass's edges, a cap on the step, the middle always the middle", () => {
    // THE OWNER'S TWO RULES OF THE FAN. A full hand's arc is PINNED TO THE EDGES of the glass:
    // the outer cards stand at its sides, on a shallow arc (a wide radius). And few cards do NOT
    // spread to the edges to do it: two or three stand a card apart in the middle, because the
    // distance between neighbours has a ceiling, not only a floor.
    const b = bench();
    const hud = handHud(b.host, { seat: "south", desk: () => b.desk, ink: "accent" });
    setHandPose(b.chair, { fan: true, shrink: false, tuck: false });
    const laid = (): { x: number; y: number }[] => {
      const strip = byId(hud.root, HAND_HUD_BOX)!;
      const name = fieldsOf<{ layout: string }>(strip, "Container")!.layout;
      return layoutRecord(name)!.place(layoutChildren(strip), footprint(strip)).map((p) => ({ x: p!.x, y: p!.y }));
    };
    const deal = (n: number): void => {
      for (const old of [...b.chair.children]) if (old.id.startsWith("c")) remove(b.chair, old);
      for (let i = 0; i < n; i += 1) add(b.chair, card(`c${i}`));
      layHand(b.chair);
      hud.refresh();
    };
    const u = b.host.unit();
    const glassW = b.host.viewport().width / u / hud.scale();
    // TWO CARDS: side by side in the middle, a card and a hair apart — not one at each edge.
    deal(2);
    const two = laid();
    expect(two[1]!.x - two[0]!.x).toBeLessThan(1.1);
    expect(two[1]!.x - two[0]!.x).toBeGreaterThan(1);
    expect(two[0]!.x + two[1]!.x).toBeCloseTo(0, 6);
    // THREE: the same step, still centred — the middle one dead centre.
    deal(3);
    const three = laid();
    expect(three[1]!.x).toBeCloseTo(0, 6);
    expect(three[2]!.x - three[1]!.x).toBeCloseTo(two[1]!.x - two[0]!.x, 1);
    // A FULL HAND: pinned to the glass's edges — by the outer cards' OUTERMOST CORNERS, which a
    // leaning card throws further out than its centre: the left card's rank corner stays on the
    // glass with a tenth of a card to spare, and the right one the same, so the fan is symmetric.
    const reach = (i: number): number => {
      const shown = byId(hud.root, HAND_HUD_BOX)!.children;
      const a = ((fieldsOf<TransformableFields>(shown[i]!, "Transformable")?.angle ?? 0) * Math.PI) / 180;
      return 0.5 * Math.cos(a) + 0.7 * Math.abs(Math.sin(a));
    };
    deal(12);
    const full = laid();
    expect(full[0]!.x - reach(0)).toBeCloseTo(-glassW / 2 + 0.1, 2);
    expect(full[11]!.x + reach(11)).toBeCloseTo(glassW / 2 - 0.1, 2);
    expect(full[0]!.x + full[11]!.x).toBeCloseTo(0, 6);
    // ...ON A SHALLOW ARC: the outer cards drop, but less than half a card.
    expect(full[0]!.y - full[5]!.y).toBeGreaterThan(0);
    expect(full[0]!.y - full[5]!.y).toBeLessThan(0.7);
    // AND MORE CARDS STILL PRESS TOGETHER INSIDE THE SAME CHORD, never past the edges.
    deal(15);
    const more = laid();
    expect(more[0]!.x - reach(0)).toBeCloseTo(-glassW / 2 + 0.1, 2);
    expect(more[14]!.x - more[0]!.x).toBeLessThan(full[11]!.x - full[0]!.x + 1e-6);
    hud.stop();
  });

  it("hud.the-cards-glide-between-lays — a picture keeps its name across refreshes, and every fold names a road", () => {
    // A CARD DEALT INTO THE HAND MOVES THE REST OVER, and they are seen moving: what the animator
    // eases is a node whose NAME survived and whose rest changed. A picture rebuilt under a fresh
    // name every refresh is a new card that appears where it lands — so the same felt card keeps
    // the same picture name, the arrangements say how a move is eased, and the screen is told it
    // changed, so the eased road starts on THIS frame and not the next reconcile's.
    const b = bench();
    const hud = handHud(b.host, { seat: "south", desk: () => b.desk, ink: "accent" });
    const shown = (): Map<string, string> => {
      const strip = byId(hud.root, HAND_HUD_BOX)!;
      return new Map(strip.children.map((c, i) => [hud.cards()[i]!, c.id]));
    };
    add(b.chair, card("c0"));
    add(b.chair, card("c1"));
    layHand(b.chair);
    hud.refresh();
    const before = shown();
    let told = 0;
    const stopListening = b.host.onChange(() => (told += 1));
    add(b.chair, card("c2"));
    layHand(b.chair);
    hud.refresh();
    const after = shown();
    expect(after.get("c0")).toBe(before.get("c0"));
    expect(after.get("c1")).toBe(before.get("c1"));
    expect(after.get("c2")).toBeDefined();
    expect(told, "the host heard the screen change").toBeGreaterThan(0);
    // A CARD PLAYED: the survivors keep their names, the gone one's is not handed to a newcomer.
    remove(b.chair, byId(b.chair, "c1")!);
    layHand(b.chair);
    hud.refresh();
    const played = shown();
    expect(played.get("c0")).toBe(before.get("c0"));
    expect(played.get("c2")).toBe(after.get("c2"));
    expect(played.has("c1")).toBe(false);
    // EVERY POSE NAMES ITS ROAD — an eased one, not a snap.
    for (const pose of HAND_POSES) {
      setHandPose(b.chair, pose);
      hud.refresh();
      const strip = byId(hud.root, HAND_HUD_BOX)!;
      const road = layoutRecord(fieldsOf<{ layout: string }>(strip, "Container")!.layout)!.settle;
      expect(road, `the ${handPoseName(pose)} pose eases`).toBeDefined();
      expect(road!.ms).toBeGreaterThan(0);
    }
    stopListening();
    hud.stop();
  });

  it("hud.a-carried-card-courts-the-hand — the reach is a band from the pink line down, the lift grows into the hand's card, the place is outlined, the tuck comes off", () => {
    // THE OWNER'S RULE: a card carried down over the HUD goes INTO it — the more of it inside the
    // reach, the higher and bigger; past `HUD_COURT` it is the hand's own card size and a drop is a
    // drop into the hand; the hand shows the outline of the place it would take; and a hand put
    // away under the bar comes out to meet it.
    const b = bench();
    const hud = handHud(b.host, { seat: "south", desk: () => b.desk, ink: "accent" });
    add(b.chair, card("c0"));
    add(b.chair, card("c1"));
    layHand(b.chair);
    hud.refresh();
    const v = b.host.viewport();
    const top = hud.reach();
    expect(top).toBeGreaterThan(v.height / 2);
    expect(top).toBeLessThan(v.height);
    // THE REACH IS A BAND: a box clear above it is out, one straddling it is in by the part below
    // the line, one wholly below is all in — the width never matters.
    expect(hud.entering({ y: top - 200, h: 100 })).toBe(0);
    expect(hud.entering({ y: top - 75, h: 100 })).toBeCloseTo(0.25, 6);
    expect(hud.entering({ y: top - 40, h: 100 })).toBeCloseTo(0.6, 6);
    expect(hud.entering({ y: top + 10, h: 100 })).toBe(1);
    // THE LIFT ON THE WAY IN: the carry's own with nothing inside, the hand's card LIFTED at the
    // mark and past it (the lifted one of them, a touch bigger), and between the two in between.
    expect(courtLift(0, 1.06, 1.5)).toBeCloseTo(1.06);
    expect(courtLift(HUD_COURT / 2, 1.06, 1.5)).toBeCloseTo(1.06 * 1.25);
    expect(courtLift(HUD_COURT, 1.06, 1.5)).toBeCloseTo(1.06 * 1.5);
    expect(courtLift(1, 1.06, 1.5)).toBeCloseTo(1.06 * 1.5);
    expect(hud.cardPx(), "a card on the glass, in pixels").toBeCloseTo(b.host.unit() * hud.scale(), 6);
    // THE OUTLINE OF ITS PLACE: one more child in the strip, laid at the END by the same arrangement,
    // and gone when the courting stops.
    const strip = byId(hud.root, HAND_HUD_BOX)!;
    const before = strip.children.length;
    const laid = (): { x: number }[] => layoutRecord(fieldsOf<{ layout: string }>(strip, "Container")!.layout)!.place(layoutChildren(strip), footprint(strip)).map((p) => ({ x: p!.x }));
    hud.court(true);
    expect(strip.children.length).toBe(before + 1);
    const outline = strip.children[strip.children.length - 1]!;
    expect(hud.cards(), "the outline is not a card").toEqual(["c0", "c1"]);
    expect(hud.standFor(outline)).toBeUndefined();
    const places = laid();
    expect(places[2]!.x, "at the end of the hand").toBeGreaterThan(places[1]!.x);
    expect(places[0]!.x + places[2]!.x, "…and the hand made room, still centred").toBeCloseTo(0, 6);
    hud.court(false);
    expect(strip.children.length).toBe(before);
    // AN EMPTY HAND courted shows the outline alone, not the dashed place beside it.
    for (const c of [...b.chair.children]) remove(b.chair, c);
    layHand(b.chair);
    hud.court(true);
    expect(byId(hud.root, HAND_HUD_BOX)!.children.length).toBe(1);
    hud.court(false);
    // THE TUCK COMES OFF, and says so; a hand not tucked says nothing was written.
    setHandPose(b.chair, { fan: false, shrink: false, tuck: true });
    expect(untuck(b.chair)).toBe(true);
    expect(handPose(b.chair).tuck).toBe(false);
    expect(untuck(b.chair)).toBe(false);
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
