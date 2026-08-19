// THE LAWS THIS FILE EXISTS FOR: the two spacings are geometry that has to CLOSE, and switching
// between them must not cost the player the game they are in the middle of.
//
// Neither is checkable by eye. A table whose columns are a hair wider than the box the screen is
// divided by loses the edge of the outer column, and a bar that outgrows its strip lands on the top
// row of cards — both look like a rendering bug and neither shows up until someone plays on a phone.

import { describe, expect, it } from "vitest";
import { add, fieldsOf, remove, type Node, type TransformableFields } from "game-kit";
import {
  buildBoard,
  columnsOf,
  densityName,
  densityNamed,
  isTall,
  layoutFor,
  nextLayout,
  relayBoard,
  TABLE_LAYOUTS,
  TALL_ROOMY,
  TALL_TIGHT,
  WIDE_ROOMY,
  WIDE_TIGHT,
  type TableLayout,
} from "./board.js";
import { BAR_GAP, CONTROL_H, CONTROL_W } from "../look/surfaces.js";
import { browserStore, clearSave, loadLayout, LAYOUT_KEY, SAVE_KEY, storeLayout, type Store } from "./save.js";

/** Where a node sits — the only thing a re-spacing is allowed to change about a slot. */
const seatOf = (n: Node): { x: number; y: number } => fieldsOf<TransformableFields>(n, "Transformable")!.at;

/** A card is one unit wide, so this is what the outermost columns actually reach across. */
const spread = (layout: TableLayout): number => columnsOf(layout)[6]! - columnsOf(layout)[0]! + 1;

/** The row of four controls, end to end. */
const barWidth = CONTROL_W * 4 + BAR_GAP * 3;

function fakeStore(): Store & { readonly seen: Map<string, string> } {
  const seen = new Map<string, string>();
  return { seen, read: (k) => seen.get(k), write: (k, v) => void seen.set(k, v), forget: (k) => void seen.delete(k) };
}

describe("the two spacings", () => {
  it.each([
    ["wide", WIDE_ROOMY, WIDE_TIGHT] as const,
    ["tall", TALL_ROOMY, TALL_TIGHT] as const,
  ])("layout.%s-tight-is-actually-tighter — less air, and therefore a bigger card", (_family, roomy, tight) => {
    expect(tight.pitch).toBeLessThan(roomy.pitch);
    expect(tight.step).toBeLessThan(roomy.step);
    // The point of the whole feature: the screen is divided by a NARROWER box, so the unit grows.
    expect(tight.fit.w).toBeLessThan(roomy.fit.w);
  });

  it("layout.a-phone-gets-a-phone-table — and the card grows for it", () => {
    // THE FAILURE THIS EXISTS FOR: fitted to a wide box, an upright phone divided 390 by 8.6 and
    // 844 by 8.4, so the width bound the scale, four hundred and sixty pixels of height stood empty
    // and the table floated in the middle of a black screen.
    const phone = { width: 390, height: 844 };
    const unitOf = (l: TableLayout): number => Math.min(phone.width / l.fit.w, phone.height / l.fit.h);
    expect(isTall(phone)).toBe(true);
    expect(layoutFor(phone, true)).toBe(TALL_TIGHT);
    expect(layoutFor({ width: 1280, height: 900 }, true)).toBe(WIDE_TIGHT);
    // The height is USED — most of it. Not ALL of it: stretched to the phone's own 1:2.2 the table
    // has nothing to fill the bottom with, and seven short columns over a black half are the same
    // emptiness moved downward.
    const tallUnit = unitOf(TALL_TIGHT);
    const covered = (TALL_TIGHT.fit.h * tallUnit) / phone.height;
    expect(covered).toBeGreaterThan(0.7);
    expect(covered).toBeLessThanOrEqual(1);
    // …and the card is bigger than the wide table gave it.
    expect(tallUnit).toBeGreaterThan(unitOf(WIDE_ROOMY) * 1.1);
  });

  it("layout.the-thumb-holds-the-bar — low on a phone, high on a wide screen", () => {
    // The top of an upright phone is the one place a thumb cannot reach.
    expect(TALL_ROOMY.barY).toBeGreaterThan(TALL_ROOMY.tableauY);
    expect(TALL_TIGHT.barY).toBeGreaterThan(TALL_TIGHT.tableauY);
    expect(WIDE_ROOMY.barY).toBeLessThan(WIDE_ROOMY.topY);
    expect(WIDE_TIGHT.barY).toBeLessThan(WIDE_TIGHT.topY);
  });

  it.each(TABLE_LAYOUTS.map((l) => [l.id, l] as const))("layout.%s-closes — nothing hangs over an edge", (_id, layout) => {
    // The columns fit the box the screen is divided by, or the outer column loses its edge.
    expect(spread(layout)).toBeLessThanOrEqual(layout.fit.w);
    // The bar fits that same box.
    expect(barWidth).toBeLessThanOrEqual(layout.fit.w);
    // The bar stands INSIDE the box, whichever end of it the bar is at…
    expect(layout.barY - CONTROL_H / 2).toBeGreaterThanOrEqual(-layout.fit.h / 2);
    expect(layout.barY + CONTROL_H / 2).toBeLessThanOrEqual(layout.fit.h / 2);
    // …and never over the top row of cards, which is 1.4 tall and centred on `topY`.
    const overlaps = layout.barY - CONTROL_H / 2 < layout.topY + 0.7 && layout.barY + CONTROL_H / 2 > layout.topY - 0.7;
    expect(overlaps, "the bar is drawn across the stock and the foundations").toBe(false);
  });

  it("layout.re-spacing-keeps-the-game — the slots move, the cards stay in them", () => {
    const board = buildBoard(WIDE_ROOMY);
    // Put a card in a column, so there is a game to lose.
    const card = board.stock.children[51]!;
    remove(board.stock, card);
    add(board.tableau[3]!, card);
    const before = board.tableau.map((p) => p.children.length);

    relayBoard(board, TALL_TIGHT);

    expect(board.tableau.map((p) => p.children.length)).toEqual(before);
    expect(card.parent).toBe(board.tableau[3]);
    expect(board.stock.children.length + board.tableau[3]!.children.length).toBe(52);
    // …and the slots really did move.
    expect(seatOf(board.tableau[0]!).x).toBeCloseTo(columnsOf(TALL_TIGHT)[0]!, 6);
    expect(seatOf(board.stock).y).toBeCloseTo(TALL_TIGHT.topY, 6);
  });

  it("layout.an-unknown-density-is-the-spacious-one — an old preference is never a crash", () => {
    expect(densityNamed("tight")).toBe(true);
    expect(densityNamed("whatever-shipped-last-year")).toBe(false);
    expect(densityNamed("")).toBe(false);
    expect(densityNamed(densityName(TALL_TIGHT))).toBe(true);
  });

  it("layout.the-control-offers-the-other-density — and never another screen", () => {
    // The press flips how packed the table is. It must NOT jump families: a phone that answered a
    // press by laying itself out for a desktop would be a control that moved the bar out of reach.
    for (const layout of TABLE_LAYOUTS) {
      const other = nextLayout(layout);
      expect(other.tight).toBe(!layout.tight);
      expect(other.fit.h > other.fit.w * 1.2).toBe(layout.fit.h > layout.fit.w * 1.2);
      expect(nextLayout(other)).toBe(layout);
    }
  });

  it("layout.the-spacing-is-not-part-of-the-table — starting again keeps it", () => {
    // The load-bearing one. On the snapshot's key, "start again" would silently throw the choice
    // away and undo would be able to walk back over it — neither is a move the player made.
    const store = fakeStore();
    storeLayout(store, densityName(TALL_TIGHT));
    expect(LAYOUT_KEY).not.toBe(SAVE_KEY);

    clearSave(store);

    expect(loadLayout(store)).toBe("tight");
  });

  it("layout.no-preference-is-nothing — not an empty name", () => {
    expect(loadLayout(fakeStore())).toBeUndefined();
    expect(loadLayout(browserStore(), "crossade/klondike/never-written")).toBeUndefined();
  });
});
