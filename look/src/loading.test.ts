// @vitest-environment jsdom
// A LOADING SCREEN IS A PROMISE TO GO AWAY.
//
// Everything it gets wrong is the same mistake wearing different clothes: it is still there. Left up
// after the table arrived, it is a game that never loaded; left up after the game was torn down, it
// is a shelf with a wait painted over it. So most of what is checked here is the leaving.
//
// The rest is about WHOSE mark it is. It used to be three cards — and then it was shown for chess,
// and a player waiting for a board watched an ace, a king and a queen hop about. The mark belongs to
// the product, not to one game: a cross for everybody, and the LABEL says what is coming.

import { beforeEach, describe, expect, it } from "vitest";
import { CROSS_PATH, loadingCross } from "./loading.js";

const stage = (): HTMLElement => {
  const el = document.createElement("div");
  document.body.appendChild(el);
  return el;
};

describe("look.the-loading-screen-goes-away", () => {
  beforeEach(() => {
    document.body.replaceChildren();
    document.getElementById("crossade-loading")?.remove();
  });

  it("covers the region it is given, and says what is coming", () => {
    const over = stage();
    const loading = loadingCross(over, "Загружаю шахматы");
    expect(loading.showing()).toBe(true);
    const sheet = over.firstElementChild as HTMLElement;
    expect(sheet.className, "one class, one stylesheet").toBe("crossade-loading");
    expect(sheet.textContent, "the label is the game's own, declined for a wait").toBe("Загружаю шахматы");
    expect(sheet.querySelector("path")?.getAttribute("d"), "and the mark is the cross").toBe(CROSS_PATH);
  });

  it("shows no game's furniture — the mark is the product's", () => {
    // THE BUG THIS REPLACED, named so it cannot come back quietly: a chess loader made of cards.
    const over = stage();
    loadingCross(over, "Загружаю шахматы");
    expect(over.querySelectorAll("img").length, "nothing fetched, nothing borrowed from a game").toBe(0);
    expect(over.querySelectorAll("path").length, "one path — the cross, and only it").toBe(1);
  });

  it("takes itself off the page, and does not mind being told twice", () => {
    const over = stage();
    const loading = loadingCross(over, "Загружаю карты");
    loading.done();
    expect(loading.showing(), "down the moment it is told").toBe(false);
    expect(() => loading.done(), "every way a game can finish ends by calling it").not.toThrow();
    expect((over.firstElementChild as HTMLElement).classList.contains("gone"), "it fades rather than cutting").toBe(true);
  });

  it("installs its rules once, however many screens are raised", () => {
    // A `<style>` per screen is a leak that shows up as a document with forty identical rule sets
    // after forty games — invisible until somebody profiles a long session on a phone.
    const a = stage();
    const b = stage();
    loadingCross(a, "Загружаю карты").done();
    loadingCross(b, "Загружаю нарды");
    expect(document.querySelectorAll("#crossade-loading").length).toBe(1);
  });

  it("draws the cross in four phases — fill, hold, clear, hold", () => {
    const over = stage();
    loadingCross(over, "Загружаю хаб");
    const css = document.getElementById("crossade-loading")!.textContent!;
    expect(css, "the head runs the whole outline").toMatch(/40%\s*\{ stroke-dasharray: 1 1; stroke-dashoffset: 0;/);
    expect(css, "…and the whole cross is HELD").toMatch(/50%\s*\{ stroke-dasharray: 1 1; stroke-dashoffset: 0;/);
    expect(css, "then the tail runs the same road and empties it").toMatch(/90%\s*\{ stroke-dasharray: 0 1; stroke-dashoffset: -1;/);
    expect(css, "…and empty is HELD to the end").toMatch(/100%\s*\{ stroke-dasharray: 0 1; stroke-dashoffset: -1;/);
    // A round cap draws a zero-length dash as a DOT; without this the empty hold keeps a red pip on
    // the crown. Measured in a browser before the fix, which is why it is written down here.
    expect(css, "and empty means empty").toMatch(/90%\s*\{[^}]*stroke-opacity: 0;/);
  });

  it("holds the label as text, never as markup", () => {
    // It is a game's name today and a name somebody types tomorrow. A screen is not the place to
    // find out that the difference matters.
    const over = stage();
    loadingCross(over, "<img src=x onerror=1>");
    expect(over.querySelectorAll("img").length).toBe(0);
    expect(over.textContent).toBe("<img src=x onerror=1>");
  });
});
