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
  layoutNamed,
  nextLayout,
  relayBoard,
  ROOMY,
  TABLE_LAYOUTS,
  TIGHT,
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
  it("layout.tight-is-actually-tighter — less air, and therefore a bigger card", () => {
    expect(TIGHT.pitch).toBeLessThan(ROOMY.pitch);
    expect(TIGHT.step).toBeLessThan(ROOMY.step);
    // The point of the whole feature: the screen is divided by a SMALLER box, so the unit grows.
    expect(TIGHT.fit.w).toBeLessThan(ROOMY.fit.w);
    expect(TIGHT.fit.h).toBeLessThan(ROOMY.fit.h);
  });

  it.each(TABLE_LAYOUTS.map((l) => [l.id, l] as const))("layout.%s-closes — nothing hangs over an edge", (_id, layout) => {
    // The columns fit the box the screen is divided by, or the outer column loses its edge.
    expect(spread(layout)).toBeLessThanOrEqual(layout.fit.w);
    // The bar fits that same box.
    expect(barWidth).toBeLessThanOrEqual(layout.fit.w);
    // The bar stands INSIDE the box…
    expect(layout.barY - CONTROL_H / 2).toBeGreaterThanOrEqual(-layout.fit.h / 2);
    // …and clear of the top row of cards, which is 1.4 tall and centred on `topY`.
    expect(layout.barY + CONTROL_H / 2).toBeLessThanOrEqual(layout.topY - 0.7);
  });

  it("layout.re-spacing-keeps-the-game — the slots move, the cards stay in them", () => {
    const board = buildBoard(ROOMY);
    // Put a card in a column, so there is a game to lose.
    const card = board.stock.children[51]!;
    remove(board.stock, card);
    add(board.tableau[3]!, card);
    const before = board.tableau.map((p) => p.children.length);

    relayBoard(board, TIGHT);

    expect(board.tableau.map((p) => p.children.length)).toEqual(before);
    expect(card.parent).toBe(board.tableau[3]);
    expect(board.stock.children.length + board.tableau[3]!.children.length).toBe(52);
    // …and the slots really did move.
    expect(seatOf(board.tableau[0]!).x).toBeCloseTo(columnsOf(TIGHT)[0]!, 6);
    expect(seatOf(board.stock).y).toBeCloseTo(TIGHT.topY, 6);
  });

  it("layout.an-unknown-spacing-is-the-spacious-one — an old preference is never a crash", () => {
    expect(layoutNamed("tight")).toBe(TIGHT);
    expect(layoutNamed("whatever-shipped-last-year")).toBe(ROOMY);
    expect(layoutNamed("")).toBe(ROOMY);
  });

  it("layout.the-control-offers-the-other-one — one press walks the ring", () => {
    expect(nextLayout(ROOMY)).toBe(TIGHT);
    expect(nextLayout(TIGHT)).toBe(ROOMY);
  });

  it("layout.the-spacing-is-not-part-of-the-table — starting again keeps it", () => {
    // The load-bearing one. On the snapshot's key, "start again" would silently throw the choice
    // away and undo would be able to walk back over it — neither is a move the player made.
    const store = fakeStore();
    storeLayout(store, TIGHT.id);
    expect(LAYOUT_KEY).not.toBe(SAVE_KEY);

    clearSave(store);

    expect(loadLayout(store)).toBe(TIGHT.id);
  });

  it("layout.no-preference-is-nothing — not an empty name", () => {
    expect(loadLayout(fakeStore())).toBeUndefined();
    expect(loadLayout(browserStore(), "crossade/klondike/never-written")).toBeUndefined();
  });
});
