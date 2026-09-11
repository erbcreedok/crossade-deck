// WHAT A PLAYER LOOKS AT WHILE SOMETHING IS ARRIVING.
//
// There are three waits, and they used to be three different nothings: the chunk downloading, the
// room answering, and the tree arriving. From the player's side they are one wait, so they get one
// screen — and the SAME screen the page itself shows before any of this has loaded (the hub's
// `index.html` draws the cross inline, because a loading screen that has to load is a
// contradiction). The two are kept identical by a guard, not by memory: `CROSS_PATH` below is the
// one the page must carry too.
//
// IT WAS THREE CARDS ONCE, and that was wrong the moment it was shown for a game with no cards in
// it: entering chess from the shelf, a player watched an ace, a king and a queen hop about. The
// mark is the product's, not one game's — a cross for everybody, and the LABEL says which game.
// Per-game icons come later; this is the default they will replace one at a time.

import { PALETTE } from "./palette.js";

/**
 * THE CROSS PATTÉE FROM THE DESIGN PROJECT — the crusader's cross, arms flaring to their tips, not
 * a plus. It is drawn there as two overlapping octagons (a vertical arm and a horizontal one) with
 * a half-size `a`, a waist `w = .16s` and a flared tip `f = .30s`; a line has to run the OUTLINE of
 * the two together, so those numbers are written here as the points of their union, clockwise.
 *
 * IT STARTS AT THE TOP, IN THE MIDDLE. The outline's own first corner is the top-LEFT of the upper
 * arm, and a line growing from there begins off to one side and creeps back at it — lopsided at
 * both ends. The top edge is cut in half at (50,0): the line leaves the crown and the closing
 * stroke brings it home to the same point.
 */
export const CROSS_PATH = "M50 0 L80 0 L66 34 L100 20 L100 80 L66 66 L80 100 L20 100 L34 66 L0 80 L0 20 L34 34 L20 0 Z";

/** The loop, and the four phases inside it — fill, hold, clear, hold. */
export const LOADING_MS = 1000;

/** One `<style>` for the document, however many screens are raised over its life. */
const SHEET_ID = "crossade-loading";

/**
 * The rules, written once. They are the same four phases the hub's own `index.html` carries inline;
 * the two are compared by a guard, because a screen that drifts from the page's own is a flicker at
 * the handover that nobody will trace back to here.
 */
const CSS = `
.crossade-loading {
  position: absolute; inset: 0; z-index: 7;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 20px;
  background: ${PALETTE.felt}; transition: opacity 220ms ease;
  pointer-events: auto; touch-action: none;
}
.crossade-loading.gone { opacity: 0; pointer-events: none; }
.crossade-loading svg { width: 96px; height: 96px; }
.crossade-loading .line {
  fill: none; stroke: ${PALETTE.danger}; stroke-width: 5;
  stroke-linecap: round; stroke-linejoin: round;
  stroke-dasharray: 0 1; animation: crusade ${LOADING_MS}ms infinite;
}
.crossade-loading .said {
  font: 600 13px/1.2 ui-sans-serif, system-ui, sans-serif;
  letter-spacing: .14em; text-transform: uppercase; color: ${PALETTE.inkDim};
}
@keyframes crusade {
  0%    { stroke-dasharray: 0 1; stroke-dashoffset: 0;  stroke-opacity: 1; animation-timing-function: cubic-bezier(.65, 0, .35, 1); }
  40%   { stroke-dasharray: 1 1; stroke-dashoffset: 0;  animation-timing-function: linear; }
  50%   { stroke-dasharray: 1 1; stroke-dashoffset: 0;  animation-timing-function: cubic-bezier(.65, 0, .35, 1); }
  89.5% { stroke-opacity: 1; }
  90%   { stroke-dasharray: 0 1; stroke-dashoffset: -1; stroke-opacity: 0; animation-timing-function: linear; }
  100%  { stroke-dasharray: 0 1; stroke-dashoffset: -1; stroke-opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .crossade-loading .line { animation: none; stroke-dasharray: none; }
}
`;

function installStyle(): void {
  if (document.getElementById(SHEET_ID)) return;
  const style = document.createElement("style");
  style.id = SHEET_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

export interface Loading {
  /**
   * The wait is over. The screen fades out and takes itself off the page; calling twice is not an
   * error, because every way a game can finish arriving ends by calling it.
   */
  done(): void;
  /** Whether it is still up — read by tests, and by whoever wonders if they already finished. */
  showing(): boolean;
}

/**
 * Cover `over` with the loading screen until `done()`.
 *
 * `label` is what is being waited for, in the player's own words — "Загружаю шахматы". It is not a
 * progress bar on purpose: a chunk gives no bytes-so-far worth reporting and a room gives none at
 * all, and a bar that invents its own progress is a lie the player learns to distrust.
 */
export function loadingCross(over: HTMLElement, label: string): Loading {
  installStyle();

  const sheet = document.createElement("div");
  sheet.className = "crossade-loading";
  sheet.innerHTML =
    `<svg viewBox="-8 -8 116 116" aria-hidden="true"><path class="line" pathLength="1" d="${CROSS_PATH}"/></svg>` +
    `<div class="said"></div>`;
  // THE LABEL AS TEXT, never as markup: it is a game's name today and a name somebody types
  // tomorrow, and a screen is not a place to find out that the difference matters.
  (sheet.lastElementChild as HTMLElement).textContent = label;
  over.appendChild(sheet);

  let up = true;
  return {
    done() {
      if (!up) return;
      up = false;
      sheet.classList.add("gone");
      // REMOVED AFTER THE FADE, not instead of it: taken off the page at once, the table appears
      // with a cut, and a cut reads as the page having reloaded rather than the game having opened.
      setTimeout(() => sheet.remove(), 240);
    },
    showing: () => up,
  };
}
