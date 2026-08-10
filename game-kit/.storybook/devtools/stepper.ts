// HOW A STORY'S CHECKS ARE PACED — the state machine, kept apart from the strip that wears it.
//
// The default is everything at once: opening a Tests page is the request to run its checks, and
// that stays true. Step mode is a READING pace, not a different suite: the run pauses AFTER each
// step, leaving on the glass whatever the step left there — "the square became a star" is worth
// looking at, and at full speed it is gone within a frame.
//
// Going BACK is a replay, never an undo. The scene is live and a step may feed it twenty trees,
// so the only honest way to stand after step N again is to run everything up to N from scratch,
// fast, and pause there. `fastForwardTo` is what carries that intent across the remount: module
// state survives a FORCE_REMOUNT (same document, same modules), while a page reload drops the
// whole map — a fresh visit runs at full speed, which is the default a first-time reader should
// meet. The Interactions panel keeps ticking either way: one body, two consumers, as everywhere
// in this section.

export type PaceMode = "all" | "step";

export interface Pace {
  readonly mode: PaceMode;
  /** Replay target: steps BEFORE this index run without pausing. */
  readonly fastForwardTo: number;
}

const DEFAULT: Pace = { mode: "all", fastForwardTo: 0 };
const PACES = new Map<string, Pace>();

export function paceOf(storyId: string): Pace {
  return PACES.get(storyId) ?? DEFAULT;
}

export function setPace(storyId: string, pace: Pace): void {
  PACES.set(storyId, pace);
}

/** Test seam. */
export function resetPaces(): void {
  PACES.clear();
}

/**
 * Whether the run stops AFTER this step. Never before one: a pause before a step would show the
 * PREVIOUS step's glass under the coming step's name, which is a report pointing at the wrong
 * picture.
 */
export function pausesAfter(pace: Pace, index: number): boolean {
  return pace.mode === "step" && index >= pace.fastForwardTo;
}

/** Where "back" replays to — or null at the first step, where there is nothing to go back to. */
export function backTarget(index: number): number | null {
  return index > 0 ? index - 1 : null;
}
