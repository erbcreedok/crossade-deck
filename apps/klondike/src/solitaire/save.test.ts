// THE LAWS THIS FILE EXISTS FOR: a saved table comes back EXACTLY, and a save that does not fit
// this table is refused WHOLE rather than applied in part.
//
// The second one is the load-bearing half. A half-applied save is a game with cards missing that
// looks perfectly normal — the player finds out twenty moves later, and the save that ate the game
// is still on disk, ready to eat the next one.

import { describe, expect, it } from "vitest";
import { add, facing, remove, setFacing, type Node } from "game-kit";
import { buildBoard, dealPlan, type SolitaireBoard } from "./board.js";
import {
  applySnapshot,
  clearSave,
  loadSave,
  MAX_PAST,
  SAVE_KEY,
  SAVE_VERSION,
  snapshot,
  storeSave,
  type Snapshot,
  type Store,
} from "./save.js";

/** A store in a Map — the port's whole point: the rule is checkable with no browser anywhere. */
function fakeStore(): Store & { readonly seen: Map<string, string> } {
  const seen = new Map<string, string>();
  return {
    seen,
    read: (k) => seen.get(k),
    write: (k, v) => void seen.set(k, v),
    forget: (k) => void seen.delete(k),
  };
}

/** A dealt table, so the tests read a real game rather than fifty-two cards in one heap. */
function dealt(): SolitaireBoard {
  const board = buildBoard();
  for (const step of dealPlan(board)) {
    remove(board.stock, step.card);
    setFacing(step.card, step.faceUp ? "up" : "down");
    add(board.tableau[step.col]!, step.card);
  }
  return board;
}

/** The table as plain text, piles and facings — what "the same table" MEANS, in one string. */
function readOut(board: SolitaireBoard): string {
  const piles = [board.stock, board.waste, ...board.foundations, ...board.tableau];
  return piles
    .map((p) => `${p.id}:${p.children.map((c: Node) => `${c.id}${facing(c) === "up" ? "^" : "v"}`).join(",")}`)
    .join("|");
}

describe("the klondike save", () => {
  it("save.a-table-comes-back-exactly — order and facing, card for card", () => {
    const board = dealt();
    const was = readOut(board);
    const snap = snapshot(board, true);

    // A DIFFERENT table, freshly shuffled, is what a reload actually gets — the save has to seat it,
    // not merely agree with the one it came from.
    const other = buildBoard();
    expect(applySnapshot(other, snap)).toBe(true);
    expect(readOut(other)).toBe(was);
  });

  it("save.an-undealt-table-is-not-a-recycled-one — `dealt` is remembered, not guessed", () => {
    // Both tables have all fifty-two in the stock and nothing on the tableau; only one of them has
    // had its opening triangle. Inferring it from the cards would deal the table a second time.
    const fresh = buildBoard();
    expect(snapshot(fresh, false).dealt).toBe(false);
    expect(snapshot(fresh, true).dealt).toBe(true);
  });

  it("save.a-save-that-does-not-fit-is-refused-whole — nothing is half-applied", () => {
    const board = dealt();
    const snap = snapshot(board, true);
    const victim = dealt();
    const before = readOut(victim);

    const broken = (patch: Partial<Snapshot>): Snapshot => ({ ...snap, ...patch });
    const oneCardShort = { ...snap.piles, "tableau:6": (snap.piles["tableau:6"] ?? []).slice(1) };
    const anImpostor = { ...snap.piles, "tableau:0": [...(snap.piles["tableau:0"] ?? []), "no-such-card"] };
    const twice = { ...snap.piles, "tableau:1": [...(snap.piles["tableau:1"] ?? []), snap.piles["tableau:2"]![0]!] };

    for (const bad of [
      broken({ v: SAVE_VERSION + 1 }),
      broken({ piles: oneCardShort }),
      broken({ piles: anImpostor }),
      broken({ piles: twice }),
      broken({ piles: { ...snap.piles, "tableau:0": undefined as unknown as string[] } }),
    ]) {
      expect(applySnapshot(victim, bad)).toBe(false);
      expect(readOut(victim), "the board was touched by a save that did not fit").toBe(before);
    }
  });

  it("save.unreadable-is-nothing — never a throw, never half a table", () => {
    const store = fakeStore();
    expect(loadSave(store)).toBeUndefined(); // nothing written yet
    for (const junk of ["", "{", "null", "[]", '{"now":{"v":999}}', '{"past":[]}']) {
      store.write(SAVE_KEY, junk);
      expect(loadSave(store)).toBeUndefined();
    }
  });

  it("save.what-was-written-is-what-comes-back — through JSON and out again", () => {
    const store = fakeStore();
    const board = dealt();
    const now = snapshot(board, true);
    storeSave(store, { now, past: [snapshot(buildBoard(), false)] });

    const back = loadSave(store)!;
    expect(back.now).toEqual(now);
    expect(back.past).toHaveLength(1);

    const other = buildBoard();
    expect(applySnapshot(other, back.now)).toBe(true);
    expect(readOut(other)).toBe(readOut(board));
  });

  it("save.history-is-trimmed-from-the-far-end — undo walks the NEAR past", () => {
    const store = fakeStore();
    const now = snapshot(buildBoard(), true);
    // Every entry NUMBERED, so the two ends cannot be mistaken for each other. A weaker marker (a
    // flag alternating every other entry) let a trim from the wrong end pass: both slices had the
    // same length and the same parity, so they compared equal while holding different history.
    // The storage layer reads nothing but `v`, so a numbered stand-in is exactly what it sees.
    const past = Array.from({ length: MAX_PAST + 10 }, (_v, i) => ({ ...now, piles: { move: [String(i)] } }));
    storeSave(store, { now, past });

    const back = loadSave(store)!;
    expect(back.past).toHaveLength(MAX_PAST);
    // The LAST entry survived — the one undo reaches first. Trimming the other end would throw away
    // the move the player is about to take back and keep the opening deal nobody will walk to.
    expect(back.past[back.past.length - 1]).toEqual(past[past.length - 1]);
    expect(back.past[0], "trimmed from the near end — undo would walk into the wrong history").toEqual(past[10]);
  });

  it("save.starting-again-leaves-nothing-behind", () => {
    const store = fakeStore();
    storeSave(store, { now: snapshot(buildBoard(), true), past: [] });
    clearSave(store);
    expect(loadSave(store)).toBeUndefined();
    expect(store.seen.size).toBe(0);
  });
});
