// THE LIVE DESK — what a board two people are reading has to be, before anybody touches it.
//
// The mechanics are the magnetism page's and are guarded there; the mirroring is the scene's wiring
// and is checked on the glass. What is only ever true HERE is the desk itself: one board, an area
// each, and every card face up — because the page deliberately teaches sharing and not hiding.

import { describe, expect, it } from "vitest";
import { caps, facing, fieldsOf, heapOf, keenOf, surfaceRecord, type Node, type SurfacedFields, type TransformableFields } from "../../src/index.js";
import { liveMap, LIVE, SEATS } from "./liveMap.js";

const areas = (desk: Node): Node[] => desk.children.filter((n) => caps(n).has("Acceptor"));
const cards = (desk: Node): Node[] => desk.children.filter((n) => heapOf(n) === "card");

describe("the shared desk", () => {
  it("live.every-seat-has-an-area-and-they-face-each-other", () => {
    // Two seats, two areas, on opposite sides of one board — a player whose area was not across
    // from the other's would be sitting at a different desk.
    const desk = liveMap();
    expect(areas(desk).length).toBe(SEATS.length);
    const ys = areas(desk).map((n) => fieldsOf<TransformableFields>(n, "Transformable")!.at!.y);
    expect(Math.sign(ys[0]!)).toBe(-Math.sign(ys[1]!));
    // ...and both may be reached by anybody: whose turn it is and what may go where are a game's
    // rules, and this page has none.
    for (const area of areas(desk)) expect(caps(area).has("Acceptor")).toBe(true);
  });

  it("live.every-card-is-face-up — the page teaches sharing, not hiding", () => {
    // Hiding is real and the kit does it, but it is a second subject, and a page teaching two at
    // once teaches neither: with cards hidden a reader watching one screen cannot tell "they have
    // not moved" from "they moved something I may not see".
    const desk = liveMap();
    expect(cards(desk).length).toBe(LIVE.cards);
    for (const card of cards(desk)) expect(facing(card)).toBe("up");
  });

  it("live.every-card-throws-a-shadow — height is invisible from above without one", () => {
    const desk = liveMap();
    for (const card of cards(desk)) expect(caps(card).has("ShadowCaster")).toBe(true);
    // ...and an AREA does not: it is a place sunk into the felt, not a thing lying on it.
    for (const area of areas(desk)) expect(caps(area).has("ShadowCaster")).toBe(false);
  });

  it("live.the-desk-and-its-areas-say-what-a-touch-takes — or no drop is possible at all", () => {
    // A move plan starts by asking the SOURCE what a touch takes out of it. A container with no
    // `Grabber` hands back nothing, and every drop on the desk is denied before any zone is asked —
    // which is a failure with no symptom except that nothing ever works.
    const desk = liveMap();
    expect(caps(desk).has("Grabber"), "the felt").toBe(true);
    for (const area of areas(desk)) expect(caps(area).has("Grabber"), "and each area").toBe(true);
  });

  it("live.an-area-is-dashed-in-its-owners-colour-and-solid-only-under-the-hand", () => {
    // Both areas were one surface, stroked in `panelBorder` — a token a hair off the felt it is
    // drawn on. On a desktop that is a faint line; on a phone it is nothing at all, and the page
    // where knowing WHOSE area you are looking at is the whole subject showed two invisible boxes.
    //
    // The colour each seat is already drawn in is the answer to both halves at once: the area is
    // visible, and it is visibly somebody's. So this pins the border to the SEAT'S OWN ink, and
    // pins the two apart — one colour for both would be back to a box you cannot place.
    const desk = liveMap();
    const inks = new Set<string>();
    for (const area of areas(desk)) {
      const named = fieldsOf<SurfacedFields>(area, "Surfaced")?.surface;
      const drawn = named ? surfaceRecord(named) : undefined;
      expect(drawn, `${named}: named but never registered`).toBeDefined();
      const stroke = drawn?.stroke;
      expect(stroke?.color, "an area with no border has no edge to aim at").toBeTruthy();
      // ...AND IT IS A LABEL, NOT AN EVENT. A solid line claims something at every moment of the
      // game, when all it is saying is "this patch is somebody's"; said solid it reads as the zone
      // being ON, and then the zone lighting up for real has nothing left to change into.
      expect(stroke?.dash, "dashed: a boundary drawn on the felt, not a thing standing on it").toBeDefined();
      // The loud one is the SAME colour and solid, worn only while the hand is over it — one
      // outline in two states, so nothing is added to or taken off the glass.
      const keen = keenOf(area);
      expect(keen?.recipe, "and solid is kept for the zone that is taking the card").toBe("ring");
      expect(keen?.tint, "the same ink: what changed is that this one is taking it").toBe(stroke!.color);
      inks.add(String(stroke!.color));
    }
    // EACH SEAT'S OWN, and the page's own list of them — not a colour invented here.
    expect([...inks].sort(), "the seats' inks, and one each").toEqual(SEATS.map((s) => String(s.ink)).sort());
    expect(inks.size, "two areas one colour is two areas nobody can tell apart").toBe(SEATS.length);
  });
});
