// THE ROUND DESK — what a table with no corners and no hand areas has to be before anybody sits at
// it. The physics of the border is the kit's (`ballistic.a-round-wall-reflects`); what is only ever
// true HERE is the desk: one felt, one deck, no zones, and an edge nothing can be taken past.

import { describe, expect, it } from "vitest";
import { byId, caps, extentOf, fieldsOf, footprint, heapOf, insideWalls, stepSlide, surfaceRecord, velocityOf, type Body, type Node, type SurfacedFields, type TransformableFields } from "game-kit";
import { LIVE } from "./liveMap.js";
import { isHand } from "./handZone.js";
import { ROUND_EDGE, ROUND_FELT, ROUND_PAGE, ROUND_R, ROUND_RIM, roundMap, roundRoom, roundWalls } from "./roundMap.js";

/** A slide run out frame by frame on the kit's own step — the same run the ballistic tests use. */
function runSlide(b: Body, cfg: Parameters<typeof stepSlide>[1], frames: number): Body[] {
  const path = [b];
  for (let i = 0; i < frames; i++) path.push(stepSlide(path[path.length - 1]!, cfg, 1 / 60));
  return path;
}

const cards = (desk: Node): Node[] => desk.children.filter((n) => heapOf(n) === "card");
const seatOf = (n: Node) => fieldsOf<TransformableFields>(n, "Transformable")!.at!;

describe("the round desk", () => {
  it("round.one-felt-and-a-hand-per-person — the only places on it belong to people", () => {
    const desk = roundMap();
    // Every zone here is somebody's HAND. There is still no shared tray, no discard and no plate:
    // what a card is DOING is a game's knowledge, and two anonymous areas on a felt this size would
    // be two magnets fighting over every drop. Whose hand it is, is not anonymous.
    expect(desk.children.filter((n) => caps(n).has("Acceptor")).every(isHand)).toBe(true);
    // THE DESK IS THE PAGE — the game zone, a square round the table — and the felt is ROUND, a
    // node of its own on it. Measured off the drawn shapes rather than the numbers, because the
    // numbers are what the walls are built from and a felt drawn to a different one is the bug.
    const page = extentOf(footprint(desk)!);
    expect(page.w).toBeCloseTo(ROUND_PAGE * 2);
    expect(page.h).toBeCloseTo(ROUND_PAGE * 2);
    const felt = byId(desk, ROUND_FELT)!;
    const { w, h } = extentOf(footprint(felt)!);
    expect(w).toBeCloseTo(ROUND_R * 2);
    expect(h).toBeCloseTo(ROUND_R * 2);
    // THE EDGE IS THE DESIGN'S THREE RINGS under the felt, largest first — keyline, dark wood, light
    // wood — so the table reads as furniture, and the page has an edge of its own the eye can see.
    const before = desk.children.slice(0, desk.children.indexOf(felt));
    expect(before.map((n) => extentOf(footprint(n)!).w / 2)).toEqual([ROUND_R + ROUND_RIM, ROUND_R + ROUND_EDGE.dark + ROUND_EDGE.light, ROUND_R + ROUND_EDGE.light]);
    for (const ring of before) expect(surfaceRecord(fieldsOf<SurfacedFields>(ring, "Surfaced")!.surface)?.layers[0]?.paint).toBeTruthy();
    expect(surfaceRecord(fieldsOf<SurfacedFields>(desk, "Surfaced")!.surface)?.stroke?.color).toBeTruthy();
    // ...AND THE FELT IS LIT: a wash, brightest above the middle, not one flat colour.
    const wash = surfaceRecord(fieldsOf<SurfacedFields>(felt, "Surfaced")!.surface)?.layers[0]?.gradient;
    expect(wash?.stops.length).toBeGreaterThanOrEqual(3);
  });

  it("round.the-deck-stands-in-the-middle — the one place on a round table equally far from everybody", () => {
    const desk = roundMap();
    expect(cards(desk).length).toBe(LIVE.cards);
    for (const card of cards(desk)) {
      const at = seatOf(card);
      expect(Math.hypot(at.x, at.y), "a card of the deck is at the middle, not off toward a seat").toBeLessThan(0.6);
      expect(caps(card).has("ShadowCaster"), "height is invisible from above without a shadow").toBe(true);
    }
    // The felt itself says what a touch takes off it, or no drag on this desk is possible at all.
    expect(caps(desk).has("Grabber")).toBe(true);
  });

  it("round.the-page-holds-a-card-and-the-felt-traps-a-throw — carried anywhere on the page, thrown never off the table", () => {
    // THE OWNER'S RULE: a card may be carried off the table but never off the page; a throw on the
    // page bounces off the page's edge and may fly onto the table; once on the table a throw
    // bounces off the felt's edge from inside and cannot leave it — only a hand takes it off.
    const desk = roundMap();
    const card = cards(desk)[0]!;
    const tray = roundWalls(card);
    // INSET BY THE CARD'S OWN REACH, page and felt alike: the walls hold the card, not the point it
    // is drawn from.
    const { w, h } = extentOf(footprint(card)!);
    const reach = Math.hypot(w, h) / 2;
    expect(tray.inner.r).toBeCloseTo(ROUND_R - reach);
    expect(tray.outer.x1).toBeCloseTo(ROUND_PAGE - reach);
    expect(tray.inner.r + reach).toBeLessThanOrEqual(ROUND_R + 1e-9);
    // A CARRY: held by the page alone — a point off the table but on the page is not moved, one off
    // the page comes back to the page's edge.
    expect(insideWalls(tray, { x: ROUND_R + 1, y: 2 })).toEqual({ x: ROUND_R + 1, y: 2 });
    const held = insideWalls(tray, { x: 40, y: 2 });
    expect(held.x).toBeCloseTo(tray.outer.x1);
    expect(held.y).toBe(2);
    // A THROW ON THE TABLE: whatever the speed, it never leaves the felt.
    const cfg = { friction: 2, spinFriction: 0, bounce: 0.5, walls: tray };
    const flung = runSlide({ pos: { x: 1, y: 0 }, vel: velocityOf(40, 20), angle: 0, spin: 0, up: 0, upVel: 0 }, cfg, 400);
    for (const b of flung) expect(Math.hypot(b.pos.x, b.pos.y)).toBeLessThanOrEqual(tray.inner.r + 1e-9);
    // A THROW ON THE PAGE, AT THE TABLE: it flies in, and never out again.
    const thrown = runSlide({ pos: { x: ROUND_PAGE - 1, y: 0 }, vel: velocityOf(40, 180), angle: 0, spin: 0, up: 0, upVel: 0 }, cfg, 400);
    const entered = thrown.findIndex((b) => Math.hypot(b.pos.x, b.pos.y) <= tray.inner.r);
    expect(entered).toBeGreaterThan(0);
    for (const b of thrown.slice(entered)) expect(Math.hypot(b.pos.x, b.pos.y)).toBeLessThanOrEqual(tray.inner.r + 1e-9);
    // A THROW ON THE PAGE, AWAY FROM THE TABLE: the page's edge turns it, and it stays on the page.
    const away = runSlide({ pos: { x: ROUND_PAGE - 1, y: 0 }, vel: velocityOf(40, 0), angle: 0, spin: 0, up: 0, upVel: 0 }, cfg, 400);
    for (const b of away) expect(b.pos.x).toBeLessThanOrEqual(tray.outer.x1 + 1e-9);
  });

  it("round.the-room-is-the-page — exactly, no more and no less", () => {
    const room = roundRoom();
    expect(room.w).toBe(room.h);
    expect(room.w / 2).toBeCloseTo(ROUND_PAGE);
    // Centred on the felt: a room laid out from a corner would hold the view in one quarter of it.
    expect(room.x).toBeCloseTo(-room.w / 2);
    expect(room.y).toBeCloseTo(-room.h / 2);
  });

  it("round.the-felt-lies-under-the-kit's-own-cone — not just under the pieces on it", () => {
    // THE FELT IS NOT `root` — the page is (`Surfaced` on the desk itself), so the plan's "ground"
    // rank never catches the felt or its edge rings, and they tie with the kit's presence cone
    // (`CONE_Z`, -1 in presence.ts) at the plan's default z of 0 the same as any ordinary piece.
    // A cone sent under every piece on the felt sank under the felt too — the one thing a look is
    // meant to lie on. z BELOW -1 on the felt and its rings is what keeps that from happening again.
    const desk = roundMap();
    const felt = byId(desk, ROUND_FELT)!;
    expect(fieldsOf<TransformableFields>(felt, "Transformable")?.z).toBeLessThan(-1);
  });
});
