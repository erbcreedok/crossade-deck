// @vitest-environment jsdom
// A LOADING SCREEN IS A PROMISE TO GO AWAY.
//
// Everything it gets wrong is the same mistake wearing different clothes: it is still there. Left up
// after the table arrived, it is a game that never loaded; left up after the game was torn down, it
// is a shelf with a wait painted over it; left with its timer running, it is a phone warming in a
// pocket. So the tests here are almost all about the leaving.
//
// The one that is not is about the cards: they come from the deck the table plays with, and the day
// somebody draws a second ace for the loading screen is the day the two start to drift.

import { crossade, deckFaceImage } from "@game-presets/cards";
import { beforeEach, describe, expect, it } from "vitest";
import { loadingCards } from "./loading.js";

const stage = (): HTMLElement => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
};

describe("look.the-loading-screen-goes-away", () => {
  beforeEach(() => {
    document.body.replaceChildren();
  });

  it("covers the region it is given, and says so", () => {
    const over = stage();
    const loading = loadingCards(over, "Карты");
    expect(loading.showing()).toBe(true);
    const sheet = over.firstElementChild as HTMLElement;
    expect(sheet.style.position).toBe("absolute");
    expect(sheet.style.inset, "over the whole region, not a corner of it").toBe("0");
    expect(sheet.style.background, "the page's own felt, not a hole in it").not.toBe("");
    // ABOVE THE DESK'S OWN COVER (z-index 6), which comes off as soon as the seat is known — earlier
    // than the table is worth looking at.
    expect(Number(sheet.style.zIndex)).toBeGreaterThan(6);
    expect(sheet.textContent, "and it names what is coming").toContain("Карты");
  });

  it("takes itself off the page, and does not mind being told twice", () => {
    const over = stage();
    const loading = loadingCards(over);
    loading.done();
    expect(loading.showing(), "down the moment it is told").toBe(false);
    expect(() => loading.done(), "every way a game can finish ends by calling it").not.toThrow();
    expect((over.firstElementChild as HTMLElement).style.opacity, "it fades rather than cutting").toBe("0");
  });

  it("shows the deck's own cards, and the same three the shelf's tile does", () => {
    const over = stage();
    loadingCards(over);
    const faces = [...over.querySelectorAll("img")].map((img) => img.getAttribute("src"));
    expect(faces.length, "three of them").toBe(3);
    const style = { layout: "classic", fourColour: false, cyrillic: false } as const;
    const specOf = (id: string) => crossade().find((c) => c.id === id)!;
    expect(faces, "an ace, a king and a queen — the tile, face up").toEqual([
      deckFaceImage(specOf("spade-A"), style),
      deckFaceImage(specOf("heart-K"), style),
      deckFaceImage(specOf("diamond-Q"), style),
    ]);
  });

  it("starts with the three cards side by side, each in its own slot", () => {
    const over = stage();
    loadingCards(over);
    const at = [...over.querySelectorAll("img")].map((img) => (img as HTMLElement).style.transform);
    expect(new Set(at).size, "no two cards start in one place").toBe(3);
    for (const one of at) expect(one).toMatch(/^translate3d\(\d+px,0,0\)$/);
  });
});
