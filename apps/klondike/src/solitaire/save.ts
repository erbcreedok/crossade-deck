// THE TABLE, WRITTEN DOWN — one small record that serves BOTH the reload and the undo stack.
//
// They are the same question asked twice ("what did the table look like a moment ago?"), so they
// get one answer. A move log would be the other design: smaller, and wrong here — every entry would
// have to know how to run backwards, the uncovered card's flip would have to be remembered
// separately from the move that uncovered it, and the recycle of the waste would need its own
// inverse. A snapshot has no inverse to get wrong.
//
// It is CHEAP because a card is a name. The deck is fifty-two stable ids (`hearts-A`), so the whole
// table is a few hundred bytes of JSON — a hundred moves of history cost less than one card's
// picture. Nothing about geometry, poses, animation or look is in here: those are rebuilt from the
// rules of the table, and a save that remembered them would break the day a layout changed.
//
// THE KIT IS NOT INVOLVED, deliberately. A generic tree serializer would have to be told which
// fields are truth and which are appearance, and it would still not know that a face-down card in
// the stock is the same card as the face-up one in the waste. The game knows. This is the game's.

import { add, facing, remove, setFacing, type Node } from "game-kit";
import { type SolitaireBoard } from "./board.js";

/**
 * The version is a NUMBER THAT IS CHECKED, not decoration. The shape here will change — a second
 * layout, a score, a timer — and an old save read as a new one is a table with cards missing. A
 * mismatch is thrown away in silence and the player gets a fresh deal, which is the honest failure.
 */
export const SAVE_VERSION = 1;

/** One table, as names. Piles are bottom-first, exactly as the children are. */
export interface Snapshot {
  readonly v: number;
  /** Whether the opening triangle has been laid out. Not inferred: an undealt table and a recycled
   *  one can both have everything in the stock, and the difference decides what a press does. */
  readonly dealt: boolean;
  /** Pile id → the card ids it holds, bottom-first. */
  readonly piles: Readonly<Record<string, readonly string[]>>;
  /** Which cards are face-up. A set as a list, because JSON has no set. */
  readonly up: readonly string[];
}

/** What is kept between sessions: where the table is now, and how to walk back. */
export interface Save {
  readonly now: Snapshot;
  /** Older tables, oldest first. The undo stack, so a reload does not eat the player's history. */
  readonly past: readonly Snapshot[];
}

/**
 * How far back the history is kept. A snapshot is small, but "unbounded" is not a size — a table
 * left open for a week would grow a stack nobody will ever walk. Five hundred moves is longer than
 * any real game of Klondike and still under a hundred kilobytes.
 */
export const MAX_PAST = 500;

/** Every pile of a Klondike table, in the order a snapshot lists them. */
function pilesOf(board: SolitaireBoard): Node[] {
  return [board.stock, board.waste, ...board.foundations, ...board.tableau];
}

/** Write the table down. */
export function snapshot(board: SolitaireBoard, dealt: boolean): Snapshot {
  const piles: Record<string, string[]> = {};
  const up: string[] = [];
  for (const pile of pilesOf(board)) {
    piles[pile.id] = pile.children.map((c) => c.id);
    for (const c of pile.children) if (facing(c) === "up") up.push(c.id);
  }
  return { v: SAVE_VERSION, dealt, piles, up };
}

/**
 * Seat the table as the snapshot describes it. ALL OR NOTHING: the snapshot is checked against the
 * cards actually on the table first, and a single card missing, doubled or unknown leaves the board
 * untouched and returns `false`. A half-applied save is a table the player cannot finish and cannot
 * see is broken — worse by far than a fresh deal.
 */
export function applySnapshot(board: SolitaireBoard, snap: Snapshot): boolean {
  if (!fits(board, snap)) return false;
  const byId = new Map<string, Node>();
  for (const pile of pilesOf(board)) for (const c of pile.children) byId.set(c.id, c);
  const wantsUp = new Set(snap.up);
  for (const pile of pilesOf(board)) {
    for (const c of [...pile.children]) remove(pile, c);
  }
  for (const pile of pilesOf(board)) {
    for (const id of snap.piles[pile.id] ?? []) {
      const card = byId.get(id)!;
      setFacing(card, wantsUp.has(id) ? "up" : "down");
      add(pile, card);
    }
  }
  return true;
}

/** Does this snapshot describe THIS table — same version, same piles, every card once? */
function fits(board: SolitaireBoard, snap: Snapshot): boolean {
  if (!snap || snap.v !== SAVE_VERSION || typeof snap.dealt !== "boolean") return false;
  if (!snap.piles || typeof snap.piles !== "object" || !Array.isArray(snap.up)) return false;
  const here = new Set<string>();
  for (const pile of pilesOf(board)) for (const c of pile.children) here.add(c.id);
  const named = new Set<string>();
  for (const pile of pilesOf(board)) {
    const ids = snap.piles[pile.id];
    if (ids === undefined) return false; // a pile the save never heard of
    if (!Array.isArray(ids)) return false;
    for (const id of ids) {
      if (!here.has(id) || named.has(id)) return false; // unknown card, or the same card twice
      named.add(id);
    }
  }
  // A pile named by the save that this table does not have — a save from a different game.
  if (Object.keys(snap.piles).length !== pilesOf(board).length) return false;
  return named.size === here.size; // every card accounted for
}

// ---- the storage, behind a port ---------------------------------------------------------------

/**
 * Where a save lives. A PORT, the same shape as the kit's `TextMeasure`: the rule about what is
 * written is checkable in a plain test, and only the three lines that touch the browser are not.
 */
export interface Store {
  read(key: string): string | undefined;
  write(key: string, value: string): void;
  forget(key: string): void;
}

/** The key. Shared by the standalone game and the one inside the hub — it is the same table. */
export const SAVE_KEY = "crossade/klondike";

/**
 * The browser's own storage, wrapped so that it cannot take the game down.
 *
 * Every call can throw and each for its own reason: Safari's private mode refuses to write at all,
 * a full quota throws on write, and a page in a sandboxed frame throws on merely NAMING
 * `localStorage`. A game that dies because it could not save is worse than a game that does not
 * save, so every door here fails quiet.
 */
export function browserStore(): Store {
  const of = (): Storage | undefined => {
    try {
      return globalThis.localStorage;
    } catch {
      return undefined;
    }
  };
  return {
    read: (key) => {
      try {
        return of()?.getItem(key) ?? undefined;
      } catch {
        return undefined;
      }
    },
    write: (key, value) => {
      try {
        of()?.setItem(key, value);
      } catch {
        /* full, or refused — the game carries on unsaved */
      }
    },
    forget: (key) => {
      try {
        of()?.removeItem(key);
      } catch {
        /* nothing to do about it, and nothing worth breaking over */
      }
    },
  };
}

/** Read the save, or nothing. Anything unreadable is nothing — never a throw, never a half-table. */
export function loadSave(store: Store, key: string = SAVE_KEY): Save | undefined {
  const raw = store.read(key);
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return undefined;
    const save = parsed as Save;
    if (!save.now || save.now.v !== SAVE_VERSION) return undefined;
    const past = Array.isArray(save.past) ? save.past.filter((s) => s && s.v === SAVE_VERSION) : [];
    return { now: save.now, past };
  } catch {
    return undefined;
  }
}

/** Write the save. The history is trimmed to `MAX_PAST` from the RECENT end — the near past is what undo walks. */
export function storeSave(store: Store, save: Save, key: string = SAVE_KEY): void {
  const past = save.past.length > MAX_PAST ? save.past.slice(save.past.length - MAX_PAST) : save.past;
  store.write(key, JSON.stringify({ now: save.now, past }));
}

/** Forget the table entirely — what "start again" leaves behind. */
export function clearSave(store: Store, key: string = SAVE_KEY): void {
  store.forget(key);
}
