// "These two are touching" — the question a pile IS, and the walk that turns pairs into piles.

import { describe, expect, it } from "vitest";
import { islands, outlinesTouch, placedOutline } from "./overlap.js";
import { IDENTITY, move, rotate, compose } from "./transform.js";
import { type Point } from "./atoms/bounded.js";

/** A rectangle's four corners about its own middle — a card, said as plainly as possible. */
const card = (w = 0.6, h = 0.9): readonly Point[] => [
  { x: -w / 2, y: -h / 2 },
  { x: w / 2, y: -h / 2 },
  { x: w / 2, y: h / 2 },
  { x: -w / 2, y: h / 2 },
];

describe("overlap", () => {
  it("overlap.two-shapes-touch-when-no-line-fits-between-them — by separating axis, not by boxes", () => {
    const a = placedOutline(card(), IDENTITY);
    // Side by side with a hand's width between them: nothing shared, and a line fits.
    expect(outlinesTouch(a, placedOutline(card(), move(2, 0)))).toBe(false);
    // Overlapping by a third of a card.
    expect(outlinesTouch(a, placedOutline(card(), move(0.4, 0)))).toBe(true);
    // Edge to edge exactly: sharing a line is touching, and a table would say so too.
    expect(outlinesTouch(a, placedOutline(card(), move(0.6, 0)))).toBe(true);
    // A hair apart is not, until the caller says how big a hair it will forgive.
    expect(outlinesTouch(a, placedOutline(card(), move(0.65, 0)))).toBe(false);
    expect(outlinesTouch(a, placedOutline(card(), move(0.65, 0)), 0.1)).toBe(true);
    // And `slack` reads the other way too: a real overlap of at least that much, or nothing.
    expect(outlinesTouch(a, placedOutline(card(), move(0.55, 0)), -0.1)).toBe(false);
    expect(outlinesTouch(a, placedOutline(card(), move(0.4, 0)), -0.1)).toBe(true);
  });

  it("overlap.a-BOX-would-lie-about-a-turned-card — which is why the outlines are asked, not their extents", () => {
    // Two cards at forty-five degrees, corner to corner. Their axis-aligned boxes overlap heartily;
    // the cards themselves do not come near each other, and a pile built on boxes would gather up
    // two cards that a player can see are apart.
    const a = placedOutline(card(), rotate(45));
    const b = placedOutline(card(), compose(move(0.95, 0.95), rotate(45)));
    expect(outlinesTouch(a, b)).toBe(false);
    // Slide it in and they do meet — the test is about the shapes, not about their bounding boxes.
    expect(outlinesTouch(a, placedOutline(card(), compose(move(0.3, 0.3), rotate(45))))).toBe(true);
  });

  it("overlap.nothing-is-inside-a-line — a shape with no area shares no ground", () => {
    const a = placedOutline(card(), IDENTITY);
    expect(outlinesTouch(a, [{ x: 0, y: 0 }])).toBe(false);
    expect(outlinesTouch(a, [{ x: 0, y: 0 }, { x: 1, y: 0 }])).toBe(false);
    expect(outlinesTouch([], [])).toBe(false);
  });

  it("islands.a-chain-is-ONE-pile — the fourth card added to the third joined the first two", () => {
    // A card touching a card touching a card is one pile, and that is why this is a walk rather
    // than a pairing. Nothing about how it looks says the chain is two things.
    const at = [0, 0.5, 1.0, 5, 5.4, 9]; // three, then two, then one alone
    const near = (a: number, b: number): boolean => Math.abs(a - b) <= 0.6;
    const found = islands(at, near);
    expect(found.map((g) => g.length)).toEqual([3, 2, 1]);
    expect(found[0]).toEqual([0, 0.5, 1.0]);
    // The chain holds however long it is, and the ends never touch each other directly.
    expect(islands([0, 0.5, 1, 1.5, 2, 2.5], near).map((g) => g.length)).toEqual([6]);
    // Order is the order the members appear, so an unchanged desk answers the same twice.
    expect(islands([9, 0, 5, 0.5], near)).toEqual([[9], [0, 0.5], [5]]);
    expect(islands([], near)).toEqual([]);
  });
});
