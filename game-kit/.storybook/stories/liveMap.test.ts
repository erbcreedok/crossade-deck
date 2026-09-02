// THE LIVE DESK — what a board two people are reading has to be, before anybody touches it.
//
// The mechanics are the magnetism page's and are guarded there; the mirroring is the scene's wiring
// and is checked on the glass. What is only ever true HERE is the desk itself: one board, an area
// each, and every card face up — because the page deliberately teaches sharing and not hiding.

import { describe, expect, it } from "vitest";
import { caps, facing, fieldsOf, heapOf, type Node, type TransformableFields } from "../../src/index.js";
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

  it("live.the-desk-and-its-areas-say-what-a-touch-takes — or no drop is possible at all", () => {
    // A move plan starts by asking the SOURCE what a touch takes out of it. A container with no
    // `Grabber` hands back nothing, and every drop on the desk is denied before any zone is asked —
    // which is a failure with no symptom except that nothing ever works.
    const desk = liveMap();
    expect(caps(desk).has("Grabber"), "the felt").toBe(true);
    for (const area of areas(desk)) expect(caps(area).has("Grabber"), "and each area").toBe(true);
  });
});
