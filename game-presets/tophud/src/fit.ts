// WHAT GIVES WAY WHEN THE STRIP IS TOO NARROW — and it is always the same thing.
//
// THE NAME IS THE ONLY THING THAT SHORTENS. A room code cannot be cut (half a code is not a code)
// and an avatar cannot be cut in half; the way out keeps its place because on a phone that place is
// already taken by habit. A name, on the other hand, reads from its beginning.
//
// AND WHAT WILL NOT FIT IS TAKEN AWAY WHOLE, not cropped: a stub of a plate reads as broken markup,
// while a strip without a name reads as a strip without a name.

import type { TopHudLook } from "./look.js";

export interface FitAsk {
  /** The glass, in CSS pixels. */
  readonly glass: number;
  /** What the way out and the people are actually taking. Zero when there is none. */
  readonly backWidth: number;
  readonly peopleWidth: number;
  /** What the name and the room code TOGETHER would like — their own width, not the one they were given. */
  readonly titleWant: number;
}

export interface Fit {
  /** What is left for the name and the room code once nothing else has given anything up. */
  readonly room: number;
  /** The width the title is held to, or `undefined` when it already fits. */
  readonly titleMax: number | undefined;
  /** It did not fit even shortened, and is gone from the strip entirely. */
  readonly dropped: boolean;
}

export function fitTitle(ask: FitAsk, look: TopHudLook): Fit {
  const gaps = (ask.backWidth > 0 ? look.gap : 0) + (ask.peopleWidth > 0 ? look.gap : 0);
  const room = ask.glass - 2 * look.side - ask.backWidth - ask.peopleWidth - gaps;
  if (ask.titleWant <= room) return { room, titleMax: undefined, dropped: false };
  if (room < look.minTitle) return { room, titleMax: undefined, dropped: true };
  return { room, titleMax: room, dropped: false };
}

/** The most of the glass a name may ask for before anything else has been measured. */
export function nameCap(glass: number, look: TopHudLook): number {
  return Math.round(glass * look.nameShare);
}
