// WHERE THE GAME IS BEING PLAYED — and the whole of the difference between "inside a hub" and "on
// its own URL".
//
// Everything a running desk needs from the page around it is asked through this one object: which
// room the address names, how to write a new one back, what is laid over the region, and a clock.
// A game that took those from the hub directly could not be opened on its own; a game that takes
// them from here runs in both places with the same code, and this file is the proof — the default
// host below is the standalone one, and it is four small answers.

import type { DeskHost } from "./types.js";

/** The clock a desk borrows: a fling, a glide and the idle countdown all count frames on it. */
export interface DeskClock {
  join(tick: (seconds: number, dt: number) => boolean | void): () => void;
  stop(): void;
}

/**
 * A CLOCK OF ITS OWN, off `requestAnimationFrame` — what a page with no beat of its own gets.
 *
 * It runs only while somebody is joined: a desk standing still with nothing moving on it must not
 * hold a frame loop open, and a phone is where that is felt. A tick answering `true` leaves.
 */
export function frameClock(): DeskClock {
  const joined = new Set<(seconds: number, dt: number) => boolean | void>();
  let raf = 0;
  let last = 0;

  const step = (now: number): void => {
    const dt = last === 0 ? 0 : (now - last) / 1000;
    last = now;
    for (const tick of [...joined]) if (tick(now / 1000, dt) === true) joined.delete(tick);
    raf = joined.size > 0 ? requestAnimationFrame(step) : 0;
    if (raf === 0) last = 0;
  };

  return {
    join(tick) {
      joined.add(tick);
      if (raf === 0) raf = requestAnimationFrame(step);
      return () => {
        joined.delete(tick);
      };
    },
    stop() {
      joined.clear();
      if (raf !== 0) cancelAnimationFrame(raf);
      raf = 0;
      last = 0;
    },
  };
}

export interface BrowserHostOptions {
  /** What the desk is covered with until the seat is known — the page's own felt. */
  readonly cover: string;
  /** The clock, when the page already has one. A page with none gets `frameClock`. */
  readonly clock?: DeskClock;
  /** The query parameter the room code is carried in. `room` unless a page says otherwise. */
  readonly param?: string;
}

/**
 * THE PLAIN-BROWSER HOST — a game opened at its own URL.
 *
 * The room is a query parameter and not a hash fragment: a standalone game has no shelf to go back
 * to and no second place to be, so the fragment names nothing. The code is written back with
 * `replaceState`, never `pushState` — a table that renamed itself is not a place the reader
 * navigated to, and a Back button that undid it would take them out of the game they are sitting in.
 */
export function browserHost(o: BrowserHostOptions): DeskHost {
  const param = o.param ?? "room";
  const clock = o.clock ?? frameClock();
  return {
    room: () => new URLSearchParams(globalThis.location?.search ?? "").get(param) ?? undefined,
    setRoom(code) {
      const url = new URL(globalThis.location.href);
      url.searchParams.set(param, code);
      globalThis.history.replaceState(null, "", url);
    },
    // NOTHING IS OVER A PAGE THAT IS ONLY THIS GAME. A hub answers otherwise (`topInsetOfStage`).
    insets: () => ({ top: 0 }),
    clock: () => clock,
    cover: o.cover,
  };
}

/**
 * WHAT IS COVERING THE TOP OF THE DESK'S OWN REGION, in CSS pixels — handed to the kit
 * (`seats.insets`), which brings home in until the WHOLE desk fits under it (`homeZoom`). Without
 * it a phone with a short glass opened on a desk whose far rim was off the top of the screen.
 *
 * THE PAGE'S OWN STRIP IS NOT IN THIS NUMBER, and that is the point of MEASURING rather than adding
 * one up: the game's region already starts below the strip, so counting it here would take the same
 * band off the desk twice. What is here is whatever the page lays OVER that region.
 */
export function topInsetOf(container: Element, covers: readonly Element[]): number {
  const top = container.getBoundingClientRect().top;
  let inset = 0;
  for (const one of covers) {
    if (getComputedStyle(one).display === "none") continue;
    const box = one.getBoundingClientRect();
    if (box.height <= 0) continue;
    inset = Math.max(inset, box.bottom - top);
  }
  return inset;
}
